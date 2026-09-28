import { useLocation } from "@tanstack/react-router";
import Search from "lucide-react/dist/esm/icons/search.mjs";
import Workflow from "lucide-react/dist/esm/icons/workflow.mjs";
import type { ReactNode } from "react";

import { PRODUCT_NAME } from "@/shared/bindings";
import { APP_ROUTES } from "@/shared/routes";

import { useShortcutLabel, type WorkspaceAction, type WorkspaceActionId } from "../../actions/workspace-actions";
import { useDesktop } from "../../context/DesktopContext";
import { Hint } from "../ui/tooltip";
import ActivityPopover from "./ActivityPopover";
import AppMenu from "./AppMenu";

interface SidebarProps {
  chrome: ReactNode;
  resizeHandle: ReactNode;
  collapsed: boolean;
  preview: boolean;
  floating: boolean;
  narrow: boolean;
  actions: Record<WorkspaceActionId, WorkspaceAction>;
  onAbout: () => void;
  onShortcuts: () => void;
  settingsContent?: ReactNode;
}

export default function Sidebar({
  collapsed,
  preview,
  floating,
  narrow,
  actions,
  onAbout,
  onShortcuts,
  settingsContent,
  chrome,
  resizeHandle,
}: SidebarProps) {
  const shortcutLabel = useShortcutLabel();
  const location = useLocation();
  const { appInfo } = useDesktop();

  return (
    <div className="sidebar-slot">
      <aside
        id="app-sidebar"
        className="sidebar"
        data-collapsed={collapsed}
        data-narrow={narrow}
        data-preview={preview}
        data-floating={floating}
        aria-label="App sidebar"
        aria-hidden={collapsed && !preview}
        inert={collapsed && !preview ? true : undefined}
      >
        {resizeHandle}
        <div className="sidebar-chrome drag-region">{chrome}</div>
        <div className="sidebar-inner">
          {settingsContent ?? (
            <>
              <div className="sidebar-header">
                <span className="sidebar-product">{appInfo?.name ?? PRODUCT_NAME}</span>
                <Hint
                  label="Search commands"
                  shortcut={shortcutLabel("commandPalette", window.desktop.window.platform === "darwin")}
                  side="bottom"
                >
                  <button
                    type="button"
                    className="shell-icon-button no-drag"
                    aria-label="Search commands"
                    onClick={() => void actions.commandPalette.run()}
                  >
                    <Search aria-hidden="true" />
                  </button>
                </Hint>
                <ActivityPopover />
              </div>

              <nav className="sidebar-nav" aria-label="Primary navigation">
                <button
                  type="button"
                  className="sidebar-nav-item"
                  aria-current={location.pathname === APP_ROUTES.home.path ? "page" : undefined}
                  data-active={location.pathname === APP_ROUTES.home.path}
                  onClick={() => void actions.workspace.run()}
                >
                  <Workflow aria-hidden="true" />
                  <span>{APP_ROUTES.home.label}</span>
                </button>
              </nav>
            </>
          )}

          <AppMenu actions={actions} onAbout={onAbout} onShortcuts={onShortcuts} />
        </div>
      </aside>
    </div>
  );
}
