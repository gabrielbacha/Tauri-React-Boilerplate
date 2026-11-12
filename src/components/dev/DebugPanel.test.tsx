// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const runtime = vi.hoisted(() => ({
  reads: vi.fn<() => Promise<null>>(() => Promise.resolve(null)),
  attach: vi.fn<() => Promise<() => void>>(),
  frames: [] as FrameRequestCallback[],
  callbacks: [] as (() => void)[],
  registrations: [] as ((dispose: () => void) => void)[],
  next: 0,
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, trackedEmit: vi.fn<() => void>() }));
vi.mock("@tauri-apps/api/app", () => ({
  getName: runtime.reads,
  getVersion: runtime.reads,
  getIdentifier: runtime.reads,
  getTauriVersion: runtime.reads,
}));
vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: runtime.reads,
  appConfigDir: runtime.reads,
  resourceDir: runtime.reads,
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ label: "fixture" }),
}));
vi.mock("@tauri-apps/api/window", () => ({
  currentMonitor: runtime.reads,
  getCurrentWindow: () => ({
    title: runtime.reads,
    innerSize: runtime.reads,
    outerSize: runtime.reads,
    outerPosition: runtime.reads,
    scaleFactor: runtime.reads,
    isVisible: runtime.reads,
    isFocused: runtime.reads,
    isMaximized: runtime.reads,
    isFullscreen: runtime.reads,
    isDecorated: runtime.reads,
    onFocusChanged: register,
    onResized: register,
    onMoved: register,
  }),
}));
vi.mock("@tauri-apps/plugin-log", () => ({ attachConsole: runtime.attach }));
function register(callback: () => void): Promise<() => void> {
  runtime.callbacks.push(callback);
  return new Promise((resolve) => runtime.registrations.push(resolve));
}
vi.mock("@/routes/router", () => ({
  router: {
    state: { location: { pathname: "/fixture", href: "/fixture", searchStr: "", hash: "" } },
    subscribe: () => () => undefined,
  },
}));
import { DebugPanel } from "./DebugPanel";
function toggle() {
  fireEvent.keyDown(window, { key: "d", metaKey: true });
}
async function frame() {
  await act(async () => {
    const callbacks = runtime.frames.splice(0);
    callbacks.forEach((callback) => callback(0));
  });
}
beforeEach(() => {
  runtime.reads.mockClear();
  runtime.attach.mockReset().mockResolvedValue(() => undefined);
  runtime.frames = [];
  runtime.callbacks = [];
  runtime.registrations = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    runtime.frames.push(callback);
    return ++runtime.next;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn<() => void>());
  vi.stubGlobal(
    "matchMedia",
    vi.fn<() => MediaQueryList>(
      () =>
        ({
          matches: false,
          addEventListener: vi.fn<() => void>(),
          removeEventListener: vi.fn<() => void>(),
        }) as unknown as MediaQueryList,
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("does no closed-panel window reads or location polling and coalesces event storms", async () => {
  const interval = vi.spyOn(window, "setInterval");
  render(<DebugPanel />);
  await act(async () => {
    fireEvent(window, new Event("resize"));
    fireEvent(window, new Event("hashchange"));
  });
  expect(runtime.reads).not.toHaveBeenCalled();
  expect(runtime.callbacks).toHaveLength(0);
  expect(interval).not.toHaveBeenCalled();
  toggle();
  await frame();
  runtime.reads.mockClear();
  act(() => {
    for (let i = 0; i < 100; i++) runtime.callbacks[2]();
  });
  expect(runtime.reads).not.toHaveBeenCalled();
  await frame();
  expect(runtime.reads).toHaveBeenCalledTimes(11);
  toggle();
  runtime.reads.mockClear();
  act(() => runtime.callbacks[2]());
  await frame();
  expect(runtime.reads).not.toHaveBeenCalled();
});
it("disposes registrations and console attachment that finish after close", async () => {
  let attach!: (dispose: () => void) => void;
  runtime.attach.mockReturnValue(
    new Promise<() => void>((resolve) => {
      attach = resolve;
    }),
  );
  const view = render(<DebugPanel />);
  toggle();
  expect(runtime.registrations).toHaveLength(3);
  toggle();
  const listeners = [vi.fn<() => void>(), vi.fn<() => void>(), vi.fn<() => void>()];
  await act(async () => runtime.registrations.forEach((resolve, i) => resolve(listeners[i])));
  listeners.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  view.unmount();
  const detach = vi.fn<() => void>();
  await act(async () => attach(detach));
  expect(detach).toHaveBeenCalledTimes(1);
});
