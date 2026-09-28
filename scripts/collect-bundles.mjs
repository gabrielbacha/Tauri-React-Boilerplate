// Copy one platform's `tauri build` output into release names. Unsigned builds keep installers only.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { KINDS, artifactName } from "./release-artifacts.mjs";

const SOURCES = [
  { directory: "dmg", suffix: ".dmg", kind: KINDS.dmg, updater: false },
  { directory: "macos", suffix: ".app.tar.gz", kind: KINDS.macUpdate, updater: true },
  { directory: "nsis", suffix: "-setup.exe", kind: KINDS.nsis, updater: true },
  { directory: "appimage", suffix: ".AppImage", kind: KINDS.appImage, updater: true },
  { directory: "deb", suffix: ".deb", kind: KINDS.deb, updater: false },
];

/**
 * @param bundleDirectory `src-tauri/target/[<triple>/]release/bundle`
 * @param output directory for the renamed files
 * @param identity `{ slug, version, arch }`
 * @param signed whether updater signatures were produced; unsigned builds never enter the update feed
 */
export function collectBundles(bundleDirectory, output, identity, { signed }) {
  mkdirSync(output, { recursive: true });
  const collected = [];
  for (const source of SOURCES) {
    const directory = join(bundleDirectory, source.directory);
    if (!existsSync(directory)) continue;
    const files = readdirSync(directory).filter((name) => name.endsWith(source.suffix));
    if (files.length > 1) throw new Error(`Expected one ${source.suffix} in ${directory}, found ${files.length}.`);
    const [file] = files;
    if (!file) continue;
    // The macOS updater archive exists only to be signed; without a signature it is not shipped.
    if (source.kind === KINDS.macUpdate && !signed) continue;
    const name = artifactName(identity, source.kind);
    copyFileSync(join(directory, file), join(output, name));
    collected.push(name);
    const signature = join(directory, `${file}.sig`);
    if (signed && source.updater) {
      if (!existsSync(signature)) throw new Error(`Missing updater signature for ${file}.`);
      copyFileSync(signature, join(output, `${name}.sig`));
      collected.push(`${name}.sig`);
    }
  }
  if (!collected.length) throw new Error(`No bundles found in ${bundleDirectory}.`);
  return collected;
}
