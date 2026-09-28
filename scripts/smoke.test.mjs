import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { binaryPath, checkOutput } from "./smoke.mjs";

const healthy = "[INFO] SQLite storage ready\n[INFO] Window bridge ready\n";

test("accepts a start that opened storage and connected the interface", () => {
  assert.equal(checkOutput(healthy), null);
});

test("reports missing startup steps and logged failures", () => {
  assert.match(checkOutput("[INFO] Window bridge ready"), /SQLite/);
  assert.match(checkOutput("[INFO] SQLite storage ready"), /bridge/);
  assert.match(checkOutput(`${healthy}Uncaught interface error: boom`), /failure/);
  assert.match(checkOutput(`${healthy}Command tasks_list not allowed by ACL`), /failure/);
});

test("finds the debug binary from the Cargo package name", async () => {
  const root = await mkdtemp(join(tmpdir(), "smoke-test-"));
  await mkdir(join(root, "src-tauri"));
  await writeFile(join(root, "src-tauri/Cargo.toml"), '[package]\nname = "my-app"\nversion = "1.0.0"\n');
  const binary = await binaryPath(root, {});
  assert.match(binary, /src-tauri[/\\]target[/\\]debug[/\\]my-app(\.exe)?$/);
});
