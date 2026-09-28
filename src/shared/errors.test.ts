import { expect, it } from "vitest";

import { errorMessage } from "./errors";

it("shows messages from Rust command errors", () => {
  expect(errorMessage({ kind: "not-found", message: "Background task not found." })).toBe("Background task not found.");
  expect(errorMessage(new Error("Local failure"))).toBe("Local failure");
});

it("hides technical runtime errors behind the fallback", () => {
  expect(errorMessage("Command tasks_list not allowed by ACL", "Unable to load tasks.")).toBe("Unable to load tasks.");
  expect(errorMessage(42, "Unable to save.")).toBe("Unable to save.");
  expect(errorMessage("Plain failure")).toBe("Plain failure");
});
