// Check that package.json, tauri.conf.json, Cargo.toml, the capability, and index.html agree.
//   --strict   also reject template identity (use before a release)
//   --updates  also require updater public and private keys (OS signing remains a warning)
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { REQUIRED_ICONS, consistencyErrors, loadProject, releaseConfigurationErrors } from "./configuration.mjs";
import { ROOT, isMain } from "./project.mjs";

const APPLE_SIGNING = ["APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "APPLE_SIGNING_IDENTITY"];
const APPLE_NOTARIZATION = ["APPLE_API_KEY", "APPLE_API_ISSUER", "APPLE_API_KEY_PATH"];

export function verifyConfiguration(
  root,
  { strict = false, updates = false, env = process.env, platform = process.platform } = {},
) {
  const project = loadProject(root);
  const errors = consistencyErrors(project);
  const warnings = [];
  if (errors.length) return { errors, warnings };
  for (const icon of REQUIRED_ICONS) if (!existsSync(join(root, icon))) errors.push(`Missing icon: ${icon}`);
  const originals = JSON.parse(readFileSync(join(root, "scripts/template-assets.json"), "utf8"));
  for (const [icon, digest] of Object.entries(originals)) {
    const file = join(root, icon);
    if (!existsSync(file)) continue;
    if (createHash("sha256").update(readFileSync(file)).digest("hex") === digest)
      (strict ? errors : warnings).push(`Template icon unchanged: ${icon}. Run pnpm tauri icon <your-icon.png>.`);
  }
  if (strict) {
    errors.push(...releaseConfigurationErrors(project));
    const { owner, repo } = project.pkg.publish;
    if (env.GITHUB_REPOSITORY && env.GITHUB_REPOSITORY.toLowerCase() !== `${owner}/${repo}`.toLowerCase())
      errors.push("The GitHub release repository differs from the configured updater repository.");
  }
  const missing = (keys) => keys.filter((key) => !env[key]);
  // The updater verifies its own signature, so the feed needs the updater key. OS signing and notarization
  // are still needed for Gatekeeper and SmartScreen to accept the first install.
  if (updates && !env.TAURI_SIGNING_PRIVATE_KEY) errors.push("Update feeds require TAURI_SIGNING_PRIVATE_KEY.");
  if (updates && !project.tauri.plugins?.updater?.pubkey?.trim())
    errors.push("No updater public key. Run setup with --updater-key.");
  if (platform === "darwin" && missing([...APPLE_SIGNING, ...APPLE_NOTARIZATION]).length)
    warnings.push("Apple signing or notarization credentials are incomplete; Gatekeeper will block first launch.");
  return { errors, warnings };
}

if (isMain(import.meta.url)) {
  const { errors, warnings } = verifyConfiguration(ROOT, {
    strict: process.argv.includes("--strict"),
    updates: process.argv.includes("--updates"),
  });
  for (const warning of warnings) console.warn(`Warning: ${warning}`);
  if (errors.length) {
    console.error(errors.map((error) => `Error: ${error}`).join("\n"));
    process.exit(1);
  }
  const { pkg } = loadProject(ROOT);
  console.log(`Configuration valid for ${pkg.productName}; updates from ${pkg.publish.owner}/${pkg.publish.repo}.`);
}
