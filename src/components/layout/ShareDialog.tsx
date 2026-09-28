import { useState } from "react";
import { toast } from "sonner";

import { isCompletedTask } from "@/shared/tasks";

import { useDesktop, useTasks } from "../../context/DesktopContext";
import { useScratchpad } from "../../context/ScratchpadContext";
import { useDialogReturnFocus } from "../../hooks/useDialogReturnFocus";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
export default function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const returnFocus = useDialogReturnFocus();
  const { draft } = useScratchpad();
  const { appInfo } = useDesktop();
  const tasks = useTasks();
  const [busy, setBusy] = useState(false);
  const summary = [
    `${appInfo?.name ?? "Workspace"} ${appInfo?.version ?? ""}`,
    draft,
    ...tasks
      .filter((task) => isCompletedTask(task) && task.result)
      .map((task) => `${task.result!.fileName}: ${task.result!.sha256}`),
  ].join("\n\n");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...returnFocus}>
        <DialogHeader>
          <DialogTitle>Share workspace</DialogTitle>
          <DialogDescription>Copy the current text and completed hashes to your clipboard.</DialogDescription>
        </DialogHeader>
        <pre className="max-h-72 overflow-auto text-xs break-all whitespace-pre-wrap">{summary}</pre>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void window.desktop.sharing
                .copyWorkspaceSummary({ draft })
                .then(() => toast.success("Workspace summary copied"))
                .catch(() => toast.error("Unable to copy the summary."))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Copying…" : "Copy workspace summary"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
