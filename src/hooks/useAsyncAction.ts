import { useCallback, useRef, useState } from "react";

import { errorMessage } from "@/shared/errors";

export type ActionResult<T> =
  | { status: "success"; value: T }
  | { status: "error"; error: Error }
  | { status: "skipped" };

type AsyncActionState = "idle" | "running" | "success" | "error";
interface ActionFeedback<TResult> {
  onSuccess?: (result: TResult) => void;
  onError?: (error: Error) => void;
}

interface AsyncAction<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<ActionResult<TResult>>;
  runAction: <T>(id: string, operation: () => Promise<T>, feedback?: ActionFeedback<T>) => Promise<ActionResult<T>>;
  reset: () => void;
  state: AsyncActionState;
  error: Error | null;
  pendingId: string | null;
  isRunning: boolean;
}

export function useAsyncAction<TArgs extends unknown[] = [], TResult = void>(
  action?: (...args: TArgs) => Promise<TResult>,
): AsyncAction<TArgs, TResult> {
  const running = useRef(false);
  const [state, setState] = useState<AsyncActionState>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const runAction = useCallback(
    async <T>(id: string, operation: () => Promise<T>, feedback?: ActionFeedback<T>): Promise<ActionResult<T>> => {
      if (running.current) return { status: "skipped" };
      running.current = true;
      setPendingId(id);
      setState("running");
      setError(null);
      try {
        const result = await operation();
        feedback?.onSuccess?.(result);
        setState("success");
        return { status: "success", value: result };
      } catch (caught) {
        const failure = new Error(errorMessage(caught, "The action failed."));
        setError(failure);
        setState("error");
        feedback?.onError?.(failure);
        return { status: "error", error: failure };
      } finally {
        running.current = false;
        setPendingId(null);
      }
    },
    [],
  );
  const run = useCallback(
    async (...args: TArgs): Promise<ActionResult<TResult>> => {
      if (!action) return { status: "skipped" };
      return runAction("default", () => action(...args));
    },
    [action, runAction],
  );
  const reset = useCallback(() => {
    setState("idle");
    setError(null);
  }, []);
  return { run, runAction, reset, state, error, pendingId, isRunning: state === "running" };
}
