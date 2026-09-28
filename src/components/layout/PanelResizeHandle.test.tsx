// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import PanelResizeHandle from "./PanelResizeHandle";

afterEach(cleanup);

it("shows width during drag and commits once on release, then resets by keyboard", () => {
  Element.prototype.setPointerCapture = vi.fn<(...args: unknown[]) => void>();
  Element.prototype.releasePointerCapture = vi.fn<(...args: unknown[]) => void>();
  const commit = vi.fn<(...args: unknown[]) => void>();
  const reset = vi.fn<(...args: unknown[]) => void>();
  render(
    <div id="panel-owner">
      <PanelResizeHandle
        id="panel-handle"
        label="Resize panel"
        controls="panel"
        edge="right"
        width={300}
        minimum={240}
        maximum={520}
        variable={{ name: "--panel-width", on: "#panel-owner" }}
        onCommit={commit}
        onReset={reset}
      />
    </div>,
  );
  const handle = screen.getByRole("separator", { name: "Resize panel" });
  const owner = document.getElementById("panel-owner")!;
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150 });
  expect(owner.style.getPropertyValue("--panel-width")).toBe("350px");
  expect(commit).not.toHaveBeenCalled();
  fireEvent.pointerUp(handle, { pointerId: 1 });
  expect(commit).toHaveBeenCalledWith(350);
  fireEvent.keyDown(handle, { key: "Home" });
  expect(reset).toHaveBeenCalledOnce();
});

it("restores the starting width when a drag is cancelled", () => {
  Element.prototype.setPointerCapture = vi.fn<(...args: unknown[]) => void>();
  const commit = vi.fn<(...args: unknown[]) => void>();
  render(
    <div id="panel-owner">
      <PanelResizeHandle
        id="panel-handle"
        label="Resize panel"
        controls="panel"
        edge="right"
        width={300}
        minimum={240}
        maximum={520}
        variable={{ name: "--panel-width", on: "#panel-owner" }}
        onCommit={commit}
        onReset={vi.fn<(...args: unknown[]) => void>()}
      />
    </div>,
  );
  const handle = screen.getByRole("separator", { name: "Resize panel" });
  const owner = document.getElementById("panel-owner")!;
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150 });
  fireEvent.pointerCancel(handle, { pointerId: 1 });
  expect(owner.style.getPropertyValue("--panel-width")).toBe("300px");
  expect(commit).not.toHaveBeenCalled();
});
