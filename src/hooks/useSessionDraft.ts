import { useCallback, useState } from "react";

import { appConfig } from "../../package.json";
const DRAFT_KEY = `${appConfig.storageNamespace}:scratchpad:v1`;
const DRAFT_VERSION = 1;
const MAX_DRAFT_LENGTH = 10_000;

interface StoredDraft {
  version: number;
  text: string;
}

function readDraft(): string {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (parsed.version !== DRAFT_VERSION || typeof parsed.text !== "string" || parsed.text.length > MAX_DRAFT_LENGTH) {
      return "";
    }
    return parsed.text;
  } catch {
    return "";
  }
}

export function useSessionDraft(): {
  draft: string;
  savedDraft: string;
  dirty: boolean;
  setDraft: (value: string) => void;
  saveDraft: () => boolean;
  replaceDraft: (text: string) => boolean;
  discardDraft: () => void;
} {
  const [savedDraft, setSavedDraft] = useState(readDraft);
  const [draft, setDraftState] = useState(savedDraft);
  const setDraft = useCallback((value: string) => {
    setDraftState(value.slice(0, MAX_DRAFT_LENGTH));
  }, []);
  const persistDraft = useCallback((text: string): boolean => {
    try {
      if (text) {
        window.sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ version: DRAFT_VERSION, text } satisfies StoredDraft),
        );
      } else {
        window.sessionStorage.removeItem(DRAFT_KEY);
      }
      setSavedDraft(text);
      return true;
    } catch {
      return false;
    }
  }, []);
  const saveDraft = useCallback(() => persistDraft(draft), [draft, persistDraft]);
  const replaceDraft = useCallback(
    (text: string): boolean => {
      if (text.length > MAX_DRAFT_LENGTH || !persistDraft(text)) return false;
      setDraftState(text);
      return true;
    },
    [persistDraft],
  );
  const discardDraft = useCallback(() => setDraftState(savedDraft), [savedDraft]);
  return { draft, savedDraft, dirty: draft !== savedDraft, setDraft, saveDraft, replaceDraft, discardDraft };
}

export const SESSION_DRAFT_KEY = DRAFT_KEY;
