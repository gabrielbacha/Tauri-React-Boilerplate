// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { DesktopApi } from "@/shared/desktop-api";

import { DirtyStateProvider, useDirtyRegistry, useDirtySources, useDirtyState } from "./DirtyStateContext";

afterEach(cleanup);

it("keeps the registry current while publishing dirty sources to the main process", async () => {
  const setDirtyState = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  window.desktop = { lifecycle: { setDirtyState } } as unknown as DesktopApi;
  function Owner({ dirty }: { dirty: boolean }) {
    useDirtyState("Draft", dirty);
    return null;
  }
  function Observer() {
    const { currentSources } = useDirtyRegistry();
    const sources = useDirtySources();
    return <span>{`${currentSources().join(",")}|${sources.join(",")}`}</span>;
  }
  const view = render(
    <DirtyStateProvider>
      <Owner dirty />
      <Observer />
    </DirtyStateProvider>,
  );
  await waitFor(() => expect(screen.getByText("Draft|Draft")).toBeTruthy());
  expect(setDirtyState).toHaveBeenCalledWith({ sources: ["Draft"] });
  act(() => {
    view.rerender(
      <DirtyStateProvider>
        <Owner dirty={false} />
        <Observer />
      </DirtyStateProvider>,
    );
  });
  await waitFor(() => expect(screen.getByText("|")).toBeTruthy());
  expect(setDirtyState).toHaveBeenCalledWith({ sources: [] });
});
