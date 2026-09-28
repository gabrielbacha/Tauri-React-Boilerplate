import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { consistencyErrors, loadProject } from "./configuration.mjs";
import { ROOT, cargoPackageName } from "./project.mjs";
import { applySetup, parseArguments, planSetup } from "./setup.mjs";

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "setup-test-"));
  for (const entry of [
    "package.json",
    "index.html",
    "scripts",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/capabilities",
  ])
    cpSync(join(ROOT, entry), join(root, entry), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const answers = (overrides = {}) => ({
  productName: "Renamed <Notes>",
  appId: "com.example.renamed-notes",
  variant: "clean",
  repository: "example/renamed-notes",
  ...overrides,
});

test("renames every identity file consistently", () => {
  applySetup(planSetup(root, answers({ package: "renamed-notes", pubkey: "PUBLIC" })));
  const project = loadProject(root);
  assert.deepEqual(consistencyErrors(project), []);
  assert.equal(project.pkg.name, "renamed-notes");
  assert.equal(project.tauri.identifier, "com.example.renamed-notes");
  assert.deepEqual(project.tauri.plugins["deep-link"].desktop.schemes, ["renamed-notes"]);
  assert.equal(project.tauri.plugins.updater.pubkey, "PUBLIC");
  assert.match(project.tauri.plugins.updater.endpoints[0], /example\/renamed-notes/);
  assert.equal(cargoPackageName(project.cargo), "renamed-notes");
  assert.ok(!project.capability.permissions.includes("showcase-commands"));
  assert.match(project.html, /<title>Renamed &lt;Notes&gt;<\/title>/);
});

test("the showcase variant keeps the example commands", () => {
  applySetup(planSetup(root, answers({ variant: "showcase" })));
  assert.ok(loadProject(root).capability.permissions.includes("showcase-commands"));
});

test("rejects invalid values before writing anything", () => {
  const before = readFileSync(join(root, "package.json"), "utf8");
  assert.throws(() => planSetup(root, answers({ appId: "notes" })), /reverse-DNS/);
  assert.throws(() => planSetup(root, answers({ protocol: "https" })), /non-reserved/);
  assert.throws(() => planSetup(root, answers({ repository: "not a repo" })), /owner\/name/);
  assert.throws(() => planSetup(root, answers({ variant: "full" })), /clean or showcase/);
  assert.equal(readFileSync(join(root, "package.json"), "utf8"), before);
});

test("parses flags strictly", () => {
  assert.deepEqual(parseArguments(["--name", "Notes", "--skip-install"]), { name: "Notes", "skip-install": true });
  assert.throws(() => parseArguments(["--unknown", "x"]), /Unknown/);
  assert.throws(() => parseArguments(["--name", "a", "--name", "b"]), /Duplicate/);
  assert.throws(() => parseArguments(["--name"]), /requires a value/);
});

test("setup runs before pnpm install: it imports only Node.js built-ins", () => {
  for (const file of ["setup.mjs", "project.mjs"]) {
    const source = readFileSync(join(ROOT, "scripts", file), "utf8");
    const packages = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
    const external = packages.filter((name) => !name.startsWith("node:") && !name.startsWith("./"));
    assert.deepEqual(external, [], file);
  }
});
