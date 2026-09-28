// Shared helpers for the maintenance scripts. Paths are relative to the project root.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ROOT = resolve(import.meta.dirname, "..");
export const TEMPLATE_REPOSITORY = "gabrielbacha/Tauri-React-Boilerplate";

export const updaterEndpoint = (owner, repo) =>
  `https://github.com/${owner}/${repo}/releases/latest/download/latest.json`;

export const paths = (root = ROOT) => ({
  packageJson: join(root, "package.json"),
  tauriConfig: join(root, "src-tauri/tauri.conf.json"),
  cargoToml: join(root, "src-tauri/Cargo.toml"),
  capability: join(root, "src-tauri/capabilities/desktop.json"),
  html: join(root, "index.html"),
  bindings: join(root, "src/shared/bindings.ts"),
  permissions: join(root, "src-tauri/permissions/app-commands.toml"),
});

export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
export const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/** Lines of the `[package]` table in Cargo.toml, as `[index, line]` pairs. */
function packageLines(lines) {
  const start = lines.findIndex((line) => line.trim() === "[package]");
  if (start === -1) throw new Error("Cargo.toml has no [package] table.");
  const entries = [];
  for (let index = start + 1; index < lines.length && !lines[index].startsWith("["); index += 1)
    entries.push([index, lines[index]]);
  return entries;
}

const packageField = (key) => new RegExp(`^${key}\\s*=`);

/** The `[package]` name in Cargo.toml, which is also the binary name. */
export function cargoPackageName(source) {
  const line = packageLines(source.split("\n")).find(([, text]) => packageField("name").test(text))?.[1];
  const name = line && /"([^"]+)"/.exec(line)?.[1];
  if (!name) throw new Error("Unable to read the package name from src-tauri/Cargo.toml.");
  return name;
}

/** Replace one `key = value` line inside `[package]`. */
export function setCargoPackageField(source, key, value) {
  const lines = source.split("\n");
  const entry = packageLines(lines).find(([, text]) => packageField(key).test(text));
  if (!entry) throw new Error(`Cargo.toml has no [package] ${key}.`);
  lines[entry[0]] = `${key} = ${JSON.stringify(value)}`;
  return lines.join("\n");
}

/** The Cargo build folder, honouring CARGO_TARGET_DIR. */
export const targetDirectory = (root = ROOT, env = process.env) =>
  env.CARGO_TARGET_DIR ? resolve(env.CARGO_TARGET_DIR) : join(root, "src-tauri/target");

export const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Run a command and throw when it fails. `pnpm` resolves to the CLI that started this script. */
export function run(command, args, options = {}) {
  const pnpmCli = command === "pnpm" ? process.env.npm_execpath : undefined;
  if (command === "pnpm" && process.platform === "win32" && !pnpmCli)
    throw new Error("Run this script through pnpm run so the pnpm CLI can be resolved on Windows.");
  const nodeCli = pnpmCli && /\.(?:c|m)?js$/.test(pnpmCli);
  const executable = nodeCli ? process.execPath : pnpmCli || command;
  const result = spawnSync(executable, nodeCli ? [pnpmCli, ...args] : args, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
  if (result.error || result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed (${result.status ?? result.error?.message}).`);
  return result.stdout ?? "";
}

export const isMain = (url) => Boolean(process.argv[1]) && url === pathToFileURL(resolve(process.argv[1])).href;
