import { Hint } from "../ui/tooltip";
export default function DragWindowRegion() {
  const isMac = window.desktop.window.platform === "darwin";

  return (
    <div className="drag-region window-drag-region">
      {!isMac ? (
        <div className="no-drag window-controls">
          <WindowButton label="Minimize" onClick={() => void window.desktop.window.minimize()}>
            <path d="M3 8h10" />
          </WindowButton>
          <WindowButton label="Maximize" onClick={() => void window.desktop.window.toggleMaximize()}>
            <rect x="3.5" y="3.5" width="9" height="9" rx=".5" />
          </WindowButton>
          <WindowButton label="Close" danger onClick={() => void window.desktop.window.close()}>
            <path d="m4 4 8 8m0-8-8 8" />
          </WindowButton>
        </div>
      ) : null}
    </div>
  );
}

function WindowButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Hint label={label} side="bottom">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`grid w-12 place-items-center text-muted-foreground transition-colors ${
          danger ? "hover:bg-red-500 hover:text-white" : "hover:bg-muted hover:text-foreground"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
          {children}
        </svg>
      </button>
    </Hint>
  );
}
