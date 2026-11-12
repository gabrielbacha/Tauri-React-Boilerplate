import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Coalesce rapid toggles and serialize writes so an older IPC response cannot win.
export function useSidebarPreference(saved: boolean, persist: (collapsed: boolean) => Promise<void>) {
  const [collapsed, setCollapsed] = useState(saved);
  const desired = useRef(saved);
  const confirmed = useRef(saved);
  const saving = useRef(false);
  useEffect(() => {
    if (saving.current) return;
    confirmed.current = saved;
    desired.current = saved;
    setCollapsed(saved);
  }, [saved]);
  const set = async (next: boolean): Promise<void> => {
    desired.current = next;
    setCollapsed(next);
    if (saving.current) return;
    saving.current = true;
    try {
      while (desired.current !== confirmed.current) {
        const target = desired.current;
        // Writes must remain ordered; parallel IPC requests can persist stale state.
        // eslint-disable-next-line no-await-in-loop
        await persist(target);
        confirmed.current = target;
      }
    } catch {
      desired.current = confirmed.current;
      setCollapsed(confirmed.current);
      toast.error("Unable to save the sidebar preference.");
    } finally {
      saving.current = false;
    }
  };
  return { collapsed, set };
}
