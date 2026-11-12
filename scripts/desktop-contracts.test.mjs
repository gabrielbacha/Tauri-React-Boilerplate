import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
test("copied desktop contracts match their canonical revision and hashes", () => {
  const result = spawnSync(process.execPath, ["scripts/check-desktop-contracts.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
