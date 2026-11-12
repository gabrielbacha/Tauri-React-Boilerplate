// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { DocumentAdapter, SavedDocument } from "./documents";
import { useSavedDocument } from "./useSavedDocument";
afterEach(cleanup);
const doc = (id = "a", revision = 1): SavedDocument => ({
  id,
  title: id,
  text: "saved",
  revision,
  createdAt: "now",
  updatedAt: "now",
});
function fixture(ready?: () => Promise<void>) {
  let changed!: (id: string) => void;
  const api: DocumentAdapter = {
    ready,
    documents: {
      list: vi.fn<DocumentAdapter["documents"]["list"]>(async () => []),
      get: vi.fn<DocumentAdapter["documents"]["get"]>(async () => doc()),
      create: vi.fn<DocumentAdapter["documents"]["create"]>(async () => doc()),
      save: vi.fn<DocumentAdapter["documents"]["save"]>(async () => ({ status: "saved", document: doc("a", 2) })),
      delete: vi.fn<DocumentAdapter["documents"]["delete"]>(async () => true),
      onChanged: vi.fn<DocumentAdapter["documents"]["onChanged"]>((listener) => {
        changed = listener;
        return vi.fn<() => void>();
      }),
    },
    window: {
      getSession: vi.fn<DocumentAdapter["window"]["getSession"]>(async () => ({ documentId: null })),
      setSession: vi.fn<DocumentAdapter["window"]["setSession"]>(async () => {}),
    },
  };
  const toast = { error: vi.fn<(message: string) => void>(), info: vi.fn<(message: string) => void>() };
  const hook = renderHook(() => useSavedDocument(api, toast));
  return { api, toast, hook, changed: (id: string) => changed(id) };
}
it("create stays committed after failed list refresh and does not duplicate own invalidation", async () => {
  const x = fixture();
  await waitFor(() => expect(x.hook.result.current.busy).toBe(false));
  vi.mocked(x.api.documents.list).mockClear().mockRejectedValue(new Error("list"));
  vi.mocked(x.api.documents.create).mockImplementation(async () => {
    x.changed("a");
    return doc();
  });
  act(() => x.hook.result.current.setDraft("new"));
  let saved = false;
  await act(async () => {
    saved = await x.hook.result.current.saveDraft();
  });
  expect(saved).toBe(true);
  expect(x.hook.result.current.document?.id).toBe("a");
  expect(x.api.documents.create).toHaveBeenCalledOnce();
  expect(x.api.documents.list).toHaveBeenCalledOnce();
  expect(x.toast.error).toHaveBeenCalledWith(expect.stringContaining("refresh the list"));
});
it("delete success is retained when subsequent list loading fails", async () => {
  const x = fixture();
  await waitFor(() => expect(x.hook.result.current.busy).toBe(false));
  await act(async () => {
    await x.hook.result.current.saveAsNew();
  });
  vi.mocked(x.api.documents.list).mockRejectedValue(new Error("list"));
  let deleted = false;
  await act(async () => {
    deleted = await x.hook.result.current.deleteDocument();
  });
  expect(deleted).toBe(true);
  expect(x.hook.result.current.document).toBe(null);
  expect(x.api.documents.delete).toHaveBeenCalledOnce();
});
it("a delayed startup list cannot overwrite a newer event result", async () => {
  let old!: (rows: SavedDocument[]) => void;
  const x = fixture(); // startup has already called list; replace the subsequent requests below.
  await waitFor(() => expect(x.hook.result.current.busy).toBe(false));
  vi.mocked(x.api.documents.list)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          old = resolve;
        }),
    )
    .mockResolvedValue([doc("new")]);
  await act(async () => {
    x.changed("old");
  });
  await act(async () => {
    x.changed("new");
  });
  expect(x.hook.result.current.documents.map((r) => r.id)).toEqual(["new"]);
  await act(async () => {
    old([doc("old")]);
  });
  expect(x.hook.result.current.documents.map((r) => r.id)).toEqual(["new"]);
});
it("pagination refreshes loaded depth as one range and coalesces invalidations", async () => {
  const x = fixture();
  await waitFor(() => expect(x.hook.result.current.busy).toBe(false));
  const rows = Array.from({ length: 200 }, (_, i) => doc(String(i)));
  vi.mocked(x.api.documents.list).mockResolvedValue(rows);
  await act(async () => {
    await x.hook.result.current.loadMore();
  });
  expect(x.api.documents.list).toHaveBeenLastCalledWith(0, 200);
  vi.mocked(x.api.documents.list).mockClear();
  await act(async () => {
    x.changed("one");
    x.changed("two");
    x.changed("three");
  });
  expect(x.api.documents.list).toHaveBeenCalledOnce();
  expect(x.api.documents.list).toHaveBeenLastCalledWith(0, 200);
  expect(x.hook.result.current.documents).toHaveLength(200);
});

it("initial read is not pending write; actual mutation stays pending until acknowledgement", async () => {
  const x = fixture();
  expect(x.hook.result.current.pendingWrite).toBe(false);
  await waitFor(() => expect(x.hook.result.current.busy).toBe(false));
  let complete!: (value: SavedDocument) => void;
  vi.mocked(x.api.documents.create).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  let saved!: Promise<boolean>;
  act(() => {
    saved = x.hook.result.current.saveAsNew();
  });
  expect(x.hook.result.current.pendingWrite).toBe(true);
  await act(async () => {
    complete(doc());
    await saved;
  });
  expect(x.hook.result.current.pendingWrite).toBe(false);
});

it("async event readiness completes before the initial document read", async () => {
  let resolve!: () => void;
  const registration = new Promise<void>((done) => {
    resolve = done;
  });
  const x = fixture(() => registration);
  expect(x.api.documents.list).not.toHaveBeenCalled();
  expect(x.hook.result.current.busy).toBe(true);
  await act(async () => {
    resolve();
    await registration;
  });
  await waitFor(() => expect(x.hook.result.current.busy).toBe(false));
  expect(x.api.documents.list).toHaveBeenCalledOnce();
});

it("a read-only list retry clears its error and cannot repeat a committed create", async () => {
  const x = fixture();
  await waitFor(() => expect(x.hook.result.current.busy).toBe(false));
  vi.mocked(x.api.documents.list).mockRejectedValue(new Error("list"));
  await act(async () => {
    await x.hook.result.current.saveAsNew();
  });
  expect(x.hook.result.current.listError).toContain("refresh the list");
  vi.mocked(x.api.documents.list).mockResolvedValue([doc()]);
  await act(async () => {
    await x.hook.result.current.refreshDocuments();
  });
  expect(x.hook.result.current.listError).toBe(null);
  expect(x.api.documents.create).toHaveBeenCalledOnce();
  expect(x.hook.result.current.document?.id).toBe("a");
});

it("replays the selected document invalidation even when another ID arrives later", async () => {
  const x = fixture();
  await waitFor(() => expect(x.hook.result.current.busy).toBe(false));
  await act(async () => {
    await x.hook.result.current.saveAsNew();
  });
  let complete!: (value: { status: "saved"; document: SavedDocument }) => void;
  vi.mocked(x.api.documents.save).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  vi.mocked(x.api.documents.get).mockResolvedValue(doc("a", 3));
  let saving!: Promise<boolean>;
  act(() => {
    saving = x.hook.result.current.saveDraft();
  });
  await act(async () => {
    x.changed("a");
    x.changed("other");
    complete({ status: "saved", document: doc("a", 2) });
    await saving;
  });
  await waitFor(() => expect(x.hook.result.current.document?.revision).toBe(3));
});
