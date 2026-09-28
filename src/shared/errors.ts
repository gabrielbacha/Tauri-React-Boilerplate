import type { AppError } from "./bindings";

function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { kind?: unknown }).kind === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

/**
 * A user-facing message for a failed call.
 *
 * Rust commands reject with an `AppError` whose message is written for people. Other rejections, such
 * as a permission denial from the Tauri runtime, are technical, so the fallback is shown when given.
 */
export function errorMessage(error: unknown, fallback?: string): string {
  if (isAppError(error)) return error.message;
  if (error instanceof Error) return error.message;
  if (fallback !== undefined) return fallback;
  return typeof error === "string" ? error : String(error);
}
