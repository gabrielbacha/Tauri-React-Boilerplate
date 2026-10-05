import assert from "node:assert/strict";
import fs from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, mock, test } from "node:test";

import { featureNames, scaffoldFeature } from "./scaffold-feature.mjs";

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "scaffold-test-"));
  mkdirSync(join(root, "src-tauri/src/features"), { recursive: true });
  writeFileSync(join(root, "src-tauri/src/features/mod.rs"), "//! Features.\n");
});
afterEach(() => {
  mock.restoreAll();
  rmSync(root, { recursive: true, force: true });
});

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
  for (const name of [
    "Team",
    "team_notes",
    "-x",
    "x".repeat(49),
    "",
    "type",
    "struct",
    "const",
    "enum",
    "pub",
    "abstract",
    "gen",
    "yield",
  ])
    assert.throws(() => featureNames(name));
  assert.deepEqual(featureNames("team-notes"), { snake: "team_notes", pascal: "TeamNotes", camel: "teamNotes" });
  assert.equal(existsSync(join(root, "src/features")), false);
});

test("preserves a Rust file that exists without a module registration", () => {
  const file = join(root, "src-tauri/src/features/team_notes.rs");
  writeFileSync(file, "existing code");
  assert.throws(() => scaffoldFeature(root, "team-notes"), { code: "EEXIST" });
  assert.equal(readFileSync(file, "utf8"), "existing code");
  assert.equal(readFileSync(join(root, "src-tauri/src/features/mod.rs"), "utf8"), "//! Features.\n");
  assert.equal(existsSync(join(root, "src/features/team-notes")), false);
});

test("preserves an existing guide directory", () => {
  const directory = join(root, "src/features/team-notes");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "README.md"), "existing guide");
  assert.throws(() => scaffoldFeature(root, "team-notes"), { code: "EEXIST" });
  assert.equal(readFileSync(join(directory, "README.md"), "utf8"), "existing guide");
  assert.equal(existsSync(join(root, "src-tauri/src/features/team_notes.rs")), false);
});

test("cleans up a partially written new Rust file", () => {
  const write = fs.writeFileSync;
  mock.method(fs, "writeFileSync", (file, content, options) => {
    if (typeof file === "number") {
      write(file, "partial");
      throw new Error("Disk full");
    }
    return write(file, content, options);
  });
  assert.throws(() => scaffoldFeature(root, "team-notes"), /Disk full/);
  assert.equal(existsSync(join(root, "src-tauri/src/features/team_notes.rs")), false);
  assert.equal(existsSync(join(root, "src/features/team-notes")), false);
});

test("restores a partially written module registration", () => {
  const file = join(root, "src-tauri/src/features/mod.rs");
  const write = fs.writeFileSync;
  let failed = false;
  mock.method(fs, "writeFileSync", (target, content, options) => {
    if (target === file && !failed) {
      failed = true;
      write(target, "partial");
      throw new Error("Disk full");
    }
    return write(target, content, options);
  });
  assert.throws(() => scaffoldFeature(root, "team-notes"), /Disk full/);
  assert.equal(readFileSync(file, "utf8"), "//! Features.\n");
  assert.equal(existsSync(join(root, "src-tauri/src/features/team_notes.rs")), false);
  assert.equal(existsSync(join(root, "src/features/team-notes")), false);
});

test("continues rollback and reports cleanup failures", () => {
  const file = join(root, "src-tauri/src/features/mod.rs");
  const write = fs.writeFileSync;
  const remove = fs.rmSync;
  let failed = false;
  mock.method(fs, "writeFileSync", (target, content, options) => {
    if (target === file && !failed) {
      failed = true;
      write(target, "partial");
      throw new Error("Disk full");
    }
    return write(target, content, options);
  });
  mock.method(fs, "rmSync", (target, options) => {
    if (target === join(root, "src/features/team-notes")) throw new Error("Cleanup denied");
    return remove(target, options);
  });
  assert.throws(
    () => scaffoldFeature(root, "team-notes"),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(
        error.errors.map((failure) => failure.message),
        ["Disk full", "Cleanup denied"],
      );
      return true;
    },
  );
  assert.equal(readFileSync(file, "utf8"), "//! Features.\n");
  assert.equal(existsSync(join(root, "src-tauri/src/features/team_notes.rs")), false);
});
