// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { appConfig } from "../../package.json";
import { usePanelWidth } from "./usePanelWidth";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it("bounds corrupt stored widths and persists explicit resize/reset actions", () => {
  localStorage.setItem(`${appConfig.storageNamespace}:panel-width:v1:sidebar`, "NaN");
  const { result } = renderHook(() => usePanelWidth("sidebar", 275, 240));
  expect(result.current.width).toBe(275);
  act(() => result.current.commit(900));
  expect(result.current.width).toBe(520);
  expect(localStorage.getItem(`${appConfig.storageNamespace}:panel-width:v1:sidebar`)).toBe("520");
  act(() => result.current.reset());
  expect(result.current.width).toBe(275);
});
it("clamps to the viewport without destroying the preferred wide-window width", () => {
  vi.stubGlobal("innerWidth", 1440);
  const { result } = renderHook(() => usePanelWidth("sidebar", 275, 240));
  act(() => result.current.commit(520));
  act(() => {
    vi.stubGlobal("innerWidth", 800);
    window.dispatchEvent(new Event("resize"));
  });
  expect(result.current.width).toBe(400);
  act(() => {
    vi.stubGlobal("innerWidth", 1440);
    window.dispatchEvent(new Event("resize"));
  });
  expect(result.current.width).toBe(520);
});
