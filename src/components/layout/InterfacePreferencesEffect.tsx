import { useLayoutEffect } from "react";

import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useInterfacePreferences } from "../../preferences/interface-preferences";

export default function InterfacePreferencesEffect() {
  const { zoom, motion } = useInterfacePreferences();
  const systemReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  useLayoutEffect(() => {
    document.documentElement.dataset.reducedMotion = String(
      motion === "reduced" || (motion === "system" && systemReduced),
    );
  }, [motion, systemReduced]);
  useLayoutEffect(() => {
    window.desktop.window.setZoomFactor(zoom);
    // Native traffic-light positions are physical pixels; their CSS clearance must scale inversely.
    document.documentElement.style.setProperty("--interface-zoom", String(zoom));
  }, [zoom]);
  return null;
}
