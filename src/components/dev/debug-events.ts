import { boundedDebugValue, debugText } from "./debug-value";
export const DEBUG_EVENT_NAME = "app:debug";

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
};

export type ExternalLinkDebugEvent = {
  id: string;
  kind: "external-link";
  href: string;
  timestamp: string;
};

export type InvokeDebugEvent = {
  id: string;
  kind: "invoke";
  command: string;
  args: unknown;
  durationMs: number;
  status: "success" | "error";
  result?: unknown;
  error?: SerializedError;
  timestamp: string;
};

export type RuntimeEventDebugEvent = {
  id: string;
  kind: "runtime-event";
  name: string;
  source: "window" | "tauri-event";
  payload?: unknown;
  timestamp: string;
};

export type LogDebugEvent = {
  id: string;
  kind: "log";
  level: "log" | "info" | "warn" | "error" | "debug";
  message: string;
  timestamp: string;
};

export type DebugEvent = ExternalLinkDebugEvent | InvokeDebugEvent | RuntimeEventDebugEvent | LogDebugEvent;

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: debugText(error.name),
      message: debugText(error.message),
      stack: debugText(error.stack),
    };
  }

  return {
    name: "Error",
    message: debugText(error),
  };
}

export function serializeDebugValue(value: unknown): unknown {
  return boundedDebugValue(value);
}

export function emitDebugEvent(detail: DebugEvent) {
  if (typeof window === "undefined") {
    return;
  }

  const safe = { ...detail };
  if (safe.kind === "invoke") {
    safe.args = boundedDebugValue(safe.args);
    safe.result = boundedDebugValue(safe.result);
    if (safe.error)
      safe.error = {
        name: debugText(safe.error.name),
        message: debugText(safe.error.message),
        stack: debugText(safe.error.stack),
      };
  }
  if (safe.kind === "runtime-event") safe.payload = boundedDebugValue(safe.payload);
  if (safe.kind === "log") safe.message = debugText(safe.message);
  if (safe.kind === "external-link") safe.href = debugText(safe.href);
  window.dispatchEvent(new CustomEvent<DebugEvent>(DEBUG_EVENT_NAME, { detail: safe }));
}
