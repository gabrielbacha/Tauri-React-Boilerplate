import { Button } from "@desktop/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@desktop/components/ui/dialog";
import { useDesktop } from "@desktop/context/DesktopContext";
import { useState } from "react";
import { toast } from "sonner";

export default function UpdateDialog() {
  const { updateState } = useDesktop();
  const [restarting, setRestarting] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const version = updateState.status === "ready" ? updateState.version : null;
  const open = Boolean(version && version !== dismissedVersion);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !restarting && setDismissedVersion(version)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update ready</DialogTitle>
          <DialogDescription>Version {version} has been downloaded and can be installed now.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={restarting} onClick={() => setDismissedVersion(version)}>
            Later
          </Button>
          <Button
            disabled={restarting}
            onClick={() => {
              setRestarting(true);
              void window.desktop.updates
                .restart()
                .then(() => setDismissedVersion(version))
                .catch(() => toast.error("Unable to restart for the update. Please try again."))
                .finally(() => setRestarting(false));
            }}
          >
            {restarting ? "Restarting…" : "Restart to update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
