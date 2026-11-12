import { expect, it } from "vitest";

import vectors from "../text-vectors.json";
import { DEFAULT_TEXT_POLICY, textWithinLimits } from "./text-policy";
it.each(vectors)("applies shared Unicode vector $name to each host policy", (vector) => {
  const text = vector.text.repeat(vector.repeat);
  const policy = { ...DEFAULT_TEXT_POLICY, maxTextBytes: vector.maxBytes ?? DEFAULT_TEXT_POLICY.maxTextBytes };
  expect(textWithinLimits(text, { ...policy, units: "scalar" }, vector.title)).toBe(vector.scalar);
  expect(textWithinLimits(text, policy, vector.title)).toBe(vector.utf16);
});
it("rejects lone surrogates that cannot be Rust Unicode strings", () => {
  expect(textWithinLimits("\ud800", { ...DEFAULT_TEXT_POLICY, units: "scalar" })).toBe(false);
});
