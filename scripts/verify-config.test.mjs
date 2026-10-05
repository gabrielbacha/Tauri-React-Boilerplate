import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { ROOT } from "./project.mjs";
import { applySetup, planSetup } from "./setup.mjs";
import { verifyConfiguration } from "./verify-config.mjs";

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "verify-config-test-"));
  for (const entry of [
    "package.json",
    "index.html",
    "scripts/template-assets.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/capabilities",
    "src-tauri/icons",
  ])
    cpSync(join(ROOT, entry), join(root, entry), { recursive: true });
  applySetup(
    planSetup(root, {
      productName: "Notes",
      package: "notes",
      appId: "com.example.notes",
      variant: "clean",
      repository: "example/notes",
    }),
  );
  // Distinct fixture assets prove the icon gate without needing to generate installer icons.
  const assets = JSON.parse(readFileSync(join(root, "scripts/template-assets.json"), "utf8"));
  for (const file of Object.keys(assets)) writeFileSync(join(root, file), "custom test icon");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const verify = (options = {}) => verifyConfiguration(root, { strict: true, platform: "linux", env: {}, ...options });

test("a renamed installer-only release needs no updater keys", () => {
  assert.deepEqual(verify().errors, []);
});

test("update feeds require both public and private keys", () => {
  assert.match(verify({ updates: true }).errors.join("\n"), /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(
    verify({ updates: true, env: { TAURI_SIGNING_PRIVATE_KEY: "private" } }).errors.join("\n"),
    /updater public key/,
  );
  const file = join(root, "src-tauri/tauri.conf.json");
  const config = JSON.parse(readFileSync(file, "utf8"));
  config.plugins.updater.pubkey = "public";
  writeFileSync(file, JSON.stringify(config));
  assert.deepEqual(verify({ updates: true, env: { TAURI_SIGNING_PRIVATE_KEY: "private" } }).errors, []);
  assert.match(verify({ updates: true }).errors.join("\n"), /TAURI_SIGNING_PRIVATE_KEY/);
});

test("strict installer releases still reject template icons and identity", () => {
  cpSync(join(ROOT, "src-tauri/icons"), join(root, "src-tauri/icons"), { recursive: true });
  assert.match(verify().errors.join("\n"), /Template icon unchanged/);
  const file = join(root, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.publish = { provider: "github", owner: "gabrielbacha", repo: "Tauri-React-Boilerplate" };
  writeFileSync(file, JSON.stringify(pkg));
  assert.ok(verify().errors.length > 0);
});
