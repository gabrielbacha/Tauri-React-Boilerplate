// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { useDialogReturnFocus } from "./useDialogReturnFocus";

afterEach(cleanup);

it("returns focus to the opener or a fallback if the opener is gone", () => {
  const opener = document.createElement("button");
  const fallback = document.createElement("button");
  document.body.append(opener, fallback);
  const ref = createRef<HTMLElement>();
  Object.defineProperty(ref, "current", { value: fallback });
  const { result } = renderHook(() => useDialogReturnFocus(ref));
  opener.focus();
  result.current.onOpenAutoFocus();
  const event = { preventDefault: vi.fn<(...args: unknown[]) => void>() } as unknown as Event;
  result.current.onCloseAutoFocus(event);
  expect(document.activeElement).toBe(opener);
  opener.remove();
  result.current.onCloseAutoFocus(event);
  expect(document.activeElement).toBe(fallback);
  fallback.remove();
});
