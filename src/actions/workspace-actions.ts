import { COMMANDS, bindingLabel, effectiveBinding, type CommandId } from "@/shared/commands";

import { useDesktop } from "../context/DesktopContext";

export type WorkspaceActionId = Extract<
  CommandId,
  "workspace" | "settings" | "toggleSidebar" | "toggleDetails" | "commandPalette"
>;
export interface WorkspaceAction {
  label: string;
  run: () => void | Promise<void>;
}
export function useShortcutLabel(): (id: CommandId, mac: boolean) => string {
  const { preferences } = useDesktop();
  return (id, mac) => bindingLabel(effectiveBinding(id, preferences?.shortcuts), mac);
}
export function createWorkspaceActions(
  handlers: Record<WorkspaceActionId, WorkspaceAction["run"]>,
): Record<WorkspaceActionId, WorkspaceAction> {
  return Object.fromEntries(
    Object.entries(handlers).map(([id, run]) => [id, { label: COMMANDS[id as WorkspaceActionId].label, run }]),
  ) as Record<WorkspaceActionId, WorkspaceAction>;
}
