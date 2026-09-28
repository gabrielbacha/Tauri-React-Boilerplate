// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { DesktopApi } from "@/shared/desktop-api";

import ShortcutSettings from "./ShortcutSettings";
const state = vi.hoisted(() => ({
  record: vi.fn<(active: boolean) => Promise<void>>(),
  set: vi.fn<(id: string, binding: string | null) => Promise<unknown>>(),
  reset: vi.fn<(id?: string) => Promise<unknown>>(),
}));
vi.mock("../../context/DesktopContext", () => ({
  useDesktop: () => ({ preferences: { shortcuts: {} }, appInfo: { packaged: false } }),
}));
beforeEach(() => {
  state.record.mockReset().mockResolvedValue(undefined);
  state.set.mockReset().mockResolvedValue({});
  state.reset.mockReset().mockResolvedValue({});
  window.desktop = { shortcuts: state, window: { platform: "darwin" } } as unknown as DesktopApi;
});
afterEach(cleanup);
it("records without executing and restores focus after Escape", async () => {
  render(<ShortcutSettings />);
  const group = within(screen.getByRole("group", { name: "Toggle sidebar" }));
  fireEvent.click(group.getByRole("button", { name: "Edit Toggle sidebar shortcut" }));
  await waitFor(() => expect(group.getByRole("status")).toBeTruthy());
  fireEvent.keyDown(window, { key: "b", metaKey: true, shiftKey: true });
  expect(group.getByRole("status").textContent).toBe("⌘⇧B");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(state.set).not.toHaveBeenCalled();
  expect(state.record).toHaveBeenLastCalledWith(false);
  expect(document.activeElement).toBe(group.getByRole("button", { name: "Edit Toggle sidebar shortcut" }));
});
it("keeps an unsuccessful edit available for correction and releases capture on unmount", async () => {
  state.set.mockRejectedValue(new Error("Already assigned to Search commands…"));
  const { unmount } = render(<ShortcutSettings />);
  const group = within(screen.getByRole("group", { name: "Toggle sidebar" }));
  fireEvent.click(group.getByRole("button", { name: "Edit Toggle sidebar shortcut" }));
  await waitFor(() => expect(group.getByRole("status")).toBeTruthy());
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  fireEvent.click(group.getByRole("button", { name: "Save shortcut" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Already assigned"));
  expect(state.set).toHaveBeenCalledWith("toggleSidebar", "Mod+K");
  expect(group.getByRole("status").textContent).toBe("⌘K");
  unmount();
  expect(state.record).toHaveBeenLastCalledWith(false);
});
it("cancels recording when the window loses focus", async () => {
  render(<ShortcutSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Toggle sidebar shortcut" }));
  await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
  fireEvent.blur(window);
  expect(screen.queryByRole("status")).toBeNull();
  expect(state.record).toHaveBeenLastCalledWith(false);
});
