import { z } from "zod";

import type { TextPolicy } from "./text-policy";
export const documentInputSchema = z.object({ title: z.string().trim().min(1).max(255), text: z.string().max(10000) });
export const savedDocumentSchema = documentInputSchema.extend({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedDocument = z.infer<typeof savedDocumentSchema>;
export type DocumentSummary = Omit<SavedDocument, "text">;
export type DocumentWriteResult =
  | { status: "saved"; document: SavedDocument }
  | { status: "conflict"; document: SavedDocument | null };
export interface DocumentAdapter {
  textPolicy?: TextPolicy;
  /** Async hosts resolve event readiness before the first read. Electron subscriptions are synchronous. */
  ready?: () => Promise<void>;
  documents: {
    list: (offset?: number, limit?: number) => Promise<DocumentSummary[]>;
    get: (id: string) => Promise<SavedDocument | null>;
    create: (input: { title: string; text: string }) => Promise<SavedDocument>;
    save: (id: string, revision: number, input: { title: string; text: string }) => Promise<DocumentWriteResult>;
    delete: (id: string, revision: number) => Promise<boolean>;
    onChanged: (callback: (id: string) => void) => () => void;
  };
  window: {
    getSession: () => Promise<{ documentId: string | null }>;
    setSession: (patch: { documentId: string | null }) => Promise<unknown>;
  };
}
