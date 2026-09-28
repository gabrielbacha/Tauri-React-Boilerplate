import { error as logError } from "@tauri-apps/plugin-log";

import { serializeError } from "@/components/dev/debug-events";

/** Send uncaught interface errors to the application log, beside the Rust log lines. */
export function installErrorLog(): void {
  window.addEventListener("error", (event) => {
    void logError(`Uncaught interface error: ${event.message}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = serializeError(event.reason);
    void logError(`Unhandled interface rejection: ${reason.name}: ${reason.message}`);
  });
}
