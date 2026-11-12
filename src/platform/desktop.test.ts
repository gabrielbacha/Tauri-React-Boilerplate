// @vitest-environment jsdom
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { DesktopApi } from "@/shared/desktop-api";

import { createDesktopApi, toDesktopPlatform } from "./desktop";

const listenerState = vi.hoisted(() => ({ waiting: null as Promise<void> | null, fail: false, queued: false }));
vi.mock("@tauri-apps/api/webviewWindow", async (importOriginal) => {
  const original = await importOriginal<typeof import("@tauri-apps/api/webviewWindow")>();
  return {
    ...original,
    getCurrentWebviewWindow: () => {
      const current = original.getCurrentWebviewWindow();
      const listen = current.listen.bind(current);
      return Object.assign(current, {
        listen: async (...args: Parameters<typeof current.listen>) => {
          if (listenerState.waiting) await listenerState.waiting;
          if (listenerState.fail) throw new Error("Event registration failed");
          return listen(...args);
        },
      });
    },
  };
});

vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "macos" }));

const calls: { command: string; args: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  listenerState.waiting = null;
  listenerState.fail = false;
  listenerState.queued = false;
  mockWindows("window-test");
  mockIPC(
    (command, args) => {
      calls.push({ command, args });
      if (command === "documents_list") return [];
      if (command === "window_get_session") return { route: "/", documentId: null };
      if (command === "deep_links_ready" && listenerState.queued)
        return emit("deep-link-opened", { route: "settings" }).then(() => null);
      if (command === "app_get_info") return { name: "App", platform: "windows", arch: "x64" };
      if (command === "tasks_cancel") throw { kind: "not-found", message: "Background task not found." };
      return null;
    },
    { shouldMockEvents: true },
  );
});

afterEach(() => clearMocks());

it("maps bridge methods to generated commands and their argument names", async () => {
  const desktop = createDesktopApi();
  await desktop.documents.list();
  await desktop.shortcuts.reset();
  await desktop.permissions.reset("camera");
  await desktop.lifecycle.setDirtyState({ sources: ["Draft"] });
  expect(calls).toEqual([
    { command: "documents_list", args: { offset: null, limit: null } },
    { command: "shortcuts_reset", args: { id: null } },
    { command: "permissions_reset", args: { capability: "camera" } },
    { command: "lifecycle_set_dirty_state", args: { dirty: { sources: ["Draft"] } } },
  ]);
});

it("uses Node-style platform names", async () => {
  const desktop = createDesktopApi();
  expect(desktop.window.platform).toBe("darwin");
  expect((await desktop.app.getInfo()).platform).toBe("win32");
  expect(toDesktopPlatform("linux")).toBe("linux");
});

it("rejects with the error Rust returned", async () => {
  await expect(createDesktopApi().tasks.cancel("id")).rejects.toEqual({
    kind: "not-found",
    message: "Background task not found.",
  });
});

it("rejects zoom factors outside the supported range", () => {
  const desktop = createDesktopApi();
  expect(() => desktop.window.setZoomFactor(3)).toThrow(RangeError);
  expect(() => desktop.window.setZoomFactor(Number.NaN)).toThrow(RangeError);
});

it("delivers events until the subscription is removed", async () => {
  const desktop = createDesktopApi();
  const received = vi.fn<(id: string) => void>();
  const unsubscribe = desktop.documents.onChanged(received);
  await desktop.ready();
  await emit("documents-changed", "first");
  expect(received).toHaveBeenCalledWith("first");
  unsubscribe();
  await emit("documents-changed", "second");
  expect(received).not.toHaveBeenCalledWith("second");
});

it("delayed subscription keeps one queued startup intent until Ready", async () => {
  let release!: () => void;
  listenerState.waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  listenerState.queued = true;
  const desktop = createDesktopApi();
  const received = vi.fn<DesktopApi["deepLinks"]["onIntent"] extends (callback: infer C) => unknown ? C : never>();
  const unsubscribe = desktop.deepLinks.onIntent(received);
  await desktop.window.getSession();
  const ready = desktop.deepLinks.ready();
  await Promise.resolve();
  expect(calls.some(({ command }) => command === "deep_links_ready")).toBe(false);
  release();
  await ready;
  expect(received).toHaveBeenCalledTimes(1);
  expect(received).toHaveBeenCalledWith({ route: "settings" });
  unsubscribe();
});
it("failed registration prevents Ready and an explicit retry can register", async () => {
  listenerState.fail = true;
  const desktop = createDesktopApi();
  const received = vi.fn<(intent: unknown) => void>();
  const unsubscribe = desktop.deepLinks.onIntent(received);
  await expect(desktop.deepLinks.ready()).rejects.toThrow("Event registration failed");
  expect(calls.some(({ command }) => command === "deep_links_ready")).toBe(false);
  listenerState.fail = false;
  await expect(desktop.deepLinks.ready()).rejects.toThrow("Event registration failed");
  unsubscribe();
  listenerState.queued = true;
  const reloaded = createDesktopApi();
  const stop = reloaded.deepLinks.onIntent(received);
  await reloaded.deepLinks.ready();
  expect(received).toHaveBeenCalledOnce();
  stop();
});
