import CircleHelp from "lucide-react/dist/esm/icons/circle-help.mjs";
import Info from "lucide-react/dist/esm/icons/info.mjs";
import Keyboard from "lucide-react/dist/esm/icons/keyboard.mjs";
import LogOut from "lucide-react/dist/esm/icons/log-out.mjs";
import Monitor from "lucide-react/dist/esm/icons/monitor.mjs";
import Moon from "lucide-react/dist/esm/icons/moon.mjs";
import Settings2 from "lucide-react/dist/esm/icons/settings-2.mjs";
import Sun from "lucide-react/dist/esm/icons/sun.mjs";
import type { ReactElement } from "react";
import { toast } from "sonner";

import type { ThemeMode } from "@/shared/desktop-api";

import { useShortcutLabel, type WorkspaceAction, type WorkspaceActionId } from "../../actions/workspace-actions";
import { useDesktop } from "../../context/DesktopContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Hint } from "../ui/tooltip";

export default function AppMenu({
  actions,
  onAbout,
  onShortcuts,
}: {
  actions: Record<WorkspaceActionId, WorkspaceAction>;
  onAbout: () => void;
  onShortcuts: () => void;
}): ReactElement {
  const shortcutLabel = useShortcutLabel();
  const { appInfo, preferences, updatePreferences } = useDesktop();
  const setTheme = async (theme: ThemeMode): Promise<void> => {
    try {
      await updatePreferences({ theme });
    } catch {
      toast.error("Unable to save the appearance setting.");
    }
  };

  return (
    <div className="sidebar-footer">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="profile-row" aria-label="Open app menu">
            <span className="profile-avatar">
              {(appInfo?.name ?? "Electron App")
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px] font-medium">{appInfo?.name ?? "Electron App"}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="profile-menu">
          <DropdownMenuLabel className="profile-menu-heading">
            <span className="profile-avatar">
              {(appInfo?.name ?? "Electron App")
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </span>
            <span>
              {appInfo?.name ?? "Electron App"}
              <small>{appInfo ? `Version ${appInfo.version}` : "Loading…"}</small>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void actions.settings.run()}>
            <Settings2 />
            Settings
            <span className="menu-shortcut">
              {shortcutLabel("settings", window.desktop.window.platform === "darwin")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {preferences?.theme === "dark" ? <Moon /> : <Sun />}
              Appearance
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={preferences?.theme ?? "system"}
                onValueChange={(value) => void setTheme(value as ThemeMode)}
              >
                <DropdownMenuRadioItem value="light">
                  <Sun className="mr-2 inline size-4" /> Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon className="mr-2 inline size-4" /> Dark
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <Monitor className="mr-2 inline size-4" /> System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={onAbout}>
            <Info />
            About
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void window.desktop.window.quit()}>
            <LogOut />
            Quit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <Hint label="Help" side="top">
          <DropdownMenuTrigger asChild>
            <button type="button" className="shell-icon-button" aria-label="Help">
              <CircleHelp aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent side="top" align="end">
          <DropdownMenuItem onSelect={onShortcuts}>
            <Keyboard />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onAbout}>
            <Info />
            About
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
