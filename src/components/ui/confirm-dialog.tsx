import type { ReactElement, ReactNode } from "react";

import { useDialogReturnFocus } from "../../hooks/useDialogReturnFocus";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

/**
 * A question with Cancel and one confirming answer (and optionally another action between them).
 * Focus returns to the control that opened it, as for a dialog opened by a trigger.
 */
export function ConfirmDialog({
  id,
  "data-id": dataId,
  open,
  title,
  description,
  cancelLabel = "Cancel",
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = false,
  busy = false,
  busyLabel,
  extraAction,
}: {
  /** For a dialog that exists once in the app. */
  id?: string;
  /** For a dialog that each open Base (or other repeated owner) has. */
  "data-id"?: string;
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  /** While true the confirming answer is disabled and shows `busyLabel`. */
  busy?: boolean;
  busyLabel?: string;
  extraAction?: ReactNode;
}): ReactElement {
  const focus = useDialogReturnFocus();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent {...focus} id={id} data-id={dataId} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {extraAction}
          <Button variant={destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
