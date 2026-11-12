export * from "../../packages/desktop-contracts/src/commands";
import {
  COMMAND_IDS,
  effectiveBinding,
  commandAvailable as portableCommandAvailable,
  type CommandId,
  type ShortcutOverrides,
} from "../../packages/desktop-contracts/src/commands";
import { SHOWCASE_ENABLED } from "./features";
export function commandAvailable(id: CommandId, packaged: boolean): boolean {
  return portableCommandAvailable(id, packaged, SHOWCASE_ENABLED);
}
export function commandForBinding(
  binding: string,
  overrides: ShortcutOverrides = {},
  packaged = true,
): CommandId | undefined {
  return COMMAND_IDS.find((id) => commandAvailable(id, packaged) && effectiveBinding(id, overrides) === binding);
}
