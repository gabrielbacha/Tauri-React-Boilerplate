// Build a verified release on this computer. `--publish` uploads it; a GH_TOKEN alone never publishes.
//   pnpm run release [-- --publish]
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { assembleRelease } from "./assemble-release.mjs";
import { ROOT, paths, readJson, run } from "./project.mjs";

const publish = process.argv.includes("--publish");
const pkg = readJson(paths(ROOT).packageJson);
if (publish && !process.env.GH_TOKEN) throw new Error("--publish requires GH_TOKEN.");

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
console.log(`Validated release files in ${output}. Updates: ${platforms.join(", ") || "none (unsigned)"}.`);

if (publish) {
  const tag = `v${pkg.version}`;
  if (!existsSync(output)) throw new Error("Release output is missing.");
  const files = readdirSync(output).map((name) => join(output, name));
  run("gh", [
    "release",
    "create",
    tag,
    ...files,
    "--repo",
    `${pkg.publish.owner}/${pkg.publish.repo}`,
    "--verify-tag",
    "--generate-notes",
    "--title",
    tag,
  ]);
}
