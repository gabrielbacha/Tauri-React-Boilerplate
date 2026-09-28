import { getCurrentWindow } from "@tauri-apps/api/window";

/** Elements that move the window, and elements inside them that must stay clickable. */
export const DRAG_SELECTOR = ".drag-region, .details-panel-header";
export const NO_DRAG_SELECTOR =
  ".no-drag, button, a, input, textarea, select, summary, [role='button'], [role='separator'], [contenteditable='true']";

export function isDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(DRAG_SELECTOR)) && !target.closest(NO_DRAG_SELECTOR);
}

function onMouseDown(event: MouseEvent): void {
  if (event.button !== 0 || !isDragTarget(event.target)) return;
  event.preventDefault();
  if (event.detail === 2) void getCurrentWindow().toggleMaximize();
  else void getCurrentWindow().startDragging();
}

/**
 * Move the window from the title-bar regions the styles mark with `.drag-region`.
 * The CSS classes stay the single source of truth for what drags, on every platform.
 */
export function installWindowDrag(): () => void {
  document.addEventListener("mousedown", onMouseDown);
  return () => document.removeEventListener("mousedown", onMouseDown);
}
