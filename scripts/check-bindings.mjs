// Fail when src/shared/bindings.ts is stale or when commands and permissions disagree.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ROOT, isMain, paths, run } from "./project.mjs";

/** Command names the generated bindings invoke. */
export const boundCommands = (bindings) =>
  [...bindings.matchAll(/__TAURI_INVOKE<[^]*?>\("([a-z0-9_]+)"/g)].map((match) => match[1]);

/** Command names granted by `allow-*` entries in the permission file. */
export const permittedCommands = (permissions) =>
  [...permissions.matchAll(/"allow-([a-z0-9-]+)"/g)].map((match) => match[1].replaceAll("-", "_"));

export function permissionErrors(bindings, permissions) {
  const bound = new Set(boundCommands(bindings));
  const permitted = new Set(permittedCommands(permissions));
  return [
    ...[...bound].filter((name) => !permitted.has(name)).map((name) => `${name} has no allow-* permission.`),
    ...[...permitted].filter((name) => !bound.has(name)).map((name) => `allow-${name} has no command.`),
  ];
}

async function main() {
  const files = paths(ROOT);
  const directory = await mkdtemp(join(tmpdir(), "bindings-"));
  try {
    const fresh = join(directory, "bindings.ts");
    run("cargo", [
      "run",
      "--quiet",
      "--locked",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--example",
      "export_bindings",
      "--",
      fresh,
    ]);
    const [expected, actual, permissions] = await Promise.all([
      readFile(fresh, "utf8"),
      readFile(files.bindings, "utf8"),
      readFile(files.permissions, "utf8"),
    ]);
    const errors = permissionErrors(actual, permissions);
    if (expected !== actual) errors.unshift("src/shared/bindings.ts is stale. Run pnpm run bindings.");
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("Bindings and command permissions are current.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) await main();
