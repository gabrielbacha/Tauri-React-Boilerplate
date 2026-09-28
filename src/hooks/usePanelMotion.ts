import { animate, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";

import { useInterfacePreferences } from "../preferences/interface-preferences";
import { useMediaQuery } from "./useMediaQuery";

// Matches the extracted shell's duration-based spring. Clamp layout, not the spring itself.
export const PANEL_SPRING = { type: "spring", duration: 0.5, bounce: 0.1 } as const;

export function usePanelMotion(open: boolean) {
  const progress = useMotionValue(open ? 1 : 0);
  const systemReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const { motion } = useInterfacePreferences();
  const reduced = motion === "reduced" || (motion === "system" && systemReduced);
  const bounded = useTransform(progress, (value) => Math.max(0, Math.min(1, value)));
  useEffect(() => {
    if (reduced) {
      progress.set(open ? 1 : 0);
      return;
    }
    const animation = animate(progress, open ? 1 : 0, PANEL_SPRING);
    return () => animation.stop();
  }, [open, progress, reduced]);
  return bounded;
}
