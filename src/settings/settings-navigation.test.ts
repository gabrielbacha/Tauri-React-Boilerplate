import { describe, expect, it } from "vitest";

import { searchSettings, validateSettingsSearch } from "./settings-navigation";

describe("settings navigation", () => {
  it("retains valid categories and only valid setting targets within their category", () => {
    expect(validateSettingsSearch({ section: "advanced", setting: "open-logs" })).toEqual({
      section: "advanced",
      setting: "open-logs",
    });
    expect(validateSettingsSearch({ section: "appearance", setting: "open-logs" })).toEqual({ section: "appearance" });
    expect(validateSettingsSearch({ section: "invalid", setting: "__proto__" })).toEqual({ section: "appearance" });
    expect(validateSettingsSearch({})).toEqual({ section: "appearance" });
  });
  it("searches labels, descriptions and keywords across categories", () => {
    expect(searchSettings("ZOOM").map((item) => item.id)).toEqual(["interface-size"]);
    expect(searchSettings("privacy").map((item) => item.category)).toEqual([
      "permissions",
      "permissions",
      "permissions",
    ]);
    expect(searchSettings("copy clipboard").map((item) => item.id)).toEqual(["copy-report"]);
    expect(searchSettings("restore windows").map((item) => item.id)).toEqual(["restore-windows"]);
    expect(searchSettings("no match at all")).toEqual([]);
  });
});
