import { cleanup, render as renderUi, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// @vitest-environment jsdom
import { TooltipProvider } from "../ui/tooltip";
import QuitDialog from "./QuitDialog";

afterEach(cleanup);

describe("interruption dialog", () => {
  it("explains both unsaved work and active tasks", () => {
    render(
      <QuitDialog
        request={{
          id: "550e8400-e29b-41d4-a716-446655440000",
          kind: "quit",
          dirtySources: ["Draft"],
          activeTaskCount: 2,
        }}
        onResolve={vi.fn<(proceed: boolean) => void>()}
      />,
    );
    expect(screen.getByText(/1 unsaved item and 2 active tasks/)).toBeTruthy();
    expect(screen.getByText("Quit anyway")).toBeTruthy();
  });
});

function render(ui: ReactElement) {
  return renderUi(ui, { wrapper: TooltipProvider });
}
