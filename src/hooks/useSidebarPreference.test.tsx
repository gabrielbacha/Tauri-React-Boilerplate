// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useSidebarPreference } from "./useSidebarPreference";

afterEach(cleanup);
it("updates immediately and serializes rapid toggles while a save is pending", async () => {
  let resolve = (): void => {};
  const persist = vi
    .fn<(value: boolean) => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue(undefined);
  const { result } = renderHook(() => useSidebarPreference(false, persist));
  act(() => {
    void result.current.set(true);
  });
  expect(result.current.collapsed).toBe(true);
  act(() => {
    void result.current.set(false);
  });
  expect(result.current.collapsed).toBe(false);
  expect(persist).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve();
  });
  await waitFor(() => expect(persist).toHaveBeenNthCalledWith(2, false));
  expect(result.current.collapsed).toBe(false);
});
it("rolls back to the confirmed preference when persistence fails", async () => {
  const persist = vi.fn<(value: boolean) => Promise<void>>().mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useSidebarPreference(false, persist));
  await act(async () => {
    await result.current.set(true);
  });
  expect(result.current.collapsed).toBe(false);
});
