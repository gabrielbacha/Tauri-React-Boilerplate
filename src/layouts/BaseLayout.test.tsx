// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesktopApi } from "@/shared/desktop-api";

import { TooltipProvider } from "../components/ui/tooltip";
import Layout from "./BaseLayout";
function BaseLayout({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <Layout>{children}</Layout>
    </TooltipProvider>
  );
}

const state = vi.hoisted(() => ({
  collapsed: false,
  pathname: "/",
  update: vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: state.pathname, search: {} }),
  useRouter: () => ({ navigate: vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined) }),
}));
vi.mock("../context/DesktopContext", () => ({
  useDesktop: () => ({
    preferences: { sidebarCollapsed: state.collapsed, theme: "light" },
    appInfo: { name: "Test app", version: "1.0.0" },
    permissions: [],
    resolvedTheme: "light",
    updateState: { status: "idle" },
    updatePreferences: state.update,
  }),
  useTasks: () => [],
}));

vi.mock("../context/ScratchpadContext", () => ({
  useOptionalScratchpadActions: () => ({
    draft: "",
    importText: vi.fn<() => void>(),
    exportText: vi.fn<() => void>(),
    saveDraft: () => true,
  }),
}));
beforeEach(() => {
  state.collapsed = false;
  state.pathname = "/";
  state.update.mockClear();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
  }));
  window.desktop = {
    commands: { onCommand: () => () => {} },
    window: { platform: "darwin" },
    diagnostics: {
      get: vi.fn<() => Promise<{ rendererHealth: string }>>().mockResolvedValue({ rendererHealth: "healthy" }),
    },
  } as unknown as DesktopApi;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shell keyboard focus", () => {
  it("keeps the same sidebar toggle mounted and focused through collapse", async () => {
    const { rerender } = render(<BaseLayout>Workspace</BaseLayout>);
    const close = screen.getByRole("button", { name: "Close sidebar" });
    close.focus();
    fireEvent.click(close);
    await waitFor(() => expect(state.update).toHaveBeenCalledWith({ sidebarCollapsed: true }));
    state.collapsed = true;
    rerender(<BaseLayout>Workspace</BaseLayout>);
    expect(screen.getByRole("button", { name: "Open sidebar" })).toBe(close);
    expect(document.activeElement).toBe(close);
  });

  it("dismisses the narrow sidebar with Escape and restores its toggle", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }));
    render(<BaseLayout>Workspace</BaseLayout>);
    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    expect(document.querySelector(".main-frame")?.hasAttribute("inert")).toBe(true);
    const menuTrigger = screen.getByRole("button", { name: "Open app menu" });
    menuTrigger.focus();
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
    fireEvent.keyDown(menuTrigger, { key: "Escape" });
    expect(document.querySelector(".main-frame")?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open sidebar" }));
  });

  it("returns focus to the details trigger after keyboard dismissal", async () => {
    render(<BaseLayout>Workspace</BaseLayout>);
    const toggle = screen.getByRole("button", { name: "Open details" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close details" })).toBe(toggle);
    expect(document.activeElement).toBe(toggle);
    const handle = within(screen.getByRole("complementary", { name: "Details" })).getByRole("separator", {
      name: "Resize details",
    });
    handle.focus();
    fireEvent.keyDown(handle, { key: "Escape" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open details" })).toBe(toggle);
      expect(document.activeElement).toBe(toggle);
    });
  });
});

it("opens settings navigation independently and restores the saved workspace collapse state", () => {
  state.collapsed = true;
  const { rerender } = render(<BaseLayout>Page</BaseLayout>);
  expect(screen.getByRole("button", { name: "Open sidebar" })).toBeTruthy();
  state.pathname = "/settings";
  rerender(<BaseLayout>Page</BaseLayout>);
  expect(screen.getByRole("navigation", { name: "Settings categories" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close sidebar" }));
  expect(state.update).not.toHaveBeenCalled();
  state.pathname = "/";
  rerender(<BaseLayout>Page</BaseLayout>);
  expect(screen.getByRole("button", { name: "Open sidebar" })).toBeTruthy();
});
