// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { DesktopApi } from "@/shared/desktop-api";
import type { SavedDocument } from "@/shared/persistence";

import { useSavedDocument } from "./useSavedDocument";

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), info: vi.fn<(message: string) => void>() },
}));

const saved: SavedDocument = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "Notes",
  text: "saved text",
  revision: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
let changed: (id: string) => void;
let documents: DesktopApi["documents"];

beforeEach(() => {
  documents = {
    list: vi.fn<DesktopApi["documents"]["list"]>().mockResolvedValue([saved]),
    get: vi.fn<DesktopApi["documents"]["get"]>().mockResolvedValue(saved),
    create: vi
      .fn<DesktopApi["documents"]["create"]>()
      .mockImplementation(async (input) => ({ ...saved, ...input, id: "copy" })),
    save: vi.fn<DesktopApi["documents"]["save"]>().mockResolvedValue({ status: "saved", document: saved }),
    delete: vi.fn<DesktopApi["documents"]["delete"]>().mockResolvedValue(true),
    openText: vi.fn<DesktopApi["documents"]["openText"]>().mockResolvedValue(null),
    saveText: vi.fn<DesktopApi["documents"]["saveText"]>().mockResolvedValue(null),
    onChanged: (callback) => {
      changed = callback;
      return vi.fn<() => void>();
    },
  };
  window.desktop = {
    documents,
    window: {
      getSession: vi.fn<DesktopApi["window"]["getSession"]>().mockResolvedValue({ documentId: saved.id, route: "/" }),
      setSession: vi.fn<DesktopApi["window"]["setSession"]>().mockResolvedValue(undefined),
    },
  } as unknown as DesktopApi;
});
afterEach(cleanup);

async function mount() {
  const hook = renderHook(useSavedDocument);
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  return hook;
}

it("keeps a draft on a stale revision and can save it as a new document", async () => {
  const { result } = await mount();
  const newer = { ...saved, text: "other window", revision: 2 };
  vi.mocked(documents.save).mockResolvedValue({ status: "conflict", document: newer });
  act(() => {
    result.current.setDraft("my edits");
    result.current.setTitle("My notes");
  });
  await act(async () => {
    expect(await result.current.saveDraft()).toBe(false);
  });
  expect(documents.save).toHaveBeenCalledWith(saved.id, 1, { title: "My notes", text: "my edits" });
  expect(result.current).toMatchObject({
    draft: "my edits",
    title: "My notes",
    dirty: true,
    conflict: true,
    busy: false,
  });
  await act(async () => {
    expect(await result.current.saveAsNew()).toBe(true);
  });
  expect(documents.create).toHaveBeenCalledWith({ title: "My notes", text: "my edits" });
  expect(result.current).toMatchObject({ draft: "my edits", dirty: false, conflict: false, document: { id: "copy" } });
});

it("keeps unsaved edits when another window deletes the document", async () => {
  const { result } = await mount();
  act(() => result.current.setDraft("keep this"));
  vi.mocked(documents.get).mockResolvedValue(null);
  vi.mocked(documents.list).mockResolvedValue([]);
  act(() => changed(saved.id));
  await waitFor(() => expect(result.current.conflict).toBe(true));
  expect(result.current).toMatchObject({ draft: "keep this", dirty: true, document: { id: saved.id } });
  await act(async () => {
    expect(await result.current.saveAsNew()).toBe(true);
  });
  expect(documents.create).toHaveBeenCalledWith({ title: saved.title, text: "keep this" });
});

it("clears a clean selection when another window deletes it", async () => {
  const { result } = await mount();
  vi.mocked(documents.get).mockResolvedValue(null);
  vi.mocked(documents.list).mockResolvedValue([]);
  act(() => changed(saved.id));
  await waitFor(() => expect(result.current.document).toBeNull());
  expect(result.current).toMatchObject({ draft: "", title: "Untitled", dirty: false, conflict: false });
});

it("preserves the draft and releases the action lock after a failed save", async () => {
  const { result } = await mount();
  act(() => result.current.setDraft("keep this"));
  vi.mocked(documents.save).mockRejectedValueOnce(new Error("Disk full"));
  await act(async () => {
    expect(await result.current.saveDraft()).toBe(false);
  });
  expect(result.current).toMatchObject({ draft: "keep this", dirty: true, busy: false });
  vi.mocked(documents.save).mockResolvedValue({
    status: "saved",
    document: { ...saved, text: "keep this", revision: 2 },
  });
  await act(async () => {
    expect(await result.current.saveDraft()).toBe(true);
  });
  expect(result.current).toMatchObject({ draft: "keep this", dirty: false, document: { revision: 2 } });
});

it("preserves the draft when deletion encounters a stale revision", async () => {
  const { result } = await mount();
  act(() => result.current.setDraft("keep this"));
  vi.mocked(documents.delete).mockResolvedValue(false);
  await act(async () => {
    expect(await result.current.deleteDocument()).toBe(false);
  });
  expect(result.current).toMatchObject({ draft: "keep this", dirty: true, conflict: true, document: { id: saved.id } });
});

it("ignores a stale refresh response after a newer document event", async () => {
  const { result } = await mount();
  let resolveOlder: (value: SavedDocument) => void = () => {};
  const older = new Promise<SavedDocument>((resolve) => {
    resolveOlder = resolve;
  });
  vi.mocked(documents.get)
    .mockReturnValueOnce(older)
    .mockResolvedValueOnce({ ...saved, text: "latest", revision: 3 });
  act(() => changed(saved.id));
  await waitFor(() => expect(documents.get).toHaveBeenCalledTimes(2));
  act(() => changed(saved.id));
  await waitFor(() => expect(result.current.draft).toBe("latest"));
  await act(async () => resolveOlder({ ...saved, text: "older", revision: 2 }));
  expect(result.current).toMatchObject({ draft: "latest", document: { revision: 3 } });
});
