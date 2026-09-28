import { useEffect } from "react";

import { isOverlayOpen } from "../utils/dom-overlays";

// Only traps the responsive panel. Radix portals retain their own modal/menu focus handling.
export function useOverlayFocus(active: boolean, selector: string, trigger: string) {
  useEffect(() => {
    if (!active) return;
    const getItems = (): HTMLElement[] =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          `${trigger}, ${selector} button:not(:disabled), ${selector} a[href], ${selector} [tabindex="0"]`,
        ),
      ).filter((element) => !element.closest("[inert]") && element.getClientRects().length > 0);
    const keydown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      if (isOverlayOpen()) return;
      const items = getItems();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !items.includes(current as HTMLElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !items.includes(current as HTMLElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [active, selector, trigger]);
}
