import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { DocumentSummary, SavedDocument } from "@/shared/persistence";

export function useSavedDocument() {
  const [document, setDocument] = useState<SavedDocument | null>(null);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("Untitled");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [conflict, setConflict] = useState(false);
  const dirty = draft !== (document?.text ?? "") || title !== (document?.title ?? "Untitled");
  const latest = useRef({ document, draft, title, dirty, busy });
  useLayoutEffect(() => {
    latest.current = { document, draft, title, dirty, busy };
  });
  const locked = useRef(false);
  const refresh = useCallback(async () => {
    const rows = await window.desktop.documents.list();
    setDocuments(rows);
    setHasMore(rows.length === 100);
  }, []);
  const adopt = useCallback((next: SavedDocument | null) => {
    setDocument(next);
    setDraft(next?.text ?? "");
    setTitle(next?.title ?? "Untitled");
    setConflict(false);
    void window.desktop.window
      .setSession({ documentId: next?.id ?? null })
      .catch(() => toast.error("Unable to save window selection."));
  }, []);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const changed = async (id: string): Promise<void> => {
      try {
        const list = await window.desktop.documents.list();
        if (active) {
          setDocuments(list);
          setHasMore(list.length === 100);
        }
        if (latest.current.document?.id !== id || locked.current) return;
        const request = ++generation;
        const next = await window.desktop.documents.get(id);
        if (!active || request !== generation || latest.current.document?.id !== id || locked.current) return;
        if (latest.current.dirty) setConflict(true);
        else adopt(next);
      } catch {
        if (active) toast.error("Unable to refresh saved documents.");
      }
    };
    const unsubscribe = window.desktop.documents.onChanged((id) => {
      void changed(id);
    });
    void (async () => {
      try {
        const [list, session] = await Promise.all([
          window.desktop.documents.list(),
          window.desktop.window.getSession(),
        ]);
        const saved = session.documentId ? await window.desktop.documents.get(session.documentId) : null;
        if (active) {
          setDocuments(list);
          setHasMore(list.length === 100);
          adopt(saved);
        }
      } catch {
        if (active) toast.error("Unable to load saved documents.");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [adopt]);
  const run = useCallback(async (action: () => Promise<boolean>): Promise<boolean> => {
    if (locked.current || latest.current.busy) return false;
    locked.current = true;
    setBusy(true);
    try {
      return await action();
    } catch {
      toast.error("Unable to save or load this document. Your draft has been kept.");
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, []);
  const saveDraft = useCallback(
    () =>
      run(async () => {
        const current = latest.current;
        const input = { title: current.title, text: current.draft };
        if (current.document) {
          const result = await window.desktop.documents.save(current.document.id, current.document.revision, input);
          if (result.status === "conflict") {
            setConflict(true);
            return false;
          }
          adopt(result.document);
        } else adopt(await window.desktop.documents.create(input));
        await refresh();
        return true;
      }),
    [adopt, refresh, run],
  );
  const saveAsNew = useCallback(
    () =>
      run(async () => {
        adopt(await window.desktop.documents.create({ title: latest.current.title, text: latest.current.draft }));
        await refresh();
        return true;
      }),
    [adopt, refresh, run],
  );
  const selectDocument = useCallback(
    (id: string | null) =>
      run(async () => {
        if (latest.current.dirty) {
          toast.info("Save or discard your edits before switching documents.");
          return false;
        }
        adopt(id ? await window.desktop.documents.get(id) : null);
        return true;
      }),
    [adopt, run],
  );
  const reloadSaved = useCallback(
    () =>
      run(async () => {
        adopt(latest.current.document ? await window.desktop.documents.get(latest.current.document.id) : null);
        return true;
      }),
    [adopt, run],
  );
  const deleteDocument = useCallback(
    () =>
      run(async () => {
        const current = latest.current.document;
        if (!current) return false;
        if (!(await window.desktop.documents.delete(current.id, current.revision))) {
          setConflict(true);
          return false;
        }
        adopt(null);
        await refresh();
        return true;
      }),
    [adopt, refresh, run],
  );
  const loadMore = useCallback(
    () =>
      run(async () => {
        const rows = await window.desktop.documents.list(documents.length);
        setDocuments((current) => [...current, ...rows.filter((row) => !current.some((item) => item.id === row.id))]);
        setHasMore(rows.length === 100);
        return true;
      }),
    [documents.length, run],
  );
  return {
    hasMore,
    loadMore,
    draft,
    title,
    setTitle,
    setDraft,
    document,
    documents,
    dirty,
    busy,
    conflict,
    savedDraft: document?.text ?? "",
    saveDraft,
    saveAsNew,
    selectDocument,
    reloadSaved,
    deleteDocument,
    replaceDraft: (text: string, name?: string): boolean => {
      if (text.length > 10000) return false;
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
