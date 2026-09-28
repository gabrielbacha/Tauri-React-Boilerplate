import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { toast } from "sonner";

import type { DiagnosticsSnapshot } from "@/shared/desktop-api";

import { useFeedbackAction } from "../../hooks/useFeedbackAction";
import { LoadingState, RecoverableError } from "../common/ResourceState";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

type Confirmation = "reload" | "reset";

export default function AdvancedSettings(): ReactElement {
  const { run, pending, busy } = useFeedbackAction();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationTrigger = useRef<HTMLButtonElement | null>(null);

  const loadDiagnostics = useCallback(async (): Promise<void> => {
    try {
      const nextDiagnostics = await window.desktop.diagnostics.get();
      setDiagnostics(nextDiagnostics);
      setDiagnosticsError(false);
    } catch {
      setDiagnosticsError(true);
    }
  }, []);
  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);
  return (
    <>
      <section className="settings-advanced-page">
        <div className="settings-advanced-content">
          {diagnosticsError ? (
            <RecoverableError message="Diagnostics are unavailable." onRetry={() => void loadDiagnostics()} />
          ) : !diagnostics ? (
            <LoadingState label="Collecting diagnostics…" />
          ) : (
            <dl id="setting-diagnostics" tabIndex={-1} className="diagnostics-list">
              <Diagnostic label="Application" value={`${diagnostics.app.name} ${diagnostics.app.version}`} />
              <Diagnostic label="System" value={`${diagnostics.app.platform} · ${diagnostics.app.arch}`} />
              <Diagnostic
                label="Runtime"
                value={`Tauri ${diagnostics.versions.tauri} · Webview ${diagnostics.versions.webview}`}
              />
              <Diagnostic label="Webview" value={diagnostics.webviewHealth} />
              <Diagnostic
                label="Protocol"
                value={`${diagnostics.app.protocol} · ${diagnostics.protocolRegistered ? "registered" : "not registered"}`}
              />
              <Diagnostic label="Updater" value={diagnostics.updateStatus} />
            </dl>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              id="setting-copy-report"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void run("copy", () => window.desktop.diagnostics.copyReport(), "Report copied")}
            >
              {pending === "copy" ? "Copying…" : "Copy report"}
            </Button>
            <Button
              id="setting-open-logs"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void run("logs", () => window.desktop.diagnostics.openLogs())}
            >
              Open logs
            </Button>
            <Button
              id="setting-reload-renderer"
              ref={confirmation === "reload" ? confirmationTrigger : undefined}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={(event) => {
                confirmationTrigger.current = event.currentTarget;
                setConfirmation("reload");
              }}
            >
              Reload renderer
            </Button>
            <Button
              id="setting-reset-preferences"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={(event) => {
                confirmationTrigger.current = event.currentTarget;
                setConfirmation("reset");
              }}
            >
              Reset preferences
            </Button>
          </div>
        </div>
      </section>
      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            confirmationTrigger.current?.focus();
          }}
          onEscapeKeyDown={(event) => busy && event.preventDefault()}
          onInteractOutside={(event) => busy && event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{confirmation === "reload" ? "Reload this workspace?" : "Reset preferences?"}</DialogTitle>
            <DialogDescription>
              {confirmation === "reload"
                ? "The renderer will restart. Saved documents and background tasks remain available."
                : "Appearance, sidebar, shortcut, and update settings will return to their defaults."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void run("confirm", async () => {
                  if (confirmation === "reload") await window.desktop.diagnostics.reload();
                  else {
                    await window.desktop.diagnostics.resetPreferences();
                    toast.success("Preferences reset");
                  }
                  setConfirmation(null);
                })
              }
            >
              {busy ? "Working…" : confirmation === "reload" ? "Reload workspace" : "Reset preferences"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
