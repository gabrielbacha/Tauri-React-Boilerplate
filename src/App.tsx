import { RouterProvider } from "@tanstack/react-router";
import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";

import type { InterruptionRequest } from "@/shared/desktop-api";
import { SHOWCASE_ENABLED } from "@/shared/features";

import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { ExternalLinkGuard } from "./components/common/ExternalLinkGuard";
import InterfacePreferencesEffect from "./components/layout/InterfacePreferencesEffect";
import QuitDialog from "./components/layout/QuitDialog";
import UpdateDialog from "./components/layout/UpdateDialog";
import { TooltipProvider } from "./components/ui/tooltip";
import { DesktopProvider } from "./context/DesktopContext";
import { DirtyStateProvider } from "./context/DirtyStateContext";
import { ScratchpadProvider } from "./context/ScratchpadContext";
import { router } from "./routes/router";

// Development builds only: inspect commands, events, windows, and console output (Cmd/Ctrl+D).
const DebugPanel = import.meta.env.DEV
  ? lazy(() => import("./components/dev/DebugPanel").then((module) => ({ default: module.DebugPanel })))
  : null;

function App() {
  const [interruption, setInterruption] = useState<InterruptionRequest | null>(null);

  useEffect(() => window.desktop.lifecycle.onInterruptionRequested(setInterruption), []);

  const resolveInterruption = (proceed: boolean): void => {
    if (!interruption) return;
    void window.desktop.lifecycle
      .resolveInterruption(interruption.id, proceed)
      .then(() => setInterruption(null))
      .catch(() => toast.error("Unable to complete that action. Please try again."));
  };

  return (
    <TooltipProvider delayDuration={300}>
      <DirtyStateProvider>
        <DesktopProvider>
          <InterfacePreferencesEffect />
          {SHOWCASE_ENABLED ? (
            <ScratchpadProvider>
              <RouterProvider router={router} />
            </ScratchpadProvider>
          ) : (
            <RouterProvider router={router} />
          )}
          <QuitDialog request={interruption} onResolve={resolveInterruption} />
          <UpdateDialog />
          <ExternalLinkGuard />
          {DebugPanel ? (
            <Suspense fallback={null}>
              <DebugPanel />
            </Suspense>
          ) : null}
        </DesktopProvider>
      </DirtyStateProvider>
    </TooltipProvider>
  );
}

const rootElement = document.getElementById("app");
if (!rootElement) throw new Error("Missing application root element.");

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
