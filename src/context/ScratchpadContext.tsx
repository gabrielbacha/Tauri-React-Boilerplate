import {
  useCallback,
  useMemo,
  useLayoutEffect,
  createContext,
  useContext,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import type { TextDocument } from "@/shared/workspace";

import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog";
import { useSavedDocument } from "../hooks/useSavedDocument";
import { useDirtyState } from "./DirtyStateContext";

type SessionDraft = ReturnType<typeof useSavedDocument>;
type ScratchpadState = Pick<
  SessionDraft,
  "draft" | "savedDraft" | "dirty" | "title" | "document" | "documents" | "busy" | "conflict" | "hasMore"
>;
type ScratchpadActions = Omit<SessionDraft, keyof ScratchpadState> & {
  importText: () => Promise<void>;
  exportText: () => Promise<void>;
};
type Scratchpad = ScratchpadState & ScratchpadActions;
const StateContext = createContext<ScratchpadState | null>(null);
const ActionsContext = createContext<ScratchpadActions | null>(null);
export function ScratchpadProvider({ children }: { children: ReactNode }) {
  const draft = useSavedDocument();
  useDirtyState("Scratchpad draft", draft.dirty);
  const busy = useRef(false);
  const [incoming, setIncoming] = useState<TextDocument | null>(null);
  const [name, setName] = useState("scratchpad.txt");
  const latest = useRef({ ...draft, name });
  useLayoutEffect(() => {
    latest.current = { ...draft, name };
  });
  const replace = useCallback((document: TextDocument): void => {
    if (!latest.current.replaceDraft(document.content, document.displayName)) {
      toast.error("Unable to import the text.");
      return;
    }
    setName(document.displayName);
    setIncoming(null);
    toast.success("Text imported. Save to keep this document.");
  }, []);
  const importText = useCallback(async (): Promise<void> => {
    if (busy.current || latest.current.busy) return;
    busy.current = true;
    try {
      const document = await window.desktop.documents.openText();
      if (document) {
        if (latest.current.dirty) setIncoming(document);
        else replace(document);
      }
    } catch {
      toast.error("Unable to import. Use UTF-8 .txt or .md text, at most 10,000 characters and 40 KB.");
    } finally {
      busy.current = false;
    }
  }, [replace]);
  const exportText = useCallback(async (): Promise<void> => {
    if (busy.current || latest.current.busy) return;
    busy.current = true;
    try {
      const result = await window.desktop.documents.saveText({
        suggestedName: latest.current.name,
        content: latest.current.draft,
      });
      if (result) toast.success(`Exported ${result.displayName}`);
    } catch {
      toast.error("Unable to export this text.");
    } finally {
      busy.current = false;
    }
  }, []);
  const actions = useMemo<ScratchpadActions>(
    () => ({
      loadMore: () => latest.current.loadMore(),
      setTitle: (value) => latest.current.setTitle(value),
      saveAsNew: () => latest.current.saveAsNew(),
      selectDocument: (id) => latest.current.selectDocument(id),
      reloadSaved: () => latest.current.reloadSaved(),
      deleteDocument: () => latest.current.deleteDocument(),
      setDraft: (value) => latest.current.setDraft(value),
      saveDraft: () => latest.current.saveDraft(),
      replaceDraft: (text) => latest.current.replaceDraft(text),
      discardDraft: () => latest.current.discardDraft(),
      importText,
      exportText,
    }),
    [importText, exportText],
  );
  const state = useMemo<ScratchpadState>(
    () => ({
      hasMore: draft.hasMore,
      title: draft.title,
      document: draft.document,
      documents: draft.documents,
      busy: draft.busy,
      conflict: draft.conflict,
      draft: draft.draft,
      savedDraft: draft.savedDraft,
      dirty: draft.dirty,
    }),
    [
      draft.draft,
      draft.savedDraft,
      draft.dirty,
      draft.title,
      draft.document,
      draft.documents,
      draft.busy,
      draft.conflict,
      draft.hasMore,
    ],
  );
  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>
        {children}
        <Dialog
          open={incoming !== null}
          onOpenChange={(open) => {
            if (!open) setIncoming(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Replace unsaved text?</DialogTitle>
              <DialogDescription>
                Importing replaces your scratchpad. Export or save the current text first if you want to keep it.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIncoming(null)}>
                Keep current text
              </Button>
              <Button onClick={() => incoming && replace(incoming)}>Replace text</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </StateContext.Provider>
    </ActionsContext.Provider>
  );
}
export function useScratchpadActions(): ScratchpadActions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error("ScratchpadProvider is required.");
  return actions;
}

export function useScratchpad(): Scratchpad {
  const state = useContext(StateContext);
  const actions = useScratchpadActions();
  if (!state) throw new Error("ScratchpadProvider is required.");
  return { ...state, ...actions };
}

export function useOptionalScratchpadActions(): ScratchpadActions | null {
  return useContext(ActionsContext);
}
