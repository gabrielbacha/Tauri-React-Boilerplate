// @vitest-environment jsdom
import { expect, it } from "vitest";

import { isDragTarget } from "./window-drag";

it("drags from title-bar regions but not from controls inside them", () => {
  document.body.innerHTML = `
    <div class="drag-region" id="bar"><span id="label">Title</span><button id="button">Menu</button>
      <div class="no-drag"><span id="nested">Search</span></div>
    </div>
    <header class="details-panel-header" id="details"></header>
    <main id="content"></main>`;
  const byId = (id: string) => document.getElementById(id);
  expect(isDragTarget(byId("bar"))).toBe(true);
  expect(isDragTarget(byId("label"))).toBe(true);
  expect(isDragTarget(byId("details"))).toBe(true);
  expect(isDragTarget(byId("button"))).toBe(false);
  expect(isDragTarget(byId("nested"))).toBe(false);
  expect(isDragTarget(byId("content"))).toBe(false);
  expect(isDragTarget(null)).toBe(false);
});
