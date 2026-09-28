import { useSyncExternalStore } from "react";

// One resize listener for the whole renderer, however many components read the width. Browsers
// already send at most one resize event per frame.
const listeners = new Set<() => void>();
const publish = (): void => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void): (() => void) => {
  if (!listeners.size) window.addEventListener("resize", publish);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("resize", publish);
  };
};
const snapshot = (): number => window.innerWidth;

/** The window's inner width, updated on resize. */
export function useViewportWidth(): number {
  return useSyncExternalStore(subscribe, snapshot);
}
