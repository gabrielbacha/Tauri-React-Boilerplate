import Clipboard from "lucide-react/dist/esm/icons/clipboard.mjs";
import Ellipsis from "lucide-react/dist/esm/icons/ellipsis.mjs";
import Info from "lucide-react/dist/esm/icons/info.mjs";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.mjs";
import RotateCw from "lucide-react/dist/esm/icons/rotate-cw.mjs";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text.mjs";
import Upload from "lucide-react/dist/esm/icons/upload.mjs";

import { COMMANDS, commandAvailable, type CommandId } from "@/shared/commands";
import type { UpdateState } from "@/shared/desktop-api";

import { useShortcutLabel } from "../../actions/workspace-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Hint } from "../ui/tooltip";
interface Props {
  platform: string;
  pageTitle: string;
  leadingToggle: boolean;
  executeCommand: (id: CommandId) => void;
  packaged: boolean;
  pendingAction: string | null;
  updateState: UpdateState;
}
export default function ToolbarActions({
  platform,
  pageTitle,
  leadingToggle,
  executeCommand,
  packaged,
  pendingAction,
  updateState,
}: Props) {
  const shortcutLabel = useShortcutLabel();
  return (
    <header id="app-toolbar" className="app-toolbar" data-platform={platform} data-leading-toggle={leadingToggle}>
      <div className="no-drag flex min-w-0 items-center gap-2">
        <span className="toolbar-title">{pageTitle}</span>
      </div>

      <div className="toolbar-drag-space drag-region" aria-hidden="true" />
      <div className="no-drag ml-auto flex shrink-0 items-center gap-1">
        {commandAvailable("share", packaged) ? (
          <Hint label="Share" shortcut={shortcutLabel("share", platform === "darwin")} side="bottom">
            <button type="button" className="shell-share-button no-drag" onClick={() => executeCommand("share")}>
              <Upload aria-hidden="true" />
              <span>Share</span>
            </button>
          </Hint>
        ) : null}
        <DropdownMenu>
          <Hint label="More actions" side="bottom">
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="shell-icon-button"
                aria-label="More actions"
                data-id="toolbar-more-button"
              >
                <Ellipsis aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent align="end" className="w-56">
            {(["commandPalette", "workspace", "settings", "toggleSidebar", "toggleDetails"] as const).map((id) => (
              <DropdownMenuItem key={id} onSelect={() => executeCommand(id)}>
                {COMMANDS[id].label}
                <span className="menu-shortcut">{shortcutLabel(id, platform === "darwin")}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={
                pendingAction !== null || updateState.status === "checking" || updateState.status === "downloading"
              }
              onSelect={() => executeCommand("checkUpdates")}
            >
              <RefreshCw />
              {pendingAction === "checkUpdates" ? "Checking…" : COMMANDS.checkUpdates.label}
              <span className="menu-shortcut">{shortcutLabel("checkUpdates", platform === "darwin")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pendingAction !== null} onSelect={() => executeCommand("copyDiagnostics")}>
              <Clipboard />
              {COMMANDS.copyDiagnostics.label}
              <span className="menu-shortcut">{shortcutLabel("copyDiagnostics", platform === "darwin")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pendingAction !== null} onSelect={() => executeCommand("openLogs")}>
              <ScrollText />
              {COMMANDS.openLogs.label}
              <span className="menu-shortcut">{shortcutLabel("openLogs", platform === "darwin")}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {commandAvailable("reload", packaged) ? (
              <DropdownMenuItem onSelect={() => executeCommand("reload")}>
                <RotateCw />
                {COMMANDS.reload.label}
                <span className="menu-shortcut">{shortcutLabel("reload", platform === "darwin")}</span>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => executeCommand("about")}>
              <Info />
              {COMMANDS.about.label}
              <span className="menu-shortcut">{shortcutLabel("about", platform === "darwin")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
