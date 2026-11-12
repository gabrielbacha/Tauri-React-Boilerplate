/** Dialogs, menus and popovers. While one is open, window-level shortcuts and focus traps stand back. */
export const OVERLAYS =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [data-shortcut-layer="interactive"], .ui-popover[data-state="open"]';

export const isOverlayOpen = (): boolean => document.querySelector(OVERLAYS) !== null;
