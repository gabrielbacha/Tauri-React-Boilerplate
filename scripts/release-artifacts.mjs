// Release file naming shared by the build (collect) and publish (assemble) steps.
//   <package>_<version>_<arch><kind>[.sig], for example my-app_1.2.0_aarch64.dmg
// Names never contain spaces, so GitHub keeps them unchanged and updater URLs stay valid.

export const KINDS = {
  dmg: ".dmg",
  macUpdate: ".app.tar.gz",
  nsis: "-setup.exe",
  appImage: ".AppImage",
  deb: ".deb",
};

/** Updater platform keys for each updatable kind and architecture. */
export const UPDATER_PLATFORMS = {
  [`aarch64${KINDS.macUpdate}`]: "darwin-aarch64",
  [`x86_64${KINDS.macUpdate}`]: "darwin-x86_64",
  [`x86_64${KINDS.nsis}`]: "windows-x86_64",
  [`x86_64${KINDS.appImage}`]: "linux-x86_64",
};

const kindPattern = Object.values(KINDS)
  .map((kind) => kind.replaceAll(".", "\\."))
  .join("|");
export const ARTIFACT_NAME = new RegExp(
  `^([a-z][a-z0-9-]*)_(\\d+\\.\\d+\\.\\d+)_(aarch64|x86_64)(${kindPattern})(\\.sig)?$`,
);

export function parseArtifactName(name) {
  const match = ARTIFACT_NAME.exec(name);
  if (!match) return null;
  const [, slug, version, arch, kind, signature] = match;
  return { slug, version, arch, kind, signature: Boolean(signature), updater: UPDATER_PLATFORMS[`${arch}${kind}`] };
}

export const artifactName = ({ slug, version, arch }, kind) => `${slug}_${version}_${arch}${kind}`;

/** Normalize a Rust target or Node architecture to the release naming. */
export function releaseArch(value) {
  if (/^(arm64|aarch64)/.test(value)) return "aarch64";
  if (/^(x64|x86_64|amd64)/.test(value)) return "x86_64";
  throw new Error(`Unsupported architecture: ${value}`);
}
