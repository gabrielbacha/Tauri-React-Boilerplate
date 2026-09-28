// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SESSION_DRAFT_KEY, useSessionDraft } from "./useSessionDraft";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("session draft", () => {
  it("saves and restores a versioned draft", () => {
    const first = renderHook(() => useSessionDraft());
    act(() => first.result.current.setDraft("A saved note"));
    expect(first.result.current.dirty).toBe(true);
    act(() => expect(first.result.current.saveDraft()).toBe(true));
    expect(first.result.current.dirty).toBe(false);
    first.unmount();

    const restored = renderHook(() => useSessionDraft());
    expect(restored.result.current.draft).toBe("A saved note");
    expect(restored.result.current.dirty).toBe(false);
  });

  it("ignores invalid or obsolete stored data", () => {
    window.sessionStorage.setItem(SESSION_DRAFT_KEY, JSON.stringify({ version: 0, text: "old" }));
    const { result } = renderHook(() => useSessionDraft());
    expect(result.current.draft).toBe("");
  });
});

it("preserves current text and checkpoint when importing cannot persist", () => {
  const hook = renderHook(() => useSessionDraft());
  act(() => hook.result.current.setDraft("keep"));
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = () => {
    throw new Error("quota");
  };
  try {
    act(() => expect(hook.result.current.replaceDraft("incoming")).toBe(false));
    expect(hook.result.current.draft).toBe("keep");
    expect(hook.result.current.savedDraft).toBe("");
    expect(hook.result.current.dirty).toBe(true);
  } finally {
    Storage.prototype.setItem = original;
  }
});
