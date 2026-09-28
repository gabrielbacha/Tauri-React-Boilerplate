import { cleanup, fireEvent, render as renderUi, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

// @vitest-environment jsdom
import { TooltipProvider } from "../ui/tooltip";
import CommandPalette, { filterCommands } from "./CommandPalette";

afterEach(cleanup);
it("filters by all words across labels and keywords", () => {
  const commands = [
    { id: "logs", label: "Open logs", keywords: "debug", run: () => {} },
    { id: "theme", label: "Appearance: dark", keywords: "theme color", run: () => {} },
  ];
  expect(filterCommands(commands, " DEBUG open ").map((c) => c.id)).toEqual(["logs"]);
  expect(filterCommands(commands, "theme dark").map((c) => c.id)).toEqual(["theme"]);
  expect(filterCommands(commands, "missing")).toEqual([]);
});
it("executes the selected result once after closing and supports empty results", async () => {
  const run = vi.fn<() => void>();
  function Test() {
    const [open, setOpen] = useState(true);
    return (
      <CommandPalette open={open} onOpenChange={setOpen} commands={[{ id: "settings", label: "Settings", run }]} />
    );
  }
  render(<Test />);
  const input = screen.getByRole("combobox", { name: "Search commands" });
  fireEvent.change(input, { target: { value: "xyz" } });
  expect(screen.getByRole("status").textContent).toBe("No matching commands");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(run).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "settings" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(run).toHaveBeenCalledOnce());
  expect(screen.queryByRole("dialog")).toBeNull();
});

function render(ui: ReactElement) {
  return renderUi(ui, { wrapper: TooltipProvider });
}
