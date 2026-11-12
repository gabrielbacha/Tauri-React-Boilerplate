import * as Tooltip from "@radix-ui/react-tooltip";
import type { ReactElement } from "react";

export function Hint({
  label,
  children,
  shortcut,
  side = "right",
}: {
  label: string;
  shortcut?: string;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
}): ReactElement {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content collisionPadding={8} side={side} sideOffset={6} className="ui-surface ui-tooltip">
          <span>{label}</span>
          {shortcut ? <kbd className="tooltip-shortcut">{shortcut}</kbd> : null}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
export const TooltipProvider = Tooltip.Provider;
