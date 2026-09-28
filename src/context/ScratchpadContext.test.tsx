// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesktopApi } from "@/shared/desktop-api";
import type { TextDocument } from "@/shared/workspace";

import { TooltipProvider } from "../components/ui/tooltip";
import { ScratchpadProvider, useScratchpad, useScratchpadActions } from "./ScratchpadContext";

vi.mock("./DirtyStateContext", () => ({ useDirtyState: vi.fn<() => void>() }));
const actionRender = vi.fn<() => void>();
let actions: ReturnType<typeof useScratchpadActions>;
const openText = vi.fn<() => Promise<TextDocument | null>>();
const saveText = vi.fn<DesktopApi["documents"]["saveText"]>();

function ActionsOnly() {
  const currentActions = useScratchpadActions();
  useLayoutEffect(() => {
    actions = currentActions;
  }, [currentActions]);
  actionRender();
  return null;
}
function Editor() {
  const { draft, dirty, setDraft } = useScratchpad();
  return (
    <>
      <textarea aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <output>{dirty ? "dirty" : "saved"}</output>
    </>
  );
}
function mount() {
  return render(
    <TooltipProvider>
      <ScratchpadProvider>
        <ActionsOnly />
        <Editor />
      </ScratchpadProvider>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  actionRender.mockClear();
  openText.mockReset().mockResolvedValue(null);
  saveText.mockReset().mockResolvedValue(null);
  window.desktop = {
    documents: {
      openText,
      saveText,
      list: async () => [],
      get: async () => null,
      create: async (input: { title: string; text: string }) => ({
        ...input,
        id: "id",
        revision: 1,
        createdAt: "",
        updatedAt: "",
      }),
      onChanged: () => () => {},
    },
    window: { getSession: async () => ({ documentId: null }), setSession: async () => {} },
  } as unknown as DesktopApi;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("scratchpad action subscriptions", () => {
  it("keeps action consumers stable and reads the latest draft and checkpoint", async () => {
    await act(async () => {
      mount();
    });
    const original = actions;
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "first" } });
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "latest" } });
    expect(actions).toBe(original);
    expect(actionRender).toHaveBeenCalledTimes(1);
    await act(async () => {
      expect(await original.saveDraft()).toBe(true);
    });
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "unsaved" } });
    act(() => original.discardDraft());
    expect((screen.getByLabelText("Draft") as HTMLTextAreaElement).value).toBe("latest");
    await act(() => original.exportText());
    expect(saveText).toHaveBeenLastCalledWith({ suggestedName: "scratchpad.txt", content: "latest" });
  });

  it("exports with the imported name and leaves the checkpoint unchanged", async () => {
    await act(async () => {
      mount();
    });
    const original = actions;
    openText.mockResolvedValueOnce({ displayName: "notes.md", content: "imported" });
    await act(() => original.importText());
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "edited" } });
    await act(() => original.exportText());
    expect(saveText).toHaveBeenLastCalledWith({ suggestedName: "notes.md", content: "edited" });
    expect(screen.getByText("dirty")).toBeTruthy();
    act(() => original.discardDraft());
    expect((screen.getByLabelText("Draft") as HTMLTextAreaElement).value).toBe("");
    expect(actions).toBe(original);
  });

  it("preserves unsaved text on cancellation, rejection, and declined replacement", async () => {
    await act(async () => {
      mount();
    });
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "keep" } });
    await act(() => actions.importText());
    openText.mockRejectedValueOnce(new Error("Invalid text"));
    await act(() => actions.importText());
    openText.mockResolvedValueOnce({ displayName: "new.txt", content: "replace" });
    await act(() => actions.importText());
    fireEvent.click(screen.getByRole("button", { name: "Keep current text" }));
    expect((screen.getByLabelText("Draft") as HTMLTextAreaElement).value).toBe("keep");
    expect(screen.getByText("dirty")).toBeTruthy();
  });

  it("preserves the draft when saving to SQLite fails", async () => {
    window.desktop.documents.create = async () => {
      throw new Error("Disk full");
    };
    await act(async () => {
      mount();
    });
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "keep this" } });
    await act(async () => {
      expect(await actions.saveDraft()).toBe(false);
    });
    expect((screen.getByLabelText("Draft") as HTMLTextAreaElement).value).toBe("keep this");
    expect(screen.getByText("dirty")).toBeTruthy();
  });
});
