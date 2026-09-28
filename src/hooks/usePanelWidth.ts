import { useState } from "react";

import { appConfig } from "../../package.json";
import { useViewportWidth } from "./useViewportWidth";

export function clampPanelWidth(width: number, fallback: number, minimum: number, maximum: number): number {
  return Number.isFinite(width) ? Math.max(minimum, Math.min(width, maximum)) : fallback;
}

export function usePanelWidth(name: string, fallback: number, minimum: number, reservedWidth = 400) {
  const key = `${appConfig.storageNamespace}:panel-width:v1:${name}`;
  const [saved, setSaved] = useState(() => {
    try {
      const raw =
        localStorage.getItem(key) ??
        (appConfig.storageNamespace === "electron-boilerplate"
          ? localStorage.getItem(`shell-panel-width:v1:${name}`)
          : null);
      return raw === null ? fallback : clampPanelWidth(Number(raw), fallback, minimum, 520);
    } catch {
      return fallback;
    }
  });
  const viewport = useViewportWidth();
  const maximum = Math.max(minimum, Math.min(520, viewport - reservedWidth));
  const width = clampPanelWidth(saved, fallback, minimum, maximum);
  const commit = (next: number): void => {
    const value = clampPanelWidth(next, fallback, minimum, maximum);
    setSaved(value);
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Resizing still works in sessions where persistent storage is unavailable.
    }
  };
  return { width, minimum, maximum, commit, reset: () => commit(fallback) };
}
