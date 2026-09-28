// Build installers for this computer's platform into dist/release-input/<platform>-<arch>/.
//   pnpm run make [-- --mac|--win|--linux] [--target <rust-triple>]
// With TAURI_SIGNING_PRIVATE_KEY and an updater public key, updater archives and signatures are included.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { collectBundles } from "./collect-bundles.mjs";
import { ROOT, cargoPackageName, isMain, paths, readJson, run, targetDirectory } from "./project.mjs";
import { releaseArch } from "./release-artifacts.mjs";

const PLATFORMS = {
  darwin: { flag: "--mac", name: "mac", bundles: "app,dmg" },
  win32: { flag: "--win", name: "win", bundles: "nsis" },
  linux: { flag: "--linux", name: "linux", bundles: "appimage,deb" },
};

export function makeOptions(
  argv,
  { platform = process.platform, arch = process.arch, env = process.env, pubkey = "" } = {},
) {
  const host = PLATFORMS[platform];
  if (!host) throw new Error(`Unsupported build platform: ${platform}`);
  const requested = Object.values(PLATFORMS).find((candidate) => argv.includes(candidate.flag));
  if (requested && requested !== host)
    throw new Error(`${requested.flag} builds need a ${requested.name} computer or CI runner.`);
  const targetIndex = argv.indexOf("--target");
  const target = targetIndex === -1 ? undefined : argv[targetIndex + 1];
  if (targetIndex !== -1 && !target) throw new Error("--target requires a Rust target triple.");
  const signed = Boolean(env.TAURI_SIGNING_PRIVATE_KEY) && Boolean(pubkey.trim());
  const args = ["tauri", "build", "--bundles", host.bundles];
  if (target) args.push("--target", target);
  if (signed) args.push("--config", JSON.stringify({ bundle: { createUpdaterArtifacts: true } }));
  return { host, target, signed, arch: releaseArch(target ?? arch), args };
}

function main() {
  const files = paths(ROOT);
  const pkg = readJson(files.packageJson);
  const tauri = readJson(files.tauriConfig);
  const options = makeOptions(process.argv.slice(2), { pubkey: tauri.plugins.updater.pubkey ?? "" });
  if (!options.signed)
    console.warn("Unsigned build: installers only. Updater archives need TAURI_SIGNING_PRIVATE_KEY.");
  run("pnpm", options.args);
  run(process.execPath, ["scripts/verify-package.mjs", ...(options.target ? ["--target", options.target] : [])]);
  const releaseDirectory = join(targetDirectory(), ...(options.target ? [options.target] : []), "release");
  const slug = cargoPackageName(readFileSync(files.cargoToml, "utf8"));
  const output = join(ROOT, "dist/release-input", `${options.host.name}-${options.arch}`);
  const collected = collectBundles(
    join(releaseDirectory, "bundle"),
    output,
    { slug, version: pkg.version, arch: options.arch },
    {
      signed: options.signed,
    },
  );
  console.log(`Collected ${collected.length} files in ${output}.`);
}

if (isMain(import.meta.url)) main();
