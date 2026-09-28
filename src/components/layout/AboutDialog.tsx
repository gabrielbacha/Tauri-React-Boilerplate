import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PRODUCT_NAME } from "@/shared/bindings";
import { KNOWN_DESTINATIONS } from "@/shared/known-destinations";

import { useDesktop } from "../../context/DesktopContext";
import { useDialogReturnFocus } from "../../hooks/useDialogReturnFocus";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

export default function AboutDialog({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const returnFocus = useDialogReturnFocus();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const { appInfo } = useDesktop();
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent {...returnFocus} className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background">
            {appInfo?.name.slice(0, 1) ?? "E"}
          </div>
          <DialogTitle className="text-xl">{appInfo?.name ?? PRODUCT_NAME}</DialogTitle>
          <DialogDescription>{appInfo?.description}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/60 p-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono">{appInfo?.version ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Runtime</dt>
            <dd className="font-mono">{appInfo ? `${appInfo.platform} ${appInfo.arch}` : "—"}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {KNOWN_DESTINATIONS.map((id) => (
            <Button
              key={id}
              size="sm"
              variant="outline"
              onClick={() =>
                void window.desktop.links.openKnownDestination(id).catch(() => toast.error("Unable to open that page."))
              }
            >
              {id[0].toUpperCase() + id.slice(1)}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
