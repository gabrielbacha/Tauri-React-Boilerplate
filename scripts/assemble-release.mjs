// Validate every platform's artifacts, write the updater feed (latest.json) and SHA256SUMS.txt.
//   node scripts/assemble-release.mjs INPUT OUTPUT [--require-mac-architectures]
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ROOT, isMain, readJson } from "./project.mjs";
import { parseArtifactName } from "./release-artifacts.mjs";

const SIGNATURE = /^[A-Za-z0-9+/=\s]+$/;

export function assembleRelease(
  input,
  output,
  { version, owner, repo, requireMacArchitectures = false, now = new Date() },
) {
  if (existsSync(output) && readdirSync(output).length) throw new Error("Release output must be empty.");
  const artifacts = new Map();
  const signatures = new Map();
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const source = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(source);
        continue;
      }
      if (!entry.isFile()) throw new Error(`Unexpected release entry: ${entry.name}`);
      const parsed = parseArtifactName(entry.name);
      if (!parsed) throw new Error(`Unexpected release artifact: ${entry.name}`);
      if (parsed.version !== version) throw new Error(`${entry.name} is not version ${version}.`);
      const target = parsed.signature ? signatures : artifacts;
      const key = parsed.signature ? entry.name.slice(0, -".sig".length) : entry.name;
      if (target.has(key)) throw new Error(`Duplicate artifact: ${entry.name}`);
      target.set(key, { source, ...parsed });
    }
  };
  visit(input);
  if (!artifacts.size) throw new Error("No release artifacts.");
  if (new Set([...artifacts.values()].map((artifact) => artifact.slug)).size > 1)
    throw new Error("Artifacts come from different applications.");

  const platforms = {};
  for (const [name, signature] of signatures) {
    const artifact = artifacts.get(name);
    if (!artifact) throw new Error(`Signature without artifact: ${name}.sig`);
    if (!artifact.updater) throw new Error(`${name} is not an updater artifact.`);
    const content = readFileSync(signature.source, "utf8").trim();
    if (!content || !SIGNATURE.test(content)) throw new Error(`Invalid updater signature: ${name}.sig`);
    platforms[artifact.updater] = {
      signature: content,
      url: `https://github.com/${owner}/${repo}/releases/download/v${version}/${name}`,
    };
  }
  for (const [name, artifact] of artifacts)
    if (artifact.kind === ".app.tar.gz" && !signatures.has(name))
      throw new Error(`Unsigned macOS update archive: ${name}. Unsigned builds must stay out of the update feed.`);
  const mac = Object.keys(platforms).filter((platform) => platform.startsWith("darwin-"));
  if (requireMacArchitectures && mac.length && mac.length !== 2)
    throw new Error("macOS updates must contain both aarch64 and x86_64 archives.");

  // Write only after every input has been validated.
  mkdirSync(output, { recursive: true });
  for (const [name, artifact] of artifacts) copyFileSync(artifact.source, join(output, name));
  if (Object.keys(platforms).length) {
    const feed = { version, notes: `Release v${version}`, pub_date: now.toISOString(), platforms };
    writeFileSync(join(output, "latest.json"), `${JSON.stringify(feed, null, 2)}\n`);
  }
  const checksums = readdirSync(output)
    .toSorted()
    .map(
      (name) =>
        `${createHash("sha256")
          .update(readFileSync(join(output, name)))
          .digest("hex")}  ${name}`,
    );
  writeFileSync(join(output, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);
  return { artifacts: [...artifacts.keys()], platforms: Object.keys(platforms) };
}

if (isMain(import.meta.url)) {
  const [input, output] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!input || !output) throw new Error("Usage: assemble-release.mjs INPUT OUTPUT [--require-mac-architectures]");
  const pkg = readJson(join(ROOT, "package.json"));
  const result = assembleRelease(resolve(input), resolve(output), {
    version: pkg.version,
    owner: pkg.publish.owner,
    repo: pkg.publish.repo,
    requireMacArchitectures: process.argv.includes("--require-mac-architectures"),
  });
  console.log(
    `Assembled ${result.artifacts.length} artifacts; updates for ${result.platforms.join(", ") || "no platforms"}.`,
  );
}
