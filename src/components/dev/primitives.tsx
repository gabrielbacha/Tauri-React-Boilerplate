import { createContext, useContext, useId, useMemo, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/utils/tailwind";

/** Small primitives for the development-only debug panel. Production UI uses `components/ui`. */

const BADGE_VARIANTS = {
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  outline: "border border-border text-foreground",
} as const;

export function Badge({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<"span"> & { variant?: keyof typeof BADGE_VARIANTS }) {
  return (
    <span
      className={cn("inline-flex items-center justify-center font-medium", BADGE_VARIANTS[variant], className)}
      {...props}
    />
  );
}

export function DropdownMenuShortcut({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("ml-auto text-xs tracking-wide text-muted-foreground", className)} {...props} />;
}

interface TabsState {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsState | null>(null);

function useTabs(): TabsState {
  const state = useContext(TabsContext);
  if (!state) throw new Error("Tabs parts must be inside <Tabs>.");
  return state;
}

export function Tabs({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const state = useMemo(() => ({ id, value, onValueChange }), [id, value, onValueChange]);
  return (
    <TabsContext value={state}>
      <div className={cn("flex flex-col", className)}>{children}</div>
    </TabsContext>
  );
}

export function TabsList({ className, ...props }: ComponentProps<"div">) {
  return <div role="tablist" className={cn("inline-flex items-center", className)} {...props} />;
}

export function TabsTrigger({ value, className, ...props }: ComponentProps<"button"> & { value: string }) {
  const tabs = useTabs();
  const selected = tabs.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${tabs.id}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${tabs.id}-panel-${value}`}
      data-state={selected ? "active" : "inactive"}
      className={cn(
        "inline-flex items-center justify-center text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground",
        className,
      )}
      onClick={() => tabs.onValueChange(value)}
      {...props}
    />
  );
}

export function TabsContent({ value, className, ...props }: ComponentProps<"div"> & { value: string }) {
  const tabs = useTabs();
  if (tabs.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${tabs.id}-panel-${value}`}
      aria-labelledby={`${tabs.id}-tab-${value}`}
      className={className}
      {...props}
    />
  );
}
