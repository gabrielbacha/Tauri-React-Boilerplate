// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { CommandId } from "@/shared/commands";
import type { DesktopApi } from "@/shared/desktop-api";

import { createWorkspaceActions } from "../actions/workspace-actions";
import { useWorkspaceCommands } from "./useWorkspaceCommands";

const state = vi.hoisted(() => ({
  zoom: 1,
  update: vi.fn<(patch: { zoom: number }) => Promise<void>>(),
  save: vi.fn<() => boolean>(() => true),
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: vi.fn<() => Promise<void>>() }) }));
vi.mock("../context/DesktopContext", () => ({
  useDesktop: () => ({
    preferences: { zoom: state.zoom, shortcuts: {} },
    appInfo: { packaged: false },
    updatePreferences: state.update,
    checkForUpdates: vi.fn<() => Promise<void>>(),
  }),
}));
vi.mock("@/shared/features", () => ({ SHOWCASE_ENABLED: true }));
vi.mock("../context/ScratchpadContext", () => ({
  useOptionalScratchpadActions: () => ({ saveDraft: state.save }),
}));
afterEach(cleanup);
beforeEach(() => {
  state.zoom = 1;
  state.update.mockReset().mockResolvedValue(undefined);
  state.save.mockClear();
});

it("keeps one subscription, dispatches current handlers/preferences, and cleans up", () => {
  let dispatch!: (id: CommandId) => void;
  const unsubscribe = vi.fn<() => void>();
  const subscribe = vi.fn<(listener: typeof dispatch) => () => void>((listener) => {
    dispatch = listener;
    return unsubscribe;
  });
  window.desktop = { commands: { onCommand: subscribe }, window: { platform: "darwin" } } as unknown as DesktopApi;
  const first = vi.fn<() => void>();
  const second = vi.fn<() => void>();
  const { rerender, unmount } = renderHook(
    ({ toggle }) =>
      useWorkspaceCommands({
        actions: createWorkspaceActions({
          workspace: vi.fn<() => void>(),
          settings: vi.fn<() => void>(),
          commandPalette: vi.fn<() => void>(),
          toggleSidebar: toggle,
          toggleDetails: vi.fn<() => void>(),
        }),
        narrow: false,
        setSettingsCollapsed: vi.fn<(collapsed: boolean) => void>(),
        setReloadOpen: vi.fn<(open: boolean) => void>(),
        setAboutOpen: vi.fn<(open: boolean) => void>(),
        setShareOpen: vi.fn<(open: boolean) => void>(),
      }),
    { initialProps: { toggle: first } },
  );
  act(() => dispatch("toggleSidebar"));
  state.zoom = 1.25;
  rerender({ toggle: second });
  act(() => {
    dispatch("toggleSidebar");
    dispatch("zoomOut");
    dispatch("saveSession");
  });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  expect(state.update).toHaveBeenLastCalledWith({ zoom: 1.1 });
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(subscribe).toHaveBeenCalledTimes(1);
  expect(unsubscribe).not.toHaveBeenCalled();
  const modal = document.createElement("div");
  modal.setAttribute("role", "dialog");
  document.body.append(modal);
  act(() => dispatch("toggleSidebar"));
  expect(second).toHaveBeenCalledTimes(1);
  modal.remove();
  unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
