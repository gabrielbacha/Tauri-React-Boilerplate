// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SettingRow } from "../components/settings/SettingsPrimitives";
import { focusSetting } from "./settings-navigation";

afterEach(cleanup);

it("focuses the indexed settings row even when its label differs from its id", () => {
  Element.prototype.scrollIntoView = vi.fn<(...args: unknown[]) => void>();
  render(
    <SettingRow settingId="automatic-checks" title="Check automatically" description="On startup">
      <button type="button">Change</button>
    </SettingRow>,
  );
  focusSetting("automatic-checks");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Change" }));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});
