import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { DocumentSummary, SavedDocument, DocumentAdapter } from "./documents";
import { DEFAULT_TEXT_POLICY, textWithinLimits } from "./text-policy";

// Preserve the original final offset (1,000,000) plus its 100-row page.
const MAX_LOADED_DOCUMENTS = 1_000_100;

export interface SavedDocumentController {
  document: SavedDocument | null;
  documents: DocumentSummary[];
  draft: string;
  title: string;
  savedDraft: string;
  statusLabel: string;
  dirty: boolean;
  busy: boolean;
  pendingWrite: boolean;
  conflict: boolean;
  hasMore: boolean;
  listError: string | null;
  refreshDocuments: () => Promise<void>;
  setTitle: Dispatch<SetStateAction<string>>;
  setDraft: Dispatch<SetStateAction<string>>;
  loadMore: () => Promise<boolean>;
  saveDraft: () => Promise<boolean>;
  saveAsNew: () => Promise<boolean>;
  selectDocument: (id: string | null) => Promise<boolean>;
  reloadSaved: () => Promise<boolean>;
  deleteDocument: () => Promise<boolean>;
  replaceDraft: (text: string, name?: string) => boolean;
  discardDraft: () => void;
}

export function useSavedDocument(
  api: DocumentAdapter,
  toast: { error: (message: string) => void; info: (message: string) => void },
): SavedDocumentController {
  const ready = api.ready;
  const [document, setDocument] = useState<SavedDocument | null>(null);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("Untitled");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [pendingWrite, setPendingWrite] = useState(false);
  const [conflict, setConflict] = useState(false);
  const dirty = draft !== (document?.text ?? "") || title !== (document?.title ?? "Untitled");
  const latest = useRef({ document, draft, title, dirty, busy });
  useLayoutEffect(() => {
    latest.current = { document, draft, title, dirty, busy };
  });
  const locked = useRef(false);
  const replay = useRef<(() => void) | null>(null);
  const pendingIds = useRef(new Set<string>());
  const loaded = useRef(100);
  const listGeneration = useRef(0);
  const alive = useRef(true);
  const invalidated = useRef(false);
  const scheduled = useRef(false);
  const refresh = useCallback(async (): Promise<void> => {
    const request = ++listGeneration.current;
    try {
      // Refresh the complete loaded range in one SQL statement, not mutable offset pages.
      const rows = await api.documents.list(0, loaded.current);
      if (!alive.current || request !== listGeneration.current) return;
      setListError(null);
      setDocuments(rows);
      setHasMore(rows.length === loaded.current && loaded.current < MAX_LOADED_DOCUMENTS);
    } catch {
      if (alive.current && request === listGeneration.current) {
        const message = "Unable to refresh the list. Saved changes are preserved.";
        setListError(message);
        toast.error(message);
      }
    }
  }, [api.documents, toast]);
  const scheduleRefresh = useCallback((): void => {
    invalidated.current = true;
    if (locked.current || scheduled.current) return;
    scheduled.current = true;
    queueMicrotask(() => {
      scheduled.current = false;
      if (!alive.current || locked.current) return;
      invalidated.current = false;
      void refresh();
    });
  }, [refresh]);
  const adopt = useCallback(
    (next: SavedDocument | null) => {
      latest.current = {
        ...latest.current,
        document: next,
        draft: next?.text ?? "",
        title: next?.title ?? "Untitled",
        dirty: false,
      };
      setDocument(next);
      setDraft(next?.text ?? "");
      setTitle(next?.title ?? "Untitled");
      setConflict(false);
      void api.window
        .setSession({ documentId: next?.id ?? null })
        .catch(() => toast.error("Unable to save window selection."));
    },
    [api.window, toast],
  );
  useEffect(() => {
    let active = true;
    let generation = 0;
    alive.current = true;
    ++listGeneration.current;
    const changed = async (id: string): Promise<void> => {
      scheduleRefresh();
      if (locked.current) {
        pendingIds.current.add(id);
        replay.current = () => {
          const selected = latest.current.document?.id;
          const needsRead = selected && pendingIds.current.has(selected);
          pendingIds.current.clear();
          if (needsRead) void changed(selected);
        };
        return;
      }
      if (latest.current.document?.id !== id) return;
      const request = ++generation;
      try {
        const next = await api.documents.get(id);
        if (!active || request !== generation || latest.current.document?.id !== id || locked.current) return;
        if (latest.current.dirty) setConflict(true);
        else adopt(next);
      } catch {
        if (active) toast.error("Unable to refresh this saved document.");
      }
    };
    const unsubscribe = api.documents.onChanged((id) => {
      void changed(id);
    });
    void (async () => {
      try {
        await ready?.();
        const [, session] = await Promise.all([refresh(), api.window.getSession()]);
        const saved = session.documentId ? await api.documents.get(session.documentId) : null;
        if (active) adopt(saved);
      } catch {
        if (active) toast.error("Unable to load saved documents.");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
      alive.current = false;
      unsubscribe();
    };
  }, [adopt, api.documents, api.window, ready, refresh, scheduleRefresh, toast]);
  const run = useCallback(
    async (action: () => Promise<boolean>, write = false): Promise<boolean> => {
      if (locked.current || latest.current.busy) return false;
      locked.current = true;
      setBusy(true);
      setPendingWrite(write);
      try {
        return await action();
      } catch {
        toast.error("Unable to save or load this document. Your draft has been kept.");
        return false;
      } finally {
        locked.current = false;
        setBusy(false);
        setPendingWrite(false);
        if (invalidated.current) scheduleRefresh();
        const pending = replay.current;
        replay.current = null;
        pending?.();
      }
    },
    // eslint-disable-next-line react/memo-dependencies -- The finally block must replay invalidations through the current adapter.
    [scheduleRefresh, toast],
  );
  const saveDraft = useCallback(
    () =>
      run(async () => {
        const current = latest.current;
        const input = { title: current.title, text: current.draft };
        if (current.document) {
          const result = await api.documents.save(current.document.id, current.document.revision, input);
          if (result.status === "conflict") {
            setConflict(true);
            return false;
          }
          adopt(result.document);
        } else adopt(await api.documents.create(input));
        invalidated.current = true;
        return true;
      }, true),
    [adopt, api.documents, run],
  );
  const saveAsNew = useCallback(
    () =>
      run(async () => {
        adopt(await api.documents.create({ title: latest.current.title, text: latest.current.draft }));
        invalidated.current = true;
        return true;
      }, true),
    [adopt, api.documents, run],
  );
  const selectDocument = useCallback(
    (id: string | null) =>
      run(async () => {
        if (latest.current.dirty) {
          toast.info("Save or discard your edits before switching documents.");
          return false;
        }
        adopt(id ? await api.documents.get(id) : null);
        return true;
      }),
    [adopt, api.documents, run, toast],
  );
  const reloadSaved = useCallback(
    () =>
      run(async () => {
        adopt(latest.current.document ? await api.documents.get(latest.current.document.id) : null);
        return true;
      }),
    [adopt, api.documents, run],
  );
  const deleteDocument = useCallback(
    () =>
      run(async () => {
        const current = latest.current.document;
        if (!current) return false;
        if (!(await api.documents.delete(current.id, current.revision))) {
          setConflict(true);
          return false;
        }
        adopt(null);
        invalidated.current = true;
        return true;
      }, true),
    [adopt, api.documents, run],
  );
  const loadMore = useCallback(
    () =>
      run(async () => {
        loaded.current = Math.min(MAX_LOADED_DOCUMENTS, loaded.current + 100);
        await refresh();
        return true;
      }),
    [refresh, run],
  );
  return {
    statusLabel: dirty ? "Unsaved changes" : document ? "Saved to this device" : "New document",
    hasMore,
    listError,
    refreshDocuments: refresh,
    loadMore,
    draft,
    title,
    setTitle,
    setDraft,
    document,
    documents,
    dirty,
    busy,
    pendingWrite,
    conflict,
    savedDraft: document?.text ?? "",
    saveDraft,
    saveAsNew,
    selectDocument,
    reloadSaved,
    deleteDocument,
    replaceDraft: (text: string, name?: string): boolean => {
      if (!textWithinLimits(text, api.textPolicy ?? DEFAULT_TEXT_POLICY)) return false;
      setDraft(text);
      if (name) setTitle(name);
      return true;
    },
    discardDraft: (): void => {
      setDraft(latest.current.document?.text ?? "");
      setTitle(latest.current.document?.title ?? "Untitled");
    },
  };
}
