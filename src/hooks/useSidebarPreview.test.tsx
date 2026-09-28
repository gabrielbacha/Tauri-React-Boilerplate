// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useSidebarPreview } from "./useSidebarPreview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("delays hover, cancels accidental passes, and closes after pointer exit", () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useSidebarPreview(true));
  act(() => {
    result.current.enter();
    vi.advanceTimersByTime(100);
    result.current.cancel();
    vi.advanceTimersByTime(100);
  });
  expect(result.current.open).toBe(false);
  act(() => {
    result.current.enter();
    vi.advanceTimersByTime(150);
  });
  expect(result.current.open).toBe(true);
  act(() => {
    document.body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    vi.advanceTimersByTime(200);
  });
  expect(result.current.open).toBe(false);
  expect(result.current.present).toBe(true);
  act(() => vi.advanceTimersByTime(500));
  expect(result.current.present).toBe(false);
});
it("dismisses immediately when pinned or switched into narrow mode", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ enabled }) => useSidebarPreview(enabled), {
    initialProps: { enabled: true },
  });
  act(() => {
    result.current.enter();
    vi.advanceTimersByTime(150);
  });
  expect(result.current.open).toBe(true);
  rerender({ enabled: false });
  expect(result.current.open).toBe(false);
  expect(result.current.present).toBe(false);
});
