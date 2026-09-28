import { useLocation, useRouter } from "@tanstack/react-router";
import PanelLeft from "lucide-react/dist/esm/icons/panel-left.mjs";
import PanelRight from "lucide-react/dist/esm/icons/panel-right.mjs";
import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { APP_ROUTES, type AppRoutePath } from "@/shared/routes";

import { createWorkspaceActions, useShortcutLabel } from "../actions/workspace-actions";
import DetailsPanel from "../components/layout/DetailsPanel";
import DragWindowRegion from "../components/layout/DragWindowRegion";
import PanelResizeHandle from "../components/layout/PanelResizeHandle";
import SettingsNavigation from "../components/layout/SettingsNavigation";
import Sidebar from "../components/layout/Sidebar";
import ToolbarActions from "../components/layout/ToolbarActions";
import WorkspaceDialogs from "../components/layout/WorkspaceDialogs";
import { Toaster } from "../components/ui/sonner";
import { Hint } from "../components/ui/tooltip";
import { CommandsContext } from "../context/CommandsContext";
import { useDesktop } from "../context/DesktopContext";
import { useCompactSidebar } from "../hooks/useCompactSidebar";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useOverlayFocus } from "../hooks/useOverlayFocus";
import { usePanelMotion } from "../hooks/usePanelMotion";
import { usePanelWidth } from "../hooks/usePanelWidth";
import { useSidebarPreference } from "../hooks/useSidebarPreference";
import { useSidebarPreview } from "../hooks/useSidebarPreview";
import { useWorkspaceCommands } from "../hooks/useWorkspaceCommands";
import { CATEGORY_LABELS, validateSettingsSearch } from "../settings/settings-navigation";

export default function BaseLayout({ children }: { children: ReactNode }) {
  const shortcutLabel = useShortcutLabel();
  const { appInfo, preferences, updatePreferences, updateState } = useDesktop();
  const router = useRouter();
  const location = useLocation();
  const sidebarPreference = useSidebarPreference(preferences?.sidebarCollapsed ?? false, async (sidebarCollapsed) => {
    await updatePreferences({ sidebarCollapsed });
  });
  const isSettings = location.pathname === APP_ROUTES.settings.path;
  const workspaceSidebar = useCompactSidebar(sidebarPreference.collapsed);
  const { narrow, setNarrowOverride } = workspaceSidebar;
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  useLayoutEffect(() => {
    setSettingsCollapsed(false);
  }, [isSettings]);
  const collapsed = isSettings ? settingsCollapsed : workspaceSidebar.collapsed;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const preview = useSidebarPreview(collapsed && !narrow && !paletteOpen);
  const previewProgress = usePanelMotion(preview.open);
  const workspaceSize = usePanelWidth("sidebar", 275, 240);
  const settingsSize = usePanelWidth("settings", 275, 240);
  const sidebarSize = isSettings ? settingsSize : workspaceSize;
  const sidebarProgress = usePanelMotion(!collapsed);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsProgress = usePanelMotion(detailsOpen);
  const detailsSize = usePanelWidth("details", 320, 280, 400 + (!collapsed && !narrow ? sidebarSize.width : 0));
  const [shareOpen, setShareOpen] = useState(false);
  const detailsOverlay = useMediaQuery("(max-width: 1099px)");
  useOverlayFocus(narrow && !collapsed, "#app-sidebar", ".shell-sidebar-toggle");
  useOverlayFocus(detailsOverlay && detailsOpen && !(narrow && !collapsed), "#app-details", ".details-trigger");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const platform = window.desktop.window.platform === "darwin" ? "darwin" : "other";

  const navigate = async (to: AppRoutePath): Promise<void> => {
    preview.close();
    await router.navigate({ to });
    if (narrow) setNarrowOverride(true);
  };
  const actions = createWorkspaceActions({
    commandPalette: () => {
      preview.close();
      setPaletteOpen(true);
    },
    workspace: () => navigate(APP_ROUTES.home.path),
    settings: () => navigate(APP_ROUTES.settings.path),
    toggleDetails: () => setDetailsOpen((open) => !open),
    toggleSidebar: async () => {
      preview.close();
      if (isSettings) {
        setSettingsCollapsed((value) => !value);
        return;
      }
      if (narrow) {
        setNarrowOverride(!collapsed);
        return;
      }
      await sidebarPreference.set(!collapsed);
    },
  });

  const { executeCommand, paletteCommands, runAction, pendingAction } = useWorkspaceCommands({
    actions,
    narrow,
    setSettingsCollapsed,
    setReloadOpen,
    setAboutOpen,
    setShareOpen,
  });

  const toggleRef = useRef<HTMLButtonElement>(null);
  const detailsTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreToggleFocus = useRef(false);
  useLayoutEffect(() => {
    if (!detailsOpen && document.activeElement?.closest("#app-details")) detailsTriggerRef.current?.focus();
  }, [detailsOpen]);
  useLayoutEffect(() => {
    if (restoreToggleFocus.current) {
      toggleRef.current?.focus();
      restoreToggleFocus.current = false;
    }
  }, [collapsed]);
  const closeSidebar = (): void => {
    restoreToggleFocus.current = true;
    if (isSettings) setSettingsCollapsed(true);
    else setNarrowOverride(true);
  };
  const closeDetails = (): void => {
    setDetailsOpen(false);
    detailsTriggerRef.current?.focus();
  };
  const toggleLabel = collapsed ? "Open sidebar" : "Close sidebar";
  const pageTitle = isSettings
    ? CATEGORY_LABELS[validateSettingsSearch(location.search).section ?? "appearance"]
    : APP_ROUTES.home.label;
  const sidebarToggle = (
    <Hint label={toggleLabel} shortcut={shortcutLabel("toggleSidebar", platform === "darwin")} side="bottom">
      <button
        type="button"
        className="shell-sidebar-toggle shell-icon-button no-drag"
        ref={toggleRef}
        aria-label={toggleLabel}
        aria-expanded={!collapsed || preview.open}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") preview.enter();
        }}
        onPointerLeave={preview.cancel}
        aria-controls="app-sidebar"
        disabled={!preferences}
        onClick={() => {
          restoreToggleFocus.current = true;
          void actions.toggleSidebar.run();
        }}
      >
        <PanelLeft aria-hidden="true" />
      </button>
    </Hint>
  );
  return (
    <>
      <motion.div
        id="app-shell"
        className="app-shell"
        style={
          {
            "--sidebar-progress": sidebarProgress,
            "--sidebar-preview-progress": previewProgress,
            "--sidebar-width": `${sidebarSize.width}px`,
          } as React.ComponentProps<typeof motion.div>["style"]
        }
        data-sidebar-collapsed={collapsed}
        data-sidebar-preview={preview.open}
        data-platform={platform}
        data-details-open={detailsOpen}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.defaultPrevented) return;
          if (preview.open) {
            preview.close();
            toggleRef.current?.focus();
          } else if (narrow && !collapsed) closeSidebar();
          else if (detailsOpen) closeDetails();
          else return;
          event.preventDefault();
        }}
      >
        <div className="shell-toggle-slot shell-persistent-toggle">{sidebarToggle}</div>
        <button
          type="button"
          className="sidebar-backdrop"
          aria-hidden={collapsed || !narrow}
          tabIndex={-1}
          data-open={narrow && !collapsed}
          aria-label="Dismiss sidebar"
          onClick={closeSidebar}
        />
        <Sidebar
          collapsed={collapsed}
          preview={preview.open}
          floating={preview.present}
          narrow={narrow}
          actions={actions}
          onAbout={() => {
            preview.close();
            setAboutOpen(true);
          }}
          onShortcuts={() => {
            preview.close();
            executeCommand("shortcuts");
          }}
          settingsContent={
            isSettings ? (
              <SettingsNavigation
                onBack={() => void actions.workspace.run()}
                onNavigate={() => {
                  if (narrow) setSettingsCollapsed(true);
                }}
              />
            ) : undefined
          }
          chrome={null}
          resizeHandle={
            <PanelResizeHandle
              label="Resize sidebar"
              controls="app-sidebar"
              edge="right"
              {...sidebarSize}
              id="sidebar-resize-handle"
              variable={{ name: "--sidebar-width", on: "#app-shell" }}
              onCommit={sidebarSize.commit}
              onReset={sidebarSize.reset}
              onCollapse={() => {
                toggleRef.current?.focus();
                if (isSettings) setSettingsCollapsed(true);
                else void sidebarPreference.set(true);
              }}
            />
          }
        />
        <div className="main-frame" inert={narrow && !collapsed ? true : undefined}>
          <ToolbarActions
            {...{
              platform,
              executeCommand,
              pageTitle,
              pendingAction,
              updateState,
            }}
            packaged={appInfo?.packaged ?? false}
            leadingToggle={collapsed || narrow}
          />

          <div className="content-frame">
            <main id="main-content" className="main-content" inert={detailsOpen && detailsOverlay ? true : undefined}>
              <CommandsContext.Provider value={executeCommand}>{children}</CommandsContext.Provider>
            </main>
          </div>
        </div>
        <DetailsPanel
          obscured={narrow && !collapsed}
          open={detailsOpen}
          onClose={closeDetails}
          progress={detailsProgress}
          size={detailsSize}
        />
        <div className="shell-details-toggle" inert={narrow && !collapsed ? true : undefined}>
          <Hint
            label={detailsOpen ? "Close details" : "Open details"}
            shortcut={shortcutLabel("toggleDetails", platform === "darwin")}
            side="bottom"
          >
            <button
              type="button"
              ref={detailsTriggerRef}
              className="shell-icon-button details-trigger no-drag"
              aria-label={detailsOpen ? "Close details" : "Open details"}
              aria-pressed={detailsOpen}
              aria-controls="app-details"
              onClick={() => executeCommand("toggleDetails")}
            >
              <PanelRight aria-hidden="true" />
            </button>
          </Hint>
        </div>
        <DragWindowRegion />
        <Toaster position="bottom-right" />
      </motion.div>

      <WorkspaceDialogs
        {...{
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
        }}
      />
    </>
  );
}
