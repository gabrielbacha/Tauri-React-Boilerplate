import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";

import { cn } from "@/utils/tailwind";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root data-slot="switch" className={cn("switch-control", className)} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className="switch-thumb" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
