import { lazy } from "react";

import type { ActionResult } from "../../hooks/useAsyncAction";
import DeferredSurface from "../common/DeferredSurface";
import { ConfirmDialog } from "../ui/confirm-dialog";
import type { PaletteCommand } from "./CommandPalette";
const AboutDialog = lazy(() => import("./AboutDialog"));
const ShareDialog = lazy(() => import("./ShareDialog"));
const CommandPalette = lazy(() => import("./CommandPalette"));
interface Props {
  shareOpen: boolean;
  setShareOpen: (open: boolean) => void;
  aboutOpen: boolean;
  setAboutOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  reloadOpen: boolean;
  setReloadOpen: (open: boolean) => void;
  paletteCommands: PaletteCommand[];
  pendingAction: string | null;
  runAction: (id: string, action: () => Promise<unknown>, success?: string) => Promise<ActionResult<unknown>>;
}
export default function WorkspaceDialogs({
  shareOpen,
  setShareOpen,
  aboutOpen,
  setAboutOpen,
  paletteOpen,
  setPaletteOpen,
  reloadOpen,
  setReloadOpen,
  paletteCommands,
  pendingAction,
  runAction,
}: Props) {
  return (
    <>
      <DeferredSurface active={aboutOpen}>
        <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      </DeferredSurface>
      <DeferredSurface active={paletteOpen}>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={paletteCommands} />
      </DeferredSurface>
      <DeferredSurface active={shareOpen}>
        <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
      </DeferredSurface>
      <ConfirmDialog
        id="reload-workspace-dialog"
        open={reloadOpen}
        title="Reload this workspace?"
        description="Saved documents and background tasks remain available. Unsaved edits will be discarded."
        confirmLabel="Reload"
        busy={pendingAction === "reload"}
        busyLabel="Reloading…"
        onConfirm={() =>
          void runAction("reload", () => window.desktop.diagnostics.reload()).then((result) => {
            if (result.status === "success") setReloadOpen(false);
          })
        }
        onCancel={() => setReloadOpen(false)}
      />
    </>
  );
}
