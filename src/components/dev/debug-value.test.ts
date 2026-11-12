// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

import { boundedDebugValue, debugText } from "./debug-value";
it("redacts nested secret fields, bearer tokens and URL credentials/query", () => {
  const value = boundedDebugValue({
    api_key: "sensitive",
    nested: {
      Authorization: "sensitive",
      href: "https://user:password@example.test/path?token=sensitive#sensitive",
    },
    message: "Bearer sensitive token=sensitive",
  });
  const text = JSON.stringify(value);
  expect(text).not.toContain("sensitive");
  expect(text).not.toContain("password@");
  expect(text).toContain("https://example.test/path");
});
it("does not invoke getters or custom JSON functions and handles cycles", () => {
  const getter = vi.fn<() => never>(() => {
    throw new Error("must not execute");
  });
  const value = {
    get data() {
      return getter();
    },
    toJSON: getter,
    self: null as unknown,
  };
  value.self = value;
  expect(debugText(value)).toContain("Accessor");
  expect(debugText(value)).toContain("Circular");
  expect(getter).not.toHaveBeenCalled();
});
it("limits large nested values and encoded snapshot bytes", () => {
  const value = Array.from({ length: 100000 }, () => ({
    message: "🙂".repeat(10000),
    nested: ["x".repeat(10000)],
  }));
  const encoded = new TextEncoder().encode(JSON.stringify(boundedDebugValue(value)));
  expect(encoded.byteLength).toBeLessThanOrEqual(8192);
  const snapshot = new TextEncoder().encode(JSON.stringify(boundedDebugValue({ events: value }, 65536)));
  expect(snapshot.byteLength).toBeLessThanOrEqual(65536);
});
