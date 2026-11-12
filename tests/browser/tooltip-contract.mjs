import assert from "node:assert/strict";
import { createRequire } from "node:module";
const [base, playwrightPackage, platform = "darwin"] = process.argv.slice(2);
if (!["darwin", "win32", "linux"].includes(platform)) throw new Error("Choose a generated platform contract.");
if (!base || !["127.0.0.1", "localhost", "::1"].includes(new URL(base).hostname))
  throw new Error("Use the owned loopback preview URL.");
if (!playwrightPackage)
  throw new Error("Provide an existing pinned Playwright package.json path; this script installs nothing.");
const { chromium } = createRequire(playwrightPackage)("@playwright/test");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1300, height: 900 } });
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort(),
);
await context.addInitScript(
  ({ platform: fixturePlatform }) => {
    const callbacks = new Map(),
      listeners = new Map();
    let next = 1;
    const preferences = {
      shortcuts: {},
      zoom: 1,
      motion: "reduced",
      theme: "light",
      sidebarCollapsed: false,
      checkForUpdatesAutomatically: false,
      restoreWindows: false,
    };
    const documents = Array.from({ length: 10 }, (_, index) => ({
      id: `550e8400-e29b-41d4-a716-${String(index).padStart(12, "0")}`,
      title: `Fixture ${index}`,
      text: "",
      revision: 1,
      createdAt: "2026-11-11T00:00:00Z",
      updatedAt: "2026-11-11T00:00:00Z",
    }));
    const state = {
      createCount: 0,
      saveCount: 0,
      failList: false,
      ignoreDirty: false,
      dirty: [],
      session: { route: "/", documentId: null },
      reloadCount: 0,
      importText: "😀".repeat(6000),
    };
    const emit = (name, payload) => {
      for (const [id, entry] of listeners)
        if (entry.event === name) callbacks.get(entry.handler)?.({ event: name, id, payload });
    };
    window.reviewFixture = { state, emit, documents };
    // eslint-disable-next-line no-underscore-dangle -- Match the Tauri SDK reserved host contract.
    window.__TAURI_OS_PLUGIN_INTERNALS__ = {
      platform: fixturePlatform === "darwin" ? "macos" : fixturePlatform === "win32" ? "windows" : "linux",
      arch: "aarch64",
      eol: "\n",
      family: "unix",
    };
    // eslint-disable-next-line no-underscore-dangle -- Match the Tauri SDK reserved host contract.
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "window-fixture" }, currentWebview: { label: "window-fixture" } },
      transformCallback: (callback) => {
        const id = next++;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback: (id) => callbacks.delete(id),
      invoke: async (command, args = {}) => {
        if (command === "plugin:event|listen") {
          const id = next++;
          listeners.set(id, args);
          return id;
        }
        if (command === "plugin:event|unlisten") {
          listeners.delete(args.eventId);
          return null;
        }
        if (command === "plugin:event|emit") {
          emit(args.event, args.payload);
          return null;
        }
        if (command === "app_get_info")
          return {
            name: "Tauri App",
            description: "Synthetic review fixture",
            version: "1.0.0",
            platform: fixturePlatform,
            arch: "arm64",
            packaged: false,
            protocol: "tauri-app",
          };
        if (command === "preferences_get" || command === "preferences_migrate_interface") return { ...preferences };
        if (command === "preferences_update") {
          Object.assign(preferences, args.patch);
          emit("preferences-changed", { ...preferences });
          return { ...preferences };
        }
        if (command === "tasks_list") return [];
        if (command === "permissions_list")
          return ["notifications", "camera", "microphone"].map((capability) => ({ capability, decision: "prompt" }));
        if (command === "updates_get_state") return { status: "idle" };
        if (command === "window_get_session") return { ...state.session };
        if (command === "window_set_session") {
          Object.assign(state.session, args.patch);
          return null;
        }
        if (command === "deep_links_get_protocol") return "tauri-app";
        if (command === "documents_list") {
          if (state.failList) {
            state.failList = false;
            throw new Error("synthetic list failure");
          }
          return documents
            .slice(args.offset ?? 0, (args.offset ?? 0) + (args.limit ?? 100))
            .map(({ text: _text, ...summary }) => summary);
        }
        if (command === "documents_get") return documents.find((candidate) => candidate.id === args.id) ?? null;
        if (command === "documents_create") {
          const doc = {
            ...args.input,
            id: crypto.randomUUID(),
            revision: 1,
            createdAt: "2026-11-11T01:00:00Z",
            updatedAt: "2026-11-11T01:00:00Z",
          };
          documents.unshift(doc);
          state.createCount++;
          emit("documents-changed", doc.id);
          return doc;
        }
        if (command === "documents_save") {
          state.saveCount++;
          const doc = documents.find((candidate) => candidate.id === args.id);
          if (!doc || doc.revision !== args.revision) return { status: "conflict", document: doc ?? null };
          Object.assign(doc, args.input, { revision: doc.revision + 1 });
          emit("documents-changed", doc.id);
          return { status: "saved", document: doc };
        }
        if (command === "documents_open_text") return { displayName: "unicode-fixture.txt", content: state.importText };
        if (command === "lifecycle_set_dirty_state") {
          if (!state.ignoreDirty) state.dirty = args.dirty.sources;
          return null;
        }
        if (command === "diagnostics_reload") {
          emit("interruption-requested", {
            id: "550e8400-e29b-41d4-a716-446655440000",
            kind: "reload",
            dirtySources: state.dirty,
            activeTaskCount: 0,
          });
          return null;
        }
        if (command === "lifecycle_resolve_interruption") {
          if (args.proceed) state.reloadCount++;
          return null;
        }
        if (command === "plugin:window|is_maximized") return false;
        if (command === "plugin:window|inner_size" || command === "plugin:window|outer_size")
          return { width: 1300, height: 900 };
        if (command === "plugin:window|inner_position" || command === "plugin:window|outer_position")
          return { x: 0, y: 0 };
        if (command === "plugin:window|scale_factor") return 1;
        return null;
      },
    };
  },
  { platform },
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(base);
  const draft = page.getByRole("textbox", { name: "Scratchpad draft" });
  await draft.waitFor();
  await page.getByRole("textbox", { name: "Document title" }).fill("Generated tooltip command");
  await draft.fill("Generated original text");
  const command = async (id, key) => {
    if (platform === "darwin")
      await page.evaluate((commandId) => window.reviewFixture.emit("command-run", commandId), id);
    else await page.keyboard.press(key);
  };
  const hover = async () => {
    await page.getByRole("button", { name: "More actions", exact: true }).hover();
    await page.getByRole("tooltip").waitFor();
  };
  await hover();
  await command("saveSession", "Control+s");
  await page.waitForFunction(() => window.reviewFixture.state.createCount === 1);
  assert.equal(await page.evaluate(() => window.reviewFixture.state.createCount), 1);
  await draft.fill("Generated changed text");
  await hover();
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("menu").waitFor();
  await command("saveSession", "Control+s");
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => window.reviewFixture.state.saveCount), 0);
  await page.keyboard.press("Escape");
  await hover();
  await command("commandPalette", "Control+k");
  await page.getByRole("dialog", { name: "Commands" }).waitFor();
  await command("saveSession", "Control+s");
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => window.reviewFixture.state.saveCount), 0);
  await page.keyboard.press("Escape");
  await hover();
  await command("saveSession", "Control+s");
  await page.waitForFunction(() => window.reviewFixture.state.saveCount === 1);
  assert.equal(await page.evaluate(() => window.reviewFixture.state.saveCount), 1);
  await hover();
  await command("settings", "Control+,");
  await page.getByRole("searchbox", { name: "Search settings" }).waitFor();
  assert.deepEqual(errors, []);
  const folder = "/private/tmp/boilerplate-resume-2026-11-12";
  await page.screenshot({ path: folder + "/tauri-tooltip-" + platform + ".png" });
  console.log(
    JSON.stringify({
      platform,
      delivery: platform === "darwin" ? "generated SDK event" : "generated browser key event",
      realTooltip: true,
      createCount: 1,
      saveCount: 1,
      menuAndDialogBlocked: true,
      settingsNavigation: true,
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
