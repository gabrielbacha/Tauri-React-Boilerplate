// Rename a copy of the template for each variant, then check, build, and launch it.
// Uses one shared Rust build cache so the second variant builds incrementally.
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ROOT, run } from "./project.mjs";

const EXCLUDED = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "test-results",
  "target",
  "template-origin.json",
]);
const env = { ...process.env, CARGO_TARGET_DIR: join(ROOT, "src-tauri/target/template-test") };

for (const variant of ["showcase", "clean"]) {
  const directory = mkdtempSync(join(tmpdir(), `tauri-${variant}-acceptance-`));
  try {
    cpSync(ROOT, directory, {
      recursive: true,
      filter: (source) => {
        const name = source.split(/[/\\]/).at(-1) ?? "";
        return !EXCLUDED.has(name) && !name.startsWith(".env") && !name.endsWith(".tsbuildinfo");
      },
    });
    run("git", ["init", "-q"], { cwd: directory });
    run(
      process.execPath,
      [
        "scripts/setup.mjs",
        "--name",
        "Renamed Notes",
        "--package",
        "renamed-notes",
        "--app-id",
        "com.example.renamed-notes",
        "--repo",
        "example/renamed-notes",
        "--variant",
        variant,
      ],
      { cwd: directory, env },
    );
    run("pnpm", ["run", "check"], { cwd: directory, env });
    run("pnpm", ["run", "package"], { cwd: directory, env });
    run(process.execPath, ["scripts/smoke.mjs"], { cwd: directory, env });
    console.log(`Renamed ${variant} starter verified.`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
