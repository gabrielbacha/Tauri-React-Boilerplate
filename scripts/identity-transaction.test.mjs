import assert from "node:assert/strict";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { publishIdentity } from "./identity-transaction.mjs";
test("every Tauri identity/origin publication failure restores completed files", () => {
  for (let failure = 0; failure < 6; failure++) {
    const root = fs.mkdtempSync(join(tmpdir(), "tauri-identity-fault-"));
    try {
      const entries = Array.from({ length: 6 }, (_, index) => [join(root, `${index}.json`), "new"]);
      entries.slice(0, 5).forEach(([path]) => fs.writeFileSync(path, "old"));
      let count = 0;
      assert.throws(
        () =>
          publishIdentity(root, entries, {
            ...fs,
            renameSync: (...args) => {
              if (count++ === failure) throw new Error("first publication failure");
              return fs.renameSync(...args);
            },
          }),
        /restored/,
      );
      entries.slice(0, 5).forEach(([path]) => assert.equal(fs.readFileSync(path, "utf8"), "old"));
      assert.equal(fs.existsSync(entries[5][0]), false);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  }
});
test("multiple rollback failures do not stop later restores or discard backup bytes", () => {
  const root = fs.mkdtempSync(join(tmpdir(), "tauri-identity-rollback-"));
  try {
    const entries = Array.from({ length: 6 }, (_, index) => [join(root, `${index}.json`), "new"]);
    entries.slice(0, 5).forEach(([path]) => fs.writeFileSync(path, "old"));
    let writes = 0,
      restores = 0;
    assert.throws(
      () =>
        publishIdentity(root, entries, {
          ...fs,
          renameSync: (...args) => {
            if (writes++ === 5) throw new Error("first failure");
            return fs.renameSync(...args);
          },
          copyFileSync: (...args) => {
            if (!args[2]) {
              const step = restores++;
              if (step === 0 || step === 2) throw new Error("rollback");
            }
            return fs.copyFileSync(...args);
          },
        }),
      (error) => error.cause.message === "first failure" && error.errors.length === 3,
    );
    assert.equal(restores, 5);
    const recovery = fs.readdirSync(root).find((path) => path.startsWith(".setup-recovery"));
    for (let index = 0; index < 5; index++)
      assert.equal(fs.readFileSync(join(root, recovery, `${index}.original`), "utf8"), "old");
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
