import { useRef, useState } from "react";

interface Props {
  id: string;
  label: string;
  controls: string;
  edge: "left" | "right";
  width: number;
  minimum: number;
  maximum: number;
  /**
   * The CSS variable that sizes the panel, and a selector for the ancestor that holds it. A drag
   * writes the variable directly, so the layout does not re-render on each move; the width is
   * committed when the drag ends.
   */
  variable: { name: `--${string}`; on: string };
  onCommit: (width: number) => void;
  onReset: () => void;
  onCollapse?: () => void;
}

export default function PanelResizeHandle(props: Props) {
  const { id, label, controls, edge, width, minimum, maximum, variable, onCommit, onReset, onCollapse } = props;
  const drag = useRef<{ x: number; width: number; next: number; handle: HTMLElement } | null>(null);
  const [dragging, setDragging] = useState(false);
  const show = (handle: HTMLElement, value: number): void => {
    handle.closest<HTMLElement>(variable.on)?.style.setProperty(variable.name, `${value}px`);
    handle.setAttribute("aria-valuenow", String(Math.round(value)));
  };
  const finish = (cancel: boolean): void => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setDragging(false);
    const collapse = !cancel && onCollapse && current.next < minimum / 2;
    if (cancel || collapse) show(current.handle, current.width);
    if (collapse) onCollapse();
    else if (!cancel) onCommit(Math.max(minimum, Math.min(current.next, maximum)));
  };
  return (
    <div
      role="separator"
      id={id}
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation="vertical"
      aria-valuenow={Math.round(width)}
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      title="Drag to resize · Double-click to reset · Arrow keys to adjust"
      className="panel-resize-handle no-drag"
      data-edge={edge}
      data-dragging={dragging}
      onDoubleClick={onReset}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width, next: width, handle: event.currentTarget };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const next = drag.current.width + (event.clientX - drag.current.x) * (edge === "right" ? 1 : -1);
        drag.current.next = next;
        show(event.currentTarget, Math.max(minimum, Math.min(next, maximum)));
      }}
      onPointerUp={(event) => {
        finish(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => finish(true)}
      onLostPointerCapture={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && drag.current) {
          event.preventDefault();
          event.stopPropagation();
          finish(true);
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          onReset();
        }
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const delta = (event.key === "ArrowRight" ? 1 : -1) * (edge === "right" ? 1 : -1);
        onCommit(width + delta * (event.shiftKey ? 40 : 10));
      }}
    />
  );
}
