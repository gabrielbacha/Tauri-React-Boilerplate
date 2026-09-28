// Remove generated output. The Rust build cache in src-tauri/target stays; run `cargo clean` to remove it.
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
for (const directory of [
  "dist",
  "coverage",
  "test-results",
  "src-tauri/target/release/bundle",
  "src-tauri/target/debug/bundle",
])
  rmSync(resolve(root, directory), { recursive: true, force: true });
