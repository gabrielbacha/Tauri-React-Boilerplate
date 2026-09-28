import type { InterruptionRequest } from "@/shared/desktop-api";

import { ConfirmDialog } from "../ui/confirm-dialog";

interface QuitDialogProps {
  request: InterruptionRequest | null;
  onResolve: (proceed: boolean) => void;
}

export default function QuitDialog({ request, onResolve }: QuitDialogProps) {
  const action = request?.kind === "close-window" ? "Close" : request?.kind === "install-update" ? "Restart" : "Quit";
  const details = [
    request?.dirtySources.length
      ? `${request.dirtySources.length} unsaved item${request.dirtySources.length === 1 ? "" : "s"}`
      : null,
    request?.activeTaskCount
      ? `${request.activeTaskCount} active task${request.activeTaskCount === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  return (
    <ConfirmDialog
      id="quit-dialog"
      open={Boolean(request)}
      title={`${action} and interrupt current work?`}
      description={`${details.join(" and ")}. Unsaved edits will be discarded. Saved documents remain. Background jobs are preserved and safe jobs restart when the app reopens.`}
      confirmLabel={`${action} anyway`}
      destructive
      onCancel={() => onResolve(false)}
      onConfirm={() => onResolve(true)}
    />
  );
}
