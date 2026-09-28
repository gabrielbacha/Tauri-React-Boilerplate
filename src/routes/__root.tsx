import { Outlet, createRootRoute, useBlocker, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";

import { APP_ROUTES, restoreRoute } from "@/shared/routes";

import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { useDirtyRegistry, useDirtySources } from "../context/DirtyStateContext";
import { useOptionalScratchpadActions } from "../context/ScratchpadContext";
import BaseLayout from "../layouts/BaseLayout";
import { shouldBlockNavigation } from "./navigation-policy";

export const RootRoute = createRootRoute({
  component: Root,
});

function Root() {
  const router = useRouter();
  const scratchpad = useOptionalScratchpadActions();
  const { currentSources } = useDirtyRegistry();
  const sources = useDirtySources();
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => shouldBlockNavigation(currentSources(), current.pathname, next.pathname),
    enableBeforeUnload: sources.length > 0,
    withResolver: true,
  });

  useEffect(() => {
    const unsubscribe = window.desktop.deepLinks.onIntent((intent) => {
      const destination = intent.route === "settings" ? APP_ROUTES.settings.path : APP_ROUTES.home.path;
      void router.navigate({ to: destination }).then(() => {
        if (intent.route !== "task" || router.state.location.pathname !== destination) return;
        requestAnimationFrame(() => {
          const element = document.getElementById(`task-${intent.taskId}`);
          if (!element) {
            toast.info("That task is no longer retained.");
            return;
          }
          element.tabIndex = -1;
          element.focus({ preventScroll: true });
          element.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          });
        });
      });
    });
    let active = true;
    let removeNavigation: (() => void) | undefined;
    void window.desktop.window
      .getSession()
      .then(async (saved) => {
        if (!active) return;
        if (saved.route !== router.state.location.pathname) await router.navigate({ to: saved.route });
        if (!active) return;
        removeNavigation = router.subscribe("onResolved", () => {
          void window.desktop.window
            .setSession({
              route: restoreRoute(router.state.location.pathname),
            })
            .catch(() => toast.error("Unable to save window navigation."));
        });
        await window.desktop.deepLinks.ready();
      })
      .catch(() => toast.error("Unable to restore window session."));
    return () => {
      active = false;
      unsubscribe();
      removeNavigation?.();
    };
  }, [router]);

  return (
    <>
      <BaseLayout>
        <Outlet />
      </BaseLayout>
      <ConfirmDialog
        open={blocker.status === "blocked"}
        title="Leave with unsaved changes?"
        description={`Save or clear ${sources.join(", ")} first, or continue and discard those changes.`}
        cancelLabel="Stay here"
        confirmLabel="Discard and continue"
        destructive
        onCancel={() => {
          if (blocker.status === "blocked") blocker.reset();
        }}
        onConfirm={() => {
          if (blocker.status === "blocked") {
            scratchpad?.discardDraft();
            blocker.proceed();
          }
        }}
      />
    </>
  );
}
