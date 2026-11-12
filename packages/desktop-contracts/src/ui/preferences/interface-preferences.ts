import { useSyncExternalStore } from "react";
export { ZOOM_LEVELS } from "@/shared/interface-options";
import { ZOOM_LEVELS } from "@/shared/interface-options";

export interface InterfacePreferences {
  zoom: number;
  motion: "system" | "reduced" | "full";
}
const KEY = "interface-preferences:v1";
const DEFAULTS: InterfacePreferences = { zoom: 1, motion: "system" };
let snapshot: InterfacePreferences | undefined;
const listeners = new Set<() => void>();

export function parseInterfacePreferences(raw: string | null): InterfacePreferences {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return DEFAULTS;
    const record = value as Record<string, unknown>;
    return {
      zoom: ZOOM_LEVELS.some((level) => level === record.zoom) ? (record.zoom as number) : 1,
      motion: record.motion === "reduced" || record.motion === "full" ? record.motion : "system",
    };
  } catch {
    return DEFAULTS;
  }
}
function getSnapshot(): InterfacePreferences {
  return snapshot ?? DEFAULTS;
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function acceptInterfacePreferences(value: InterfacePreferences): void {
  if (snapshot?.zoom === value.zoom && snapshot?.motion === value.motion) return;
  snapshot = { zoom: value.zoom, motion: value.motion };
  listeners.forEach((listener) => listener());
}
export async function initializeInterfacePreferences(): Promise<import("@/shared/desktop-api").AppPreferences> {
  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(KEY);
  } catch {
    /* Storage can be unavailable. */
  }
  const preferences = await window.desktop.preferences.migrateInterface(parseInterfacePreferences(legacy));
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Main's marker prevents repeated imports. */
  }
  return preferences;
}
export async function setInterfacePreferences(patch: Partial<InterfacePreferences>): Promise<void> {
  const preferences = await window.desktop.preferences.update(patch);
  acceptInterfacePreferences(preferences);
}
export function useInterfacePreferences(): InterfacePreferences {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS);
}
