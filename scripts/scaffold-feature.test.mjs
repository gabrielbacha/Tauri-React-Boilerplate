import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { featureNames, scaffoldFeature } from "./scaffold-feature.mjs";

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "scaffold-test-"));
  mkdirSync(join(root, "src-tauri/src/features"), { recursive: true });
  writeFileSync(join(root, "src-tauri/src/features/mod.rs"), "//! Features.\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("creates a registered Rust module and a wiring guide", () => {
  const { rustFile, guide } = scaffoldFeature(root, "team-notes");
  assert.match(readFileSync(rustFile, "utf8"), /pub fn team_notes_describe/);
  assert.match(readFileSync(guide, "utf8"), /allow-team-notes-describe/);
  assert.match(readFileSync(join(root, "src-tauri/src/features/mod.rs"), "utf8"), /^pub mod team_notes;$/m);
});

test("never replaces an existing feature", () => {
  scaffoldFeature(root, "team-notes");
  assert.throws(() => scaffoldFeature(root, "team-notes"), /already exists/);
});

test("rejects names that are not kebab-case or are Rust keywords", () => {
  for (const name of ["Team", "team_notes", "-x", "x".repeat(49), "", "type"]) assert.throws(() => featureNames(name));
  assert.deepEqual(featureNames("team-notes"), { snake: "team_notes", pascal: "TeamNotes", camel: "teamNotes" });
  assert.equal(existsSync(join(root, "src/features")), false);
});
