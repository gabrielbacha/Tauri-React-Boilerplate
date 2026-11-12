export interface InterruptionView {
  kind: "quit" | "install-update" | "close-window" | "reload";
  dirtySources: readonly string[];
  activeTaskCount: number;
}
export function interruptionAction(request: InterruptionView | null): string {
  return request?.kind === "reload"
    ? "Reload"
    : request?.kind === "close-window"
      ? "Close"
      : request?.kind === "install-update"
        ? "Restart"
        : "Quit";
}
export function interruptionDescription(request: InterruptionView | null): string {
  if (!request) return "";
  const details = [
    request.dirtySources.length
      ? `${request.dirtySources.length} unsaved item${request.dirtySources.length === 1 ? "" : "s"}`
      : null,
    request.activeTaskCount
      ? `${request.activeTaskCount} active task${request.activeTaskCount === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(" and ");
  return (
    (details ? `${details}. ` : "") +
    (request.kind === "reload"
      ? "Unsaved edits will be discarded. Cancel to wait for a save that is still in progress. Saved documents and background jobs remain available."
      : "Unsaved edits will be discarded. Saved documents remain. Background jobs are preserved and safe jobs restart when the app reopens.")
  );
}
