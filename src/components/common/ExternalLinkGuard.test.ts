// @vitest-environment jsdom
import { expect, it } from "vitest";

import { shouldOpenExternally } from "./ExternalLinkGuard";

function anchor(href: string, attributes: Record<string, string> = {}): HTMLAnchorElement {
  const element = document.createElement("a");
  element.setAttribute("href", href);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

it("opens HTTPS and mail links outside the app", () => {
  expect(shouldOpenExternally(anchor("https://example.com/docs"), "tauri://localhost")).toBe(true);
  expect(shouldOpenExternally(anchor("mailto:team@example.com"), "tauri://localhost")).toBe(true);
});

it("leaves in-app, insecure, credentialed, and download links alone", () => {
  const origin = "http://localhost:3000";
  expect(shouldOpenExternally(anchor("#section"), origin)).toBe(false);
  expect(shouldOpenExternally(anchor("/settings"), origin)).toBe(false);
  expect(shouldOpenExternally(anchor("http://example.com"), origin)).toBe(false);
  expect(shouldOpenExternally(anchor("https://user:secret@example.com"), origin)).toBe(false);
  expect(shouldOpenExternally(anchor("https://example.com/file.zip", { download: "" }), origin)).toBe(false);
  expect(shouldOpenExternally(anchor("javascript:alert(1)"), origin)).toBe(false);
});
