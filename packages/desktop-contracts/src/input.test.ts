// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";

import { isComposingInput } from "./composition";
import { isOverlayOpen } from "./overlays";
afterEach(() => document.body.replaceChildren());
it("passive tooltip and popper wrapper do not block commands, interactive layers do", () => {
  document.body.innerHTML = '<div data-radix-popper-content-wrapper><div role="tooltip">Tip</div></div>';
  expect(isOverlayOpen()).toBe(false);
  for (const role of ["menu", "dialog", "alertdialog"]) {
    document.body.innerHTML = `<div role="${role}"></div>`;
    expect(isOverlayOpen()).toBe(true);
  }
});
it("composition and legacy IME Enter stay separate from ordinary selection", () => {
  expect(isComposingInput({ isComposing: true, keyCode: 13 })).toBe(true);
  expect(isComposingInput({ isComposing: false, keyCode: 229 })).toBe(true);
  expect(isComposingInput({ isComposing: false, keyCode: 13 })).toBe(false);
});
