import type * as Bindings from "./bindings";

/** Rust validates and stores these records. The interface only reads them. */
export type SavedDocument = Bindings.SavedDocument;
export type DocumentSummary = Bindings.DocumentSummary;
export type DocumentWriteResult = Bindings.DocumentWriteResult;
export type WindowSession = Bindings.WindowSession;
export type WindowSessionPatch = Bindings.WindowSessionPatch;
