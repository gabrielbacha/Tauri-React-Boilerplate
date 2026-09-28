import { describe, expect, it } from "vitest";

import { shouldBlockNavigation } from "./navigation-policy";

describe("dirty navigation policy", () => {
  it("blocks a route change only when a named source is dirty", () => {
    expect(shouldBlockNavigation(["Draft"], "/", "/settings")).toBe(true);
    expect(shouldBlockNavigation([], "/", "/settings")).toBe(false);
    expect(shouldBlockNavigation(["Draft"], "/", "/")).toBe(false);
  });
});
