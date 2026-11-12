import { interruptionAction, interruptionDescription } from "@contracts/interruptions";
import { ConfirmDialog } from "@desktop/components/ui/confirm-dialog";

import type { InterruptionRequest } from "@/shared/desktop-api";

interface QuitDialogProps {
  request: InterruptionRequest | null;
  onResolve: (proceed: boolean) => void;
}

export default function QuitDialog({ request, onResolve }: QuitDialogProps) {
  const action = interruptionAction(request);
  return (
    <ConfirmDialog
      id="quit-dialog"
      open={Boolean(request)}
      title={`${action} and interrupt current work?`}
      description={interruptionDescription(request)}
      confirmLabel={`${action} anyway`}
      destructive
      onCancel={() => onResolve(false)}
      onConfirm={() => onResolve(true)}
    />
  );
}
