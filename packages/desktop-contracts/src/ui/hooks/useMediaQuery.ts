import { useCallback, useSyncExternalStore } from "react";

// One MediaQueryList per query (for each matchMedia implementation), so reading the snapshot does
// not create a new one on each render.
const lists = new WeakMap<typeof window.matchMedia, Map<string, MediaQueryList>>();
const listFor = (query: string): MediaQueryList => {
  let byQuery = lists.get(window.matchMedia);
  if (!byQuery) {
    byQuery = new Map();
    lists.set(window.matchMedia, byQuery);
  }
  let list = byQuery.get(query);
  if (!list) {
    list = window.matchMedia(query);
    byQuery.set(query, list);
  }
  return list;
};

/** Whether a CSS media query matches, updated when it changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = listFor(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => listFor(query).matches);
}
