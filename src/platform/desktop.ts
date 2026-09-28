import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { platform as osPlatform } from "@tauri-apps/plugin-os";

import { emitDebugEvent, serializeDebugValue, serializeError } from "@/components/dev/debug-events";
import { commands as generated, events } from "@/shared/bindings";
import type { AppInfo, DesktopApi, DesktopPlatform, Finite } from "@/shared/desktop-api";

type Commands = typeof generated;
type Target = ReturnType<typeof getCurrentWebviewWindow>;
type TypedEvent<T> = (target: Target) => { listen: (callback: (event: { payload: T }) => void) => Promise<UnlistenFn> };

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.5;

/** Rust never sends non-finite floats, so its `number | null` float fields are `number` here. See `Finite`. */
function finite<T>(value: Promise<T>): Promise<Finite<T>> {
  return value as Promise<Finite<T>>;
}

async function done(call: Promise<null>): Promise<void> {
  await call;
}

export function toDesktopPlatform(name: string): DesktopPlatform {
  if (name === "macos" || name === "darwin") return "darwin";
  if (name === "windows" || name === "win32") return "win32";
  return "linux";
}

function withPlatform<T extends { platform: string }>(info: T): Omit<T, "platform"> & { platform: DesktopPlatform } {
  return { ...info, platform: toDesktopPlatform(info.platform) };
}

/**
 * Listen to an event for this window and return a synchronous unsubscribe, as React effects expect.
 * Events sent to all windows and events sent only to this window both arrive.
 */
function subscribe<T>(event: TypedEvent<T>, target: Target, callback: (payload: T) => void): () => void {
  let active = true;
  let unlisten: UnlistenFn | undefined;
  void event(target)
    .listen(({ payload }) => {
      if (active) callback(payload);
    })
    .then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });
  return () => {
    active = false;
    unlisten?.();
  };
}

/** In development, report every command to the debug panel with its duration and result. */
function traced(commands: Commands): Commands {
  if (!import.meta.env.DEV) return commands;
  const entries = Object.entries(commands).map(([name, command]) => [
    name,
    async (...args: unknown[]) => {
      const startedAt = performance.now();
      const report = (status: "success" | "error", detail: { result?: unknown; error?: unknown }) =>
        emitDebugEvent({
          id: crypto.randomUUID(),
          kind: "invoke",
          command: name,
          args: serializeDebugValue(args),
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
          status,
          ...(status === "success"
            ? { result: serializeDebugValue(detail.result) }
            : { error: serializeError(detail.error) }),
          timestamp: new Date().toISOString(),
        });
      try {
        const result = await (command as (...values: unknown[]) => Promise<unknown>)(...args);
        report("success", { result });
        return result;
      } catch (error) {
        report("error", { error });
        throw error;
      }
    },
  ]);
  return Object.fromEntries(entries) as Commands;
}

/** Build the `window.desktop` bridge from the generated Tauri bindings. */
export function createDesktopApi(): DesktopApi {
  const commands = traced(generated);
  const current = getCurrentWebviewWindow();
  const on =
    <T>(event: TypedEvent<T>) =>
    (callback: (payload: T) => void) =>
      subscribe(event, current, callback);
  const onFinite =
    <T>(event: TypedEvent<T>) =>
    (callback: (payload: Finite<T>) => void) =>
      subscribe(event, current, (payload) => callback(payload as Finite<T>));

  return {
    documents: {
      list: (offset) => commands.documentsList(offset ?? null),
      get: (id) => commands.documentsGet(id),
      create: (input) => commands.documentsCreate(input),
      save: (id, revision, input) => commands.documentsSave(id, revision, input),
      delete: (id, revision) => commands.documentsDelete(id, revision),
      onChanged: on(events.documentsChanged),
      openText: () => commands.documentsOpenText(),
      saveText: (input) => commands.documentsSaveText(input),
    },
    sharing: { copyWorkspaceSummary: (input) => done(commands.sharingCopyWorkspaceSummary(input)) },
    links: { openKnownDestination: (destination) => done(commands.linksOpenKnownDestination(destination)) },
    shortcuts: {
      set: (id, binding) => finite(commands.shortcutsSet(id, binding)),
      reset: (id) => finite(commands.shortcutsReset(id ?? null)),
      record: (active) => done(commands.shortcutsRecord(active)),
    },
    commands: { onCommand: on(events.commandRun) },
    app: {
      getInfo: async (): Promise<AppInfo> => withPlatform(await commands.appGetInfo()),
    },
    preferences: {
      get: () => finite(commands.preferencesGet()),
      migrateInterface: (legacy) => finite(commands.preferencesMigrateInterface(legacy)),
      update: (patch) => finite(commands.preferencesUpdate(patch)),
      onChanged: onFinite(events.preferencesChanged),
    },
    window: {
      platform: toDesktopPlatform(osPlatform()),
      newWindow: () => done(commands.windowNew()),
      getSession: () => commands.windowGetSession(),
      setSession: (patch) => done(commands.windowSetSession(patch)),
      setZoomFactor: (factor) => {
        if (!Number.isFinite(factor) || factor < MIN_ZOOM || factor > MAX_ZOOM)
          throw new RangeError(`Zoom must be between ${MIN_ZOOM} and ${MAX_ZOOM}.`);
        void getCurrentWebview().setZoom(factor);
      },
      minimize: () => current.minimize(),
      toggleMaximize: () => current.toggleMaximize(),
      // Closing goes through Rust, which confirms unsaved work first.
      close: () => current.close(),
      quit: () => done(commands.windowQuit()),
    },
    lifecycle: {
      setDirtyState: (state) => done(commands.lifecycleSetDirtyState(state)),
      resolveInterruption: (id, proceed) => done(commands.lifecycleResolveInterruption(id, proceed)),
      onInterruptionRequested: on(events.interruptionRequested),
    },
    updates: {
      getState: () => finite(commands.updatesGetState()),
      check: () => finite(commands.updatesCheck()),
      restart: () => done(commands.updatesRestart()),
      onStateChanged: onFinite(events.updateStateChanged),
    },
    tasks: {
      list: () => finite(commands.tasksList()),
      copyDigest: (id) => done(commands.tasksCopyDigest(id)),
      clearCompleted: () => done(commands.tasksClearCompleted()),
      startFileHash: () => finite(commands.tasksStartFileHash()),
      cancel: (id) => done(commands.tasksCancel(id)),
      retry: (id) => finite(commands.tasksRetry(id)),
      dismiss: (id) => done(commands.tasksDismiss(id)),
      onChanged: onFinite(events.tasksChanged),
    },
    permissions: {
      list: () => commands.permissionsList(),
      request: (capability) => commands.permissionsRequest(capability),
      reset: (capability) => commands.permissionsReset(capability ?? null),
      onChanged: on(events.permissionsChanged),
    },
    deepLinks: {
      getProtocol: () => commands.deepLinksGetProtocol(),
      ready: () => done(commands.deepLinksReady()),
      onIntent: on(events.deepLinkOpened),
    },
    diagnostics: {
      get: async () => {
        const snapshot = await finite(commands.diagnosticsGet());
        return { ...snapshot, app: withPlatform(snapshot.app) };
      },
      copyReport: () => done(commands.diagnosticsCopyReport()),
      openLogs: () => done(commands.diagnosticsOpenLogs()),
      reload: () => done(commands.diagnosticsReload()),
      resetPreferences: () => finite(commands.diagnosticsResetPreferences()),
    },
  };
}

/** Install the bridge before the interface loads. Tests install their own mock instead. */
export function installDesktopApi(): void {
  Object.defineProperty(window, "desktop", { value: Object.freeze(createDesktopApi()), configurable: false });
}
