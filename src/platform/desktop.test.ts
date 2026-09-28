// @vitest-environment jsdom
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createDesktopApi, toDesktopPlatform } from "./desktop";

vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "macos" }));

const calls: { command: string; args: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  mockWindows("window-test");
  mockIPC(
    (command, args) => {
      calls.push({ command, args });
      if (command === "documents_list") return [];
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
    { command: "documents_list", args: { offset: null } },
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
  await vi.waitFor(async () => {
    await emit("documents-changed", "first");
    expect(received).toHaveBeenCalledWith("first");
  });
  unsubscribe();
  await emit("documents-changed", "second");
  expect(received).not.toHaveBeenCalledWith("second");
});
