import { useDesktop } from "@desktop/context/DesktopContext";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useDesktop();
  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      style={
        {
          "--normal-bg": "hsl(var(--popover))",
          "--normal-text": "hsl(var(--foreground))",
          "--normal-border": "var(--stroke)",
        } as CSSProperties
      }
      {...props}
    />
  );
}
