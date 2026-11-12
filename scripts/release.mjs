import { spawnSync } from "node:child_process";
// Build verified offline host artifacts. The tagged multi-platform workflow owns publication.
//   pnpm run release (offline artifacts only)
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { assembleRelease } from "./assemble-release.mjs";
import { ROOT, paths, readJson, run } from "./project.mjs";
import { releaseSource } from "./release-source.mjs";

const publish = process.argv.includes("--publish");
const pkg = readJson(paths(ROOT).packageJson);
if (publish) {
  releaseSource(ROOT, `v${pkg.version}`);
  throw new Error("Local publication is disabled. Use the tagged multi-platform release workflow.");
}
const baseCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout?.trim() ?? null;

const sourceDirty = Boolean(
  spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" }).stdout?.trim(),
);
run(process.execPath, [
  "scripts/verify-config.mjs",
  "--strict",
  ...(process.env.TAURI_SIGNING_PRIVATE_KEY ? ["--updates"] : []),
]);
run("pnpm", ["run", "clean"]);
run("pnpm", ["run", "check"]);
run(process.execPath, ["scripts/make.mjs", "--dist"]);

const input = join(ROOT, "dist/release-input");
const output = join(ROOT, "dist/release");
rmSync(output, { recursive: true, force: true });
const { platforms } = assembleRelease(input, output, {
  version: pkg.version,
  owner: pkg.publish.owner,
  repo: pkg.publish.repo,
});
writeFileSync(
  join(output, "source.json"),
  JSON.stringify(
    {
      commit: sourceDirty ? null : baseCommit,
      baseCommit,
      sourceDirty,
      version: pkg.version,
      publication: "offline-only",
      platform: process.platform,
      arch: process.arch,
    },
    null,
    2,
  ),
);
console.log(`Validated release files in ${output}. Updates: ${platforms.join(", ") || "none (unsigned)"}.`);
