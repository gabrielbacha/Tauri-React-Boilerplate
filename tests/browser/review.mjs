import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const [base, playwrightPackage] = process.argv.slice(2);
if (!base || !["127.0.0.1", "localhost", "::1"].includes(new URL(base).hostname))
  throw new Error("Use the owned loopback preview URL.");
if (!playwrightPackage)
  throw new Error("Provide an existing pinned Playwright package.json path; this script installs nothing.");
const { chromium } = createRequire(playwrightPackage)("playwright");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1300, height: 900 } });
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort(),
);
await context.addInitScript(() => {
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
  window.__TAURI_OS_PLUGIN_INTERNALS__ = { platform: "macos", arch: "aarch64", eol: "\n", family: "unix" };
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
          platform: "darwin",
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
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(base);
  const draft = page.getByRole("textbox", { name: "Scratchpad draft" });
  await draft.waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Import text…", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Scratchpad draft"]').value.length === 12000);
  assert.equal(await draft.inputValue(), "😀".repeat(6000));
  await page.evaluate(() => {
    window.reviewFixture.state.failList = true;
  });
  await page.getByRole("button", { name: "Save document", exact: true }).click();
  await page.waitForFunction(
    () => window.reviewFixture.state.createCount === 1 && window.reviewFixture.state.session.documentId !== null,
  );
  await page.getByRole("status").filter({ hasText: "Saved to this device" }).waitFor();
  assert.equal(await page.evaluate(() => window.reviewFixture.state.createCount), 1);
  await page.getByRole("button", { name: "Retry list", exact: true }).click();
  await page.getByRole("button", { name: "Retry list", exact: true }).waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => window.reviewFixture.state.createCount), 1);
  await page.evaluate(() => {
    window.reviewFixture.state.ignoreDirty = true;
    window.reviewFixture.state.dirty = [];
  });
  await draft.fill("preserve unacknowledged draft");
  await page.evaluate(() => window.desktop.diagnostics.reload());
  const dialog = page.getByRole("dialog", { name: "Reload and interrupt current work?" });
  await dialog.waitFor();
  assert.match(await dialog.textContent(), /Unsaved edits will be discarded/);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await draft.inputValue(), "preserve unacknowledged draft");
  assert.equal(await page.evaluate(() => window.reviewFixture.state.reloadCount), 0);
  await draft.fill("");
  await page.getByRole("button", { name: "Save document", exact: true }).click();
  await page.getByRole("button", { name: "Saved documents", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search saved documents" });
  await search.fill("Fixture 1");
  const previous = await page.evaluate(() => window.reviewFixture.state.session.documentId);
  await search.evaluate((input) =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })),
  );
  assert.equal(await page.evaluate(() => window.reviewFixture.state.session.documentId), previous);
  await search.press("Enter");
  await page.waitForFunction(
    (selectedBefore) => window.reviewFixture.state.session.documentId !== selectedBefore,
    previous,
  );
  await page.getByRole("status").filter({ hasText: "Saved to this device" }).waitFor();
  await page
    .getByText("Unable to refresh the list. Saved changes are preserved.", { exact: true })
    .waitFor({ state: "hidden" });
  await mkdir(".cache/review", { recursive: true });
  await page.screenshot({ path: ".cache/review/tauri-synthetic.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS rendered Unicode import, committed-write/list-failure, unacknowledged-draft reload, and IME selection",
  );
} finally {
  await context.close();
  await browser.close();
}
