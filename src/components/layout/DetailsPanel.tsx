import { motion, type MotionValue } from "motion/react";
import { useEffect, useState } from "react";

import type { DiagnosticsSnapshot } from "@/shared/desktop-api";
import { isActiveTask, isCompletedTask } from "@/shared/tasks";

import { useDesktop, useTasks } from "../../context/DesktopContext";
import type { usePanelWidth } from "../../hooks/usePanelWidth";
import PanelResizeHandle from "./PanelResizeHandle";

export default function DetailsPanel({
  open,
  onClose,
  progress,
  size,
  obscured = false,
}: {
  open: boolean;
  obscured?: boolean;
  onClose: () => void;
  progress: MotionValue<number>;
  size: ReturnType<typeof usePanelWidth>;
}) {
  const { appInfo, permissions, updateState } = useDesktop();
  const tasks = useTasks();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot | null>(null);

  useEffect(() => {
    if (!open || diagnostics) return;
    let active = true;
    void window.desktop.diagnostics
      .get()
      .then((snapshot) => active && setDiagnostics(snapshot))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [diagnostics, open]);

  const activeTasks = tasks.filter(isActiveTask);
  const completedTasks = tasks.filter(isCompletedTask);

  return (
    <>
      <motion.button
        type="button"
        className="details-backdrop"
        aria-label="Close details panel"
        aria-hidden={!open || obscured}
        tabIndex={-1}
        data-open={open}
        style={{ opacity: progress }}
        onClick={onClose}
      />
      <motion.aside
        id="app-details"
        style={
          { "--details-progress": progress, "--details-width": `${size.width}px` } as React.ComponentProps<
            typeof motion.aside
          >["style"]
        }
        className="details-panel"
        data-open={open}
        aria-hidden={!open || obscured}
        inert={!open || obscured ? true : undefined}
        aria-label="Details"
      >
        <PanelResizeHandle
          label="Resize details"
          controls="app-details"
          edge="left"
          {...size}
          id="details-resize-handle"
          variable={{ name: "--details-width", on: "#app-details" }}
          onCommit={size.commit}
          onReset={size.reset}
        />
        <div className="details-panel-inner">
          <div className="details-panel-header">
            <div>
              <h2 className="text-sm font-semibold">Details</h2>
            </div>
          </div>

          <div className="details-panel-scroll">
            <PanelSection title="Activity">
              <DetailRow label="Running" value={String(activeTasks.length)} />
              <DetailRow label="Completed" value={String(completedTasks.length)} />
              <DetailRow label="Total retained" value={String(tasks.length)} />
            </PanelSection>

            <PanelSection title="Permissions">
              {permissions.map((permission) => (
                <DetailRow
                  key={permission.capability}
                  label={capitalize(permission.capability)}
                  value={permission.decision}
                />
              ))}
            </PanelSection>

            <PanelSection title="Application">
              <DetailRow label="Version" value={appInfo?.version ?? "—"} />
              <DetailRow label="Updates" value={updateLabel(updateState.status)} />
              <DetailRow label="Webview" value={diagnostics?.webviewHealth ?? "Checking…"} />
              <DetailRow label="Protocol" value={diagnostics?.protocolRegistered ? "Registered" : "Not registered"} />
            </PanelSection>

            <PanelSection title="Deep links">
              {["home", "settings", "tasks/<uuid>"].map((path) => (
                <code key={path} className="details-code">
                  {appInfo?.protocol ?? "electron-app"}://open/{path}
                </code>
              ))}
            </PanelSection>
          </div>
        </div>
      </motion.aside>
    </>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="details-section">
      <h3>{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <span className="text-muted-foreground capitalize">{value}</span>
    </div>
  );
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function updateLabel(status: string): string {
  if (status === "idle") return "Idle";
  if (status === "ready") return "Ready";
  return capitalize(status);
}
