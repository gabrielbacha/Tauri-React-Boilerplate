/** Dialogs, menus and popovers. While one is open, window-level shortcuts and focus traps stand back. */
const OVERLAYS =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper], .ui-popover[data-state="open"]';

export const isOverlayOpen = (): boolean => document.querySelector(OVERLAYS) !== null;
