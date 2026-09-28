import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect } from "react";

import { emitDebugEvent } from "@/components/dev/debug-events";

/**
 * Open external links in the system browser. Rust blocks the same navigations; this guard avoids the
 * blocked navigation entirely and keeps modified clicks (new tab, download) inert.
 */
export function shouldOpenExternally(anchor: HTMLAnchorElement, origin: string): boolean {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || anchor.hasAttribute("download")) return false;
  try {
    const url = new URL(anchor.href, origin);
    if (url.protocol === "mailto:") return true;
    return url.protocol === "https:" && url.origin !== origin && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isModifiedClick(event: MouseEvent): boolean {
  return (
    event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
  );
}

export function ExternalLinkGuard(): null {
  useEffect(() => {
    const handleClick = (event: MouseEvent): void => {
      if (isModifiedClick(event) || !(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || !shouldOpenExternally(anchor, window.location.origin)) return;
      event.preventDefault();
      if (import.meta.env.DEV)
        emitDebugEvent({
          id: crypto.randomUUID(),
          kind: "external-link",
          href: anchor.href,
          timestamp: new Date().toISOString(),
        });
      void openUrl(anchor.href);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);
  return null;
}
