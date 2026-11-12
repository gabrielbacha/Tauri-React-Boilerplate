// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SelectMenu } from "./select-menu";

afterEach(cleanup);

it.each(["Saved documents", "Interface size"])(
  "keeps %s selection unchanged during composition, then commits ordinary Enter",
  (label) => {
    const choose = vi.fn<(...args: unknown[]) => void>();
    render(
      <SelectMenu
        label={label}
        value="item-1"
        options={Array.from({ length: 10 }, (_, index) => ({ value: `item-${index}`, label: `Item ${index}` }))}
        onValueChange={choose}
      />,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: label }), { button: 0, ctrlKey: false });
    const search = screen.getByRole("textbox", { name: `Search ${label.toLowerCase()}` });
    fireEvent.change(search, { target: { value: "Item 9" } });
    expect(screen.getByRole("menuitemradio", { name: "Item 9" })).toBeTruthy();
    fireEvent.keyDown(search, { key: "Enter", isComposing: true });
    fireEvent.keyDown(search, { key: "ArrowDown", isComposing: true });
    expect(choose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: `Search ${label.toLowerCase()}` })).toBeTruthy();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(choose).toHaveBeenCalledWith("item-9");
  },
);
