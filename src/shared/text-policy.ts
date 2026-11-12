import { DEFAULT_TEXT_POLICY, type TextPolicy } from "../../packages/desktop-contracts/src/text-policy";
export { textWithinLimits } from "../../packages/desktop-contracts/src/text-policy";
export const TAURI_TEXT_POLICY: TextPolicy = { ...DEFAULT_TEXT_POLICY, units: "scalar" };
