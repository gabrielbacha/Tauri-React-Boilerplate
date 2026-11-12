import { useRef, type RefObject } from "react";

/** Controlled dialogs have no Radix Trigger; explicitly remember the invoking control. */
export function useDialogReturnFocus(fallback?: RefObject<HTMLElement | null>): {
  onOpenAutoFocus: () => void;
  onCloseAutoFocus: (event: Event) => void;
} {
  const target = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      target.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus: (event) => {
      event.preventDefault();
      const original = target.current;
      const control =
        original?.isConnected && original !== document.body && !original.matches(":disabled")
          ? original
          : fallback?.current;
      control?.focus();
    },
  };
}
