import type { ReactNode } from "react";

import { Button } from "../ui/button";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-5 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function RecoverableError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm dark:border-red-950 dark:bg-red-950/30"
    >
      <span>{message}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
