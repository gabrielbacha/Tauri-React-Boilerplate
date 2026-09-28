import { expect, it } from "vitest";

import {
  bindingLabel,
  commandAvailable,
  commandForBinding,
  effectiveBinding,
  keyEventBinding,
  normalizeBinding,
  validateShortcuts,
} from "./commands";

it("leaves sidebar unassigned and distinguishes clearing from resetting", () => {
  expect(effectiveBinding("toggleSidebar")).toBeNull();
  expect(effectiveBinding("settings", { settings: null })).toBeNull();
  expect(effectiveBinding("settings", {})).toBe("Mod+,");
  expect(commandAvailable("reload", true)).toBe(false);
});
it("canonicalizes equivalent combinations and formats platform labels", () => {
  expect(normalizeBinding("Shift+cmd+b", true)).toBe("Mod+Shift+B");
  expect(normalizeBinding("Ctrl+Shift+b", false)).toBe("Mod+Shift+B");
  expect(normalizeBinding("Mod+Shift+=", true)).toBe("Mod+Plus");
  expect(normalizeBinding("Mod+Up", true)).toBe("Mod+Up");
  expect(normalizeBinding("Mod+?", true)).toBe("Mod+Shift+/");
  expect(bindingLabel("Mod+Shift+B", true)).toBe("⌘⇧B");
  expect(bindingLabel("Mod+Shift+B", false)).toBe("Ctrl+Shift+B");
});
it("rejects conflicts, reserved combinations, bare typing, and multi-step chords", () => {
  expect(() => validateShortcuts({ toggleSidebar: "Command+K" }, true, false)).toThrow("Search commands");
  expect(() => validateShortcuts({ toggleSidebar: "Mod+C" }, true, false)).toThrow("reserved");
  expect(() => validateShortcuts({ toggleSidebar: "Alt+F4" }, false, false)).toThrow("reserved");
  for (const value of ["B", "Shift+B", "Mod+K Mod+B", "Mod+Escape", "Mod+F25", "Bogus+B"]) {
    expect(() => normalizeBinding(value, true)).toThrow(/./);
  }
  expect(validateShortcuts({ toggleSidebar: "Mod+Shift+B" }, true, false)).toEqual({ toggleSidebar: "Mod+Shift+B" });
});
it("turns key presses into stored bindings on each platform", () => {
  const press = (key: string, modifiers: Partial<KeyboardEvent> = {}) =>
    ({
      key,
      code: `Key${key.toUpperCase()}`,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      ...modifiers,
    }) as KeyboardEvent;
  expect(keyEventBinding(press("k", { metaKey: true }), true)).toBe("Mod+K");
  expect(keyEventBinding(press("k", { ctrlKey: true }), false)).toBe("Mod+K");
  expect(keyEventBinding(press("S", { ctrlKey: true, shiftKey: true }), false)).toBe("Mod+Shift+S");
  expect(keyEventBinding(press("+", { ctrlKey: true }), false)).toBe("Mod+Plus");
  expect(() => keyEventBinding(press("k", { metaKey: true }), false)).toThrow("system key");
});
it("finds the command for a binding, honouring overrides", () => {
  expect(commandForBinding("Mod+K")).toBe("commandPalette");
  expect(commandForBinding("Mod+K", { commandPalette: null })).toBeUndefined();
  expect(commandForBinding("Mod+Shift+B", { toggleSidebar: "Mod+Shift+B" })).toBe("toggleSidebar");
  expect(commandForBinding("Mod+R", {}, true)).toBeUndefined();
  expect(commandForBinding("Mod+R", {}, false)).toBe("reload");
});
