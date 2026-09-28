import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { toast } from "sonner";

import {
  COMMANDS,
  COMMAND_IDS,
  commandAvailable,
  commandForBinding,
  keyEventBinding,
  type CommandId,
} from "@/shared/commands";
import { ZOOM_LEVELS } from "@/shared/interface-options";

import { useShortcutLabel, type WorkspaceAction, type WorkspaceActionId } from "../actions/workspace-actions";
import type { PaletteCommand } from "../components/layout/CommandPalette";
import { useDesktop } from "../context/DesktopContext";
import { useOptionalScratchpadActions } from "../context/ScratchpadContext";
import { isOverlayOpen } from "../utils/dom-overlays";
import type { ActionResult } from "./useAsyncAction";
import { useFeedbackAction } from "./useFeedbackAction";

export function useWorkspaceCommands({
  actions,
  narrow,
  setSettingsCollapsed,
  setReloadOpen,
  setAboutOpen,
  setShareOpen,
}: {
  actions: Record<WorkspaceActionId, WorkspaceAction>;
  narrow: boolean;
  setSettingsCollapsed: (collapsed: boolean) => void;
  setReloadOpen: (open: boolean) => void;
  setAboutOpen: (open: boolean) => void;
  setShareOpen: (open: boolean) => void;
}): {
  executeCommand: (id: CommandId) => void;
  paletteCommands: PaletteCommand[];
  runAction: (id: string, action: () => Promise<unknown>, success?: string) => Promise<ActionResult<unknown>>;
  pendingAction: string | null;
} {
  const { appInfo, preferences, updatePreferences, checkForUpdates } = useDesktop();
  const router = useRouter();
  const scratchpad = useOptionalScratchpadActions();
  const shortcutLabel = useShortcutLabel();
  const platform = window.desktop.window.platform;
  const { run: runAction, pending: pendingAction } = useFeedbackAction();

  const executeCommand = useCallback(
    (id: CommandId): void => {
      if (!preferences || !commandAvailable(id, appInfo?.packaged ?? false)) return;
      if (id in actions) {
        void Promise.resolve(actions[id as keyof typeof actions].run()).catch(() =>
          toast.error("Unable to complete that action."),
        );
        return;
      }
      if (id === "zoomIn" || id === "zoomOut" || id === "zoomReset") {
        const index = ZOOM_LEVELS.findIndex((level) => level === preferences.zoom);
        const zoom =
          id === "zoomReset"
            ? 1
            : ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index + (id === "zoomIn" ? 1 : -1)))];
        void updatePreferences({ zoom }).catch(() => toast.error("Unable to update zoom."));
      }
      if (id === "shortcuts")
        void router.navigate({ to: "/settings", search: { section: "shortcuts" } }).then(() => {
          if (narrow) setSettingsCollapsed(true);
        });
      if (id === "reload") setReloadOpen(true);
      if (id === "about") setAboutOpen(true);
      if (id === "share") setShareOpen(true);
      if (id === "importText") void scratchpad?.importText();
      if (id === "exportText") void scratchpad?.exportText();
      if (id === "saveSession") void scratchpad?.saveDraft();
      if (id === "newWindow") void runAction(id, () => window.desktop.window.newWindow());
      if (id === "hashFile") void runAction(id, () => window.desktop.tasks.startFileHash());
      if (id === "checkUpdates") void runAction(id, checkForUpdates);
      if (id === "copyDiagnostics")
        void runAction(id, () => window.desktop.diagnostics.copyReport(), "Diagnostics copied");
      if (id === "openLogs") void runAction(id, () => window.desktop.diagnostics.openLogs());
    },
    [
      actions,
      appInfo?.packaged,
      preferences,
      updatePreferences,
      router,
      narrow,
      scratchpad,
      checkForUpdates,
      runAction,
      setSettingsCollapsed,
      setReloadOpen,
      setAboutOpen,
      setShareOpen,
    ],
  );
  const latestCommand = useRef(executeCommand);
  useLayoutEffect(() => {
    latestCommand.current = executeCommand;
  }, [executeCommand]);
  useEffect(
    () =>
      window.desktop.commands.onCommand((id) => {
        if (isOverlayOpen()) return;
        latestCommand.current(id);
      }),
    [],
  );
  // macOS menu accelerators arrive through `onCommand`. Windows and Linux windows are frameless and have
  // no native menu, so the same bindings are resolved here. The shortcut recorder captures keys first.
  const shortcuts = preferences?.shortcuts;
  const packaged = appInfo?.packaged ?? false;
  useEffect(() => {
    if (platform === "darwin") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat || event.isComposing || isOverlayOpen()) return;
      if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return;
      let binding: string;
      try {
        binding = keyEventBinding(event, false);
      } catch {
        return;
      }
      const id = commandForBinding(binding, shortcuts, packaged);
      if (!id) return;
      event.preventDefault();
      latestCommand.current(id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [platform, shortcuts, packaged]);

  const paletteCommands: PaletteCommand[] = [
    ...COMMAND_IDS.filter((id) => id !== "commandPalette" && commandAvailable(id, appInfo?.packaged ?? false)).map(
      (id) => ({
        id,
        label: COMMANDS[id].label,
        keywords: COMMANDS[id].group,
        run: () => executeCommand(id),
        shortcut: shortcutLabel(id, platform === "darwin"),
      }),
    ),
    ...(["light", "dark", "system"] as const).map((theme) => ({
      id: `theme-${theme}`,
      label: `Appearance: ${theme}`,
      keywords: "theme color",
      run: () => updatePreferences({ theme }),
    })),
  ];

  return { executeCommand, paletteCommands, runAction, pendingAction };
}
