import { expect, it } from "vitest";

import { parseInterfacePreferences } from "./interface-preferences";

it("loads known settings and rejects invalid, missing, or out-of-range values", () => {
  expect(parseInterfacePreferences('{"zoom":1.25,"motion":"reduced"}')).toEqual({ zoom: 1.25, motion: "reduced" });
  expect(parseInterfacePreferences('{"zoom":1.5,"motion":"full"}')).toEqual({ zoom: 1.5, motion: "full" });
  for (const raw of [null, "oops", "[]", '{"zoom":10,"motion":"invalid"}', '{"zoom":"1.25"}']) {
    expect(parseInterfacePreferences(raw)).toEqual({ zoom: 1, motion: "system" });
  }
});
