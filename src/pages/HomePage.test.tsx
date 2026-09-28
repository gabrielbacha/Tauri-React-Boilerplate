import { cleanup, render as renderUi, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { BackgroundTask } from "@/shared/desktop-api";

import { TaskRow } from "../components/dashboard/TaskRow";
// @vitest-environment jsdom
import { TooltipProvider } from "../components/ui/tooltip";

afterEach(cleanup);

const baseTask: BackgroundTask = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  kind: "file-hash",
  title: "Hash example.txt",
  status: "running",
  progress: 0.5,
  message: "Calculating SHA-256…",
  canCancel: true,
  canRetry: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("task state rendering", () => {
  it("shows running progress and an accessible action menu", () => {
    render(<TaskRow task={baseTask} />);
    expect(screen.getByText("running")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "File hash progress" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Actions for example.txt" })).toBeTruthy();
  });

  it("shows a completed digest and dismissal", () => {
    render(
      <TaskRow
        task={{
          ...baseTask,
          status: "completed",
          progress: 1,
          canCancel: false,
          result: { fileName: "example.txt", size: 4, sha256: "abc123" },
        }}
      />,
    );
    expect(screen.getByText("abc123")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Actions for example.txt" })).toBeTruthy();
  });
});

function render(ui: ReactElement) {
  return renderUi(ui, { wrapper: TooltipProvider });
}
