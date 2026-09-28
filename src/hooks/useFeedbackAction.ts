import { useCallback } from "react";
import { toast } from "sonner";

import { useAsyncAction, type ActionResult } from "./useAsyncAction";

interface FeedbackAction {
  run: (id: string, action: () => Promise<unknown>, success?: string) => Promise<ActionResult<unknown>>;
  pending: string | null;
  busy: boolean;
}

export function useFeedbackAction(): FeedbackAction {
  const { runAction, pendingId } = useAsyncAction();
  const run = useCallback(
    async (id: string, action: () => Promise<unknown>, success?: string): Promise<ActionResult<unknown>> => {
      return runAction(id, action, {
        onSuccess: () => {
          if (success) toast.success(success);
        },
        onError: () => {
          toast.error("Unable to complete that action. Please try again.");
        },
      });
    },
    [runAction],
  );
  return { run, pending: pendingId, busy: pendingId !== null };
}
