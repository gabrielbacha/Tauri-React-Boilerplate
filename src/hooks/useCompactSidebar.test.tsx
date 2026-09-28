// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCompactSidebar } from "./useCompactSidebar";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("compact sidebar", () => {
  it("compacts narrow windows without replacing the saved wide-window preference", () => {
    let onChange = (): void => {};
    const media = {
      matches: false,
      addEventListener: vi.fn<(event: string, listener: () => void) => void>((_event, fn) => {
        onChange = fn;
      }),
      removeEventListener: vi.fn<(event: string, listener: () => void) => void>(),
    };
    vi.stubGlobal("matchMedia", () => media);
    const { result, unmount } = renderHook(() => useCompactSidebar(false));
    expect(result.current.collapsed).toBe(false);
    act(() => {
      media.matches = true;
      onChange();
    });
    expect(result.current.collapsed).toBe(true);
    act(() => result.current.setNarrowOverride(false));
    expect(result.current.collapsed).toBe(false);
    act(() => {
      media.matches = false;
      onChange();
    });
    expect(result.current.collapsed).toBe(false);
    act(() => {
      media.matches = true;
      onChange();
    });
    expect(result.current.collapsed).toBe(true);
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", onChange);
  });
});
