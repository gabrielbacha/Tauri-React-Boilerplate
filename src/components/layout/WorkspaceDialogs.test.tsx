// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { DesktopApi } from "@/shared/desktop-api";

import { useFeedbackAction } from "../../hooks/useFeedbackAction";
import { TooltipProvider } from "../ui/tooltip";
import WorkspaceDialogs from "./WorkspaceDialogs";

afterEach(cleanup);

function Harness() {
  const [reloadOpen, setReloadOpen] = useState(true);
  const { run, pending } = useFeedbackAction();
  return (
    <WorkspaceDialogs
      shareOpen={false}
      setShareOpen={() => {}}
      aboutOpen={false}
      setAboutOpen={() => {}}
      paletteOpen={false}
      setPaletteOpen={() => {}}
      reloadOpen={reloadOpen}
      setReloadOpen={setReloadOpen}
      paletteCommands={[]}
      pendingAction={pending}
      runAction={run}
    />
  );
}

it("keeps reload open after failure or a duplicate and closes after successful retry", async () => {
  const reload = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error("Reload failed"));
  window.desktop = { diagnostics: { reload } } as unknown as DesktopApi;
  render(
    <TooltipProvider>
      <Harness />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy());
  expect(screen.getByRole("dialog")).toBeTruthy();
  let finish!: () => void;
  reload.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Reloading…" }));
  });
  expect(reload).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () => {
    finish();
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
