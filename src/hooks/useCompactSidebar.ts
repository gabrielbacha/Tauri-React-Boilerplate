import { useEffect, useState } from "react";

export function useCompactSidebar(savedCollapsed: boolean): {
  collapsed: boolean;
  setNarrowOverride: (value: boolean) => void;
  narrow: boolean;
} {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 959px)").matches);
  const [override, setOverride] = useState<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 959px)");
    const change = (): void => {
      setNarrow(media.matches);
      setOverride(null);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return {
    collapsed: narrow ? (override ?? true) : savedCollapsed,
    setNarrowOverride: setOverride,
    narrow,
  };
}
