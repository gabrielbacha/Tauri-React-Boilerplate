import type * as Bindings from "./bindings";
import type { CommandId, ShortcutOverrides } from "./commands";
import type {
  DocumentSummary,
  DocumentWriteResult,
  SavedDocument,
  WindowSession,
  WindowSessionPatch,
} from "./persistence";
import type { KnownDestination, TextDocument } from "./workspace";

/**
 * Serde writes non-finite floats as `null`, so specta types every `f64` as `number | null`.
 * Rust never sends NaN or Infinity, so the bridge narrows those fields to `number` in one place.
 */
export type Finite<T> = [T] extends [number | null | undefined]
  ? [number] extends [T]
    ? Exclude<T, null>
    : T
  : T extends readonly (infer Item)[]
    ? Finite<Item>[]
    : T extends object
      ? { [Key in keyof T]: Finite<T[Key]> }
      : T;

export type DesktopPlatform = "darwin" | "win32" | "linux";
export type ThemeMode = Bindings.ThemeMode;
export type MotionPreference = Bindings.MotionPreference;
export type AppPreferences = Finite<Bindings.AppPreferences>;
export type PreferencesPatch = Finite<Bindings.PreferencesPatch>;
export type AppInfo = Omit<Bindings.AppInfo, "platform"> & { platform: DesktopPlatform };
export type DirtyState = Bindings.DirtyState;
export type InterruptionKind = Bindings.InterruptionKind;
export type InterruptionRequest = Bindings.InterruptionRequest;
export type PermissionCapability = Bindings.PermissionCapability;
export type PermissionDecision = Bindings.PermissionDecision;
export type PermissionStatus = Bindings.PermissionStatus;
export type DeepLinkIntent = Bindings.DeepLinkIntent;
export type BackgroundTaskStatus = Bindings.TaskStatus;
export type FileHashResult = Finite<Bindings.FileHashResult>;
export type BackgroundTask = Finite<Bindings.BackgroundTask>;
export type DiagnosticsSnapshot = Omit<Finite<Bindings.DiagnosticsSnapshot>, "app"> & { app: AppInfo };
export type UpdateState = Finite<Bindings.UpdateState>;
export type { ShortcutOverrides };

/**
 * The desktop bridge available to the interface as `window.desktop`.
 *
 * `src/platform/desktop.ts` implements it with the generated Tauri bindings. Methods that begin with
 * `on` subscribe to an event and return an unsubscribe function.
 */
export interface DesktopApi {
  documents: {
    list: (offset?: number) => Promise<DocumentSummary[]>;
    get: (id: string) => Promise<SavedDocument | null>;
    create: (input: { title: string; text: string }) => Promise<SavedDocument>;
    save: (id: string, revision: number, input: { title: string; text: string }) => Promise<DocumentWriteResult>;
    delete: (id: string, revision: number) => Promise<boolean>;
    onChanged: (callback: (id: string) => void) => () => void;
    openText: () => Promise<TextDocument | null>;
    saveText: (input: { suggestedName: string; content: string }) => Promise<{ displayName: string } | null>;
  };
  sharing: { copyWorkspaceSummary: (input: { draft: string }) => Promise<void> };
  links: { openKnownDestination: (id: KnownDestination) => Promise<void> };
  shortcuts: {
    set: (id: CommandId, binding: string | null) => Promise<AppPreferences>;
    reset: (id?: CommandId) => Promise<AppPreferences>;
    record: (active: boolean) => Promise<void>;
  };
  commands: { onCommand: (callback: (command: CommandId) => void) => () => void };
  app: {
    getInfo: () => Promise<AppInfo>;
  };
  preferences: {
    get: () => Promise<AppPreferences>;
    migrateInterface: (legacy: { zoom: number; motion: MotionPreference }) => Promise<AppPreferences>;
    update: (patch: PreferencesPatch) => Promise<AppPreferences>;
    onChanged: (callback: (preferences: AppPreferences) => void) => () => void;
  };
  window: {
    platform: DesktopPlatform;
    newWindow: () => Promise<void>;
    getSession: () => Promise<WindowSession>;
    setSession: (session: WindowSessionPatch) => Promise<void>;
    setZoomFactor: (factor: number) => void;
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
    quit: () => Promise<void>;
  };
  lifecycle: {
    setDirtyState: (state: DirtyState) => Promise<void>;
    resolveInterruption: (id: string, proceed: boolean) => Promise<void>;
    onInterruptionRequested: (callback: (request: InterruptionRequest) => void) => () => void;
  };
  updates: {
    getState: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    restart: () => Promise<void>;
    onStateChanged: (callback: (state: UpdateState) => void) => () => void;
  };
  tasks: {
    list: () => Promise<BackgroundTask[]>;
    copyDigest: (id: string) => Promise<void>;
    clearCompleted: () => Promise<void>;
    startFileHash: () => Promise<BackgroundTask | null>;
    cancel: (id: string) => Promise<void>;
    retry: (id: string) => Promise<BackgroundTask>;
    dismiss: (id: string) => Promise<void>;
    onChanged: (callback: (tasks: BackgroundTask[]) => void) => () => void;
  };
  permissions: {
    list: () => Promise<PermissionStatus[]>;
    request: (capability: PermissionCapability) => Promise<PermissionStatus>;
    reset: (capability?: PermissionCapability) => Promise<PermissionStatus[]>;
    onChanged: (callback: (permissions: PermissionStatus[]) => void) => () => void;
  };
  deepLinks: {
    getProtocol: () => Promise<string>;
    ready: () => Promise<void>;
    onIntent: (callback: (intent: DeepLinkIntent) => void) => () => void;
  };
  diagnostics: {
    get: () => Promise<DiagnosticsSnapshot>;
    copyReport: () => Promise<void>;
    openLogs: () => Promise<void>;
    reload: () => Promise<void>;
    resetPreferences: () => Promise<AppPreferences>;
  };
}
