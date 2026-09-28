// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SelectMenu } from "./select-menu";

afterEach(cleanup);

it("searches long option lists and selects the first match with Enter", () => {
  const choose = vi.fn<(...args: unknown[]) => void>();
  render(
    <SelectMenu
      label="Example"
      value="item-1"
      options={Array.from({ length: 10 }, (_, index) => ({ value: `item-${index}`, label: `Item ${index}` }))}
      onValueChange={choose}
    />,
  );
  fireEvent.pointerDown(screen.getByRole("button", { name: "Example" }), { button: 0, ctrlKey: false });
  const search = screen.getByRole("textbox", { name: "Search example" });
  fireEvent.change(search, { target: { value: "Item 9" } });
  expect(screen.getByRole("menuitemradio", { name: "Item 9" })).toBeTruthy();
  fireEvent.keyDown(search, { key: "Enter" });
  expect(choose).toHaveBeenCalledWith("item-9");
});
