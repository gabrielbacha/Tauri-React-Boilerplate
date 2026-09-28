import { COMMAND_REGISTRY, type CommandId } from "./bindings";
import { SHOWCASE_ENABLED } from "./features";

export type { CommandId };
type CommandEntry = (typeof COMMAND_REGISTRY)[number];

/** Rust owns the registry (`src-tauri/src/commands_registry.rs`), so the native menu and interface match. */
export const COMMANDS = Object.fromEntries(COMMAND_REGISTRY.map((command) => [command.id, command])) as {
  readonly [Id in CommandId]: Extract<CommandEntry, { id: Id }>;
};
export type ShortcutOverrides = Partial<Record<CommandId, string | null>>;
export const COMMAND_IDS: CommandId[] = COMMAND_REGISTRY.map((command) => command.id);
export function commandAvailable(id: CommandId, packaged: boolean): boolean {
  return (
    (id !== "reload" || !packaged) &&
    (SHOWCASE_ENABLED || !["share", "importText", "exportText", "saveSession", "hashFile"].includes(id))
  );
}
export function effectiveBinding(id: CommandId, overrides: ShortcutOverrides = {}): string | null {
  return overrides[id] === undefined ? COMMANDS[id].binding : overrides[id]!;
}
export function bindingLabel(binding: string | null, mac: boolean): string {
  if (!binding) return "";
  const parts = binding.split("+");
  return parts
    .map(
      (part) =>
        ({
          Mod: mac ? "⌘" : "Ctrl",
          Ctrl: mac ? "⌃" : "Ctrl",
          Alt: mac ? "⌥" : "Alt",
          Shift: mac ? "⇧" : "Shift",
          Plus: "+",
          Space: "Space",
        })[part] ?? part,
    )
    .join(mac ? "" : "+");
}

export function normalizeBinding(raw: string, mac: boolean): string {
  const parts = raw.split("+").map((part) => part.trim());
  const keyRaw = parts.pop() ?? "";
  const modifiers = new Set<string>(
    parts.map((part) => {
      const lower = part.toLowerCase();
      if (["mod", "commandorcontrol", "cmdorctrl"].includes(lower)) return "Mod";
      if (["command", "cmd", "meta"].includes(lower) && mac) return "Mod";
      if (["control", "ctrl"].includes(lower)) return mac ? "Ctrl" : "Mod";
      if (["alt", "option"].includes(lower)) return "Alt";
      if (lower === "shift") return "Shift";
      throw new Error("Unsupported modifier.");
    }),
  );
  const aliases: Record<string, string> = {
    plus: "Plus",
    equal: "Plus",
    "=": "Plus",
    space: "Space",
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
    arrowup: "Up",
    arrowdown: "Down",
    arrowleft: "Left",
    arrowright: "Right",
  };
  const shifted: Record<string, string> = {
    "!": "1",
    "@": "2",
    "#": "3",
    $: "4",
    "%": "5",
    "^": "6",
    "&": "7",
    "*": "8",
    "(": "9",
    ")": "0",
    _: "-",
    "?": "/",
    ":": ";",
    '"': "'",
    "<": ",",
    ">": ".",
    "{": "[",
    "}": "]",
    "|": "\\",
    "~": "`",
  };
  if (shifted[keyRaw]) modifiers.add("Shift");
  const key = shifted[keyRaw] ?? aliases[keyRaw.toLowerCase()] ?? keyRaw.toUpperCase();
  if (!/^(?:[A-Z0-9,./;[\]'\\`-]|F(?:[1-9]|1[0-9]|2[0-4])|Plus|Space|Up|Down|Left|Right)$/.test(key))
    throw new Error("Use a letter, number, punctuation, arrow, or function key.");
  if (!/^F\d+$/.test(key) && !["Mod", "Ctrl", "Alt"].some((mod) => modifiers.has(mod)))
    throw new Error("Add Command, Ctrl, or Alt to this shortcut.");
  if (key === "Plus") modifiers.delete("Shift");
  return [...["Mod", "Ctrl", "Alt", "Shift"].filter((mod) => modifiers.has(mod)), key].join("+");
}

export function validateShortcuts(overrides: ShortcutOverrides, mac: boolean, packaged: boolean): ShortcutOverrides {
  const normalized: ShortcutOverrides = {};
  for (const id of COMMAND_IDS) {
    const value = overrides[id];
    if (value !== undefined) normalized[id] = value === null ? null : normalizeBinding(value, mac);
  }
  const reserved = new Set([
    "Mod+C",
    "Mod+V",
    "Mod+Shift+V",
    "Mod+Alt+Shift+V",
    "Mod+Shift+W",
    "Mod+Shift+I",
    "Alt+T",
    "Mod+X",
    "Mod+A",
    "Mod+Z",
    "Mod+Shift+Z",
    "Mod+Y",
    "Mod+Q",
    "Mod+W",
    "Mod+M",
    "Mod+H",
    "Mod+Alt+H",
    "Mod+Ctrl+F",
    "Alt+F4",
    "Alt+Space",
    "Alt+Tab",
    "Mod+Tab",
    "Mod+Space",
    "Mod+Alt+I",
    "Ctrl+Alt+DELETE",
    "F11",
    "F12",
  ]);
  const seen = new Map<string, CommandId>();
  for (const id of COMMAND_IDS) {
    if (!commandAvailable(id, packaged)) continue;
    const binding = effectiveBinding(id, normalized);
    if (!binding) continue;
    if (reserved.has(binding)) throw new Error("This shortcut is reserved for a system or editing action.");
    const conflict = seen.get(binding);
    if (conflict)
      throw new Error(
        `Already assigned to ${COMMANDS[conflict].label} and ${COMMANDS[id].label}. Clear one binding first.`,
      );
    seen.set(binding, id);
  }
  return normalized;
}

type KeyInput = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** The stored binding for a key press, for example `Mod+Shift+S`. Throws for unsupported combinations. */
export function keyEventBinding(event: KeyInput, mac: boolean): string {
  let key = event.key === " " ? "Space" : event.key === "+" ? "Plus" : event.key;
  if (event.altKey && /^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  if (!mac && event.metaKey) throw new Error("Use Ctrl or Alt instead of the system key.");
  const modifiers = [
    event.metaKey ? "Mod" : null,
    event.ctrlKey ? "Ctrl" : null,
    event.altKey ? "Alt" : null,
    event.shiftKey ? "Shift" : null,
  ].filter(Boolean);
  return normalizeBinding([...modifiers, key].join("+"), mac);
}

/** The available command bound to `binding`, if any. */
export function commandForBinding(
  binding: string,
  overrides: ShortcutOverrides = {},
  packaged = true,
): CommandId | undefined {
  return COMMAND_IDS.find((id) => commandAvailable(id, packaged) && effectiveBinding(id, overrides) === binding);
}
