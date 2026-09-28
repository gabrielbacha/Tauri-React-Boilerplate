import { useEffect, useRef, useState } from "react";

import { isOverlayOpen } from "../utils/dom-overlays";

export function useSidebarPreview(enabled: boolean) {
  const [shown, setShown] = useState(false);
  const [present, setPresent] = useState(false);
  useEffect(() => {
    if (enabled && shown) {
      setPresent(true);
      return;
    }
    const exit = setTimeout(() => setPresent(false), 500);
    return () => clearTimeout(exit);
  }, [enabled, shown]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = (): void => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  const close = (): void => {
    cancel();
    setShown(false);
  };
  const enter = (): void => {
    cancel();
    if (enabled)
      timer.current = setTimeout(() => {
        timer.current = undefined;
        setShown(true);
      }, 150);
  };
  useEffect(() => {
    if (!enabled) setShown(false);
    return () => clearTimeout(timer.current);
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !shown) return;
    const move = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest("#app-sidebar, .shell-sidebar-toggle, [data-radix-popper-content-wrapper]") ||
        document.activeElement?.closest("#app-sidebar") ||
        isOverlayOpen()
      ) {
        clearTimeout(timer.current);
        timer.current = undefined;
        return;
      }
      if (timer.current === undefined)
        timer.current = setTimeout(() => {
          setShown(false);
          timer.current = undefined;
        }, 200);
    };
    const outside = (event: PointerEvent): void => {
      if (
        event.target instanceof Element &&
        !event.target.closest("#app-sidebar, .shell-sidebar-toggle, [data-radix-popper-content-wrapper]")
      ) {
        clearTimeout(timer.current);
        timer.current = undefined;
        setShown(false);
      }
    };
    const blur = (): void => {
      clearTimeout(timer.current);
      setShown(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("blur", blur);
    window.addEventListener("pointerdown", outside);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointerdown", outside);
    };
  }, [enabled, shown]);
  return { present: enabled && (present || shown), open: enabled && shown, enter, cancel, close };
}
