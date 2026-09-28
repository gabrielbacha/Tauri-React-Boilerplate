// Rename the template: identity, protocol, variant, repository, and optionally an updater key.
// Interactive in a terminal; every value can also be passed as a flag (see OPTIONS).
// Uses only Node.js built-ins, so it runs before `pnpm install`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import {
  ROOT,
  TEMPLATE_REPOSITORY,
  escapeHtml,
  isMain,
  paths,
  readJson,
  run,
  setCargoPackageField,
  updaterEndpoint,
  writeJson,
} from "./project.mjs";

export const OPTIONS = [
  "name",
  "package",
  "app-id",
  "variant",
  "protocol",
  "repo",
  "description",
  "author",
  "email",
  "storage-namespace",
  "documentation",
  "license-url",
  "support",
  "updater-key",
];
const RESERVED_PROTOCOLS = new Set(["app", "http", "https", "file", "data", "javascript", "tauri", "asset", "ipc"]);

export function parseArguments(commandLine) {
  const args = {};
  for (let index = 0; index < commandLine.length; index += 1) {
    const key = commandLine[index];
    if (key === "--skip-install") {
      args["skip-install"] = true;
      continue;
    }
    if (!key.startsWith("--") || !OPTIONS.includes(key.slice(2))) throw new Error(`Unknown setup option: ${key}`);
    if (key.slice(2) in args) throw new Error(`Duplicate setup option: ${key}`);
    const value = commandLine[++index];
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value.`);
    args[key.slice(2)] = value;
  }
  return args;
}

const requireMatch = (value, pattern, message) => {
  if (!pattern.test(value)) throw new Error(message);
};

/** Compute every changed file from the answers. Nothing is written here. */
export function planSetup(root, answers) {
  const files = paths(root);
  const pkg = readJson(files.packageJson);
  const tauri = readJson(files.tauriConfig);
  const capability = readJson(files.capability);
  const cargo = readFileSync(files.cargoToml, "utf8");
  const html = readFileSync(files.html, "utf8");

  const { productName, appId, variant, repository } = answers;
  requireMatch(productName, /^.{1,80}$/s, "Product name must be between 1 and 80 characters.");
  const slug = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const packageName = answers.package ?? (pkg.name === "tauri-gb-boilerplate" ? slug : pkg.name);
  requireMatch(packageName, /^[a-z][a-z0-9-]*$/, "Package name must be lowercase kebab-case, starting with a letter.");
  requireMatch(appId, /^[a-zA-Z][\w-]*(\.[a-zA-Z][\w-]*){2,}$/, "Application ID must use reverse-DNS notation.");
  if (!["clean", "showcase"].includes(variant)) throw new Error("Variant must be clean or showcase.");
  const protocol = answers.protocol ?? (pkg.appConfig.protocol === "tauri-app" ? packageName : pkg.appConfig.protocol);
  requireMatch(protocol, /^[a-z][a-z0-9-]*$/, "URL protocol must use lowercase letters, numbers, and hyphens.");
  if (RESERVED_PROTOCOLS.has(protocol)) throw new Error("Choose a non-reserved URL protocol.");
  const storageNamespace =
    answers["storage-namespace"] ??
    (pkg.appConfig.storageNamespace === "tauri-boilerplate" ? packageName : pkg.appConfig.storageNamespace);
  requireMatch(storageNamespace, /^[a-z][a-z0-9._-]*$/, "Invalid storage namespace.");
  const configuredRepo = `${pkg.publish.owner}/${pkg.publish.repo}`;
  if (repository) requireMatch(repository, /^[\w.-]+\/[\w.-]+$/, "Repository must be owner/name.");
  const effectiveRepo = repository || configuredRepo;
  const rootUrl = `https://github.com/${effectiveRepo}`;
  const changedRepo = effectiveRepo !== configuredRepo;
  const destinations = {
    repository: rootUrl,
    documentation:
      answers.documentation ?? (changedRepo ? `${rootUrl}#readme` : pkg.appConfig.destinations.documentation),
    license:
      answers["license-url"] ?? (changedRepo ? `${rootUrl}/blob/main/LICENSE` : pkg.appConfig.destinations.license),
    support: answers.support ?? (changedRepo ? `${rootUrl}/issues` : pkg.appConfig.destinations.support),
  };
  const description = answers.description ?? pkg.description;
  const author = answers.author ?? pkg.author.name;
  const email = answers.email ?? pkg.author.email;
  if (!description.trim() || !author.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Description, author name, and a valid email are required.");
  for (const [key, value] of Object.entries(destinations)) {
    const url = URL.parse(value);
    if (url?.protocol !== "https:" || url.username || url.password)
      throw new Error(`${key} must be an HTTPS URL without credentials.`);
  }
  const [owner, repo] = effectiveRepo.split("/");

  const nextPackage = structuredClone(pkg);
  Object.assign(nextPackage, { name: packageName, productName, description });
  nextPackage.author = { name: author, email };
  nextPackage.appConfig = { ...pkg.appConfig, appId, protocol, storageNamespace, variant, destinations };
  nextPackage.repository = { ...pkg.repository, url: `${rootUrl}.git` };
  nextPackage.publish = { provider: "github", owner, repo };

  const nextTauri = structuredClone(tauri);
  nextTauri.productName = productName;
  nextTauri.identifier = appId;
  nextTauri.plugins["deep-link"].desktop.schemes = [protocol];
  nextTauri.plugins.updater.endpoints = [updaterEndpoint(owner, repo)];
  if (answers.pubkey !== undefined) nextTauri.plugins.updater.pubkey = answers.pubkey;
  nextTauri.bundle.publisher = author;
  nextTauri.bundle.copyright = `Copyright © ${author}`;
  nextTauri.bundle.shortDescription = description;

  const nextCapability = structuredClone(capability);
  const grants = nextCapability.permissions.filter((permission) => permission !== "showcase-commands");
  grants.splice(1, 0, ...(variant === "showcase" ? ["showcase-commands"] : []));
  nextCapability.permissions = grants;

  let nextCargo = setCargoPackageField(cargo, "name", packageName);
  nextCargo = setCargoPackageField(nextCargo, "description", description);
  nextCargo = setCargoPackageField(nextCargo, "authors", [author]);
  nextCargo = setCargoPackageField(nextCargo, "repository", rootUrl);

  const nextHtml = html.replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(productName)}</title>`);
  if (!nextHtml.includes(`<title>${escapeHtml(productName)}</title>`))
    throw new Error("Could not find the HTML title.");

  return {
    summary: { productName, packageName, appId, variant, protocol, storageNamespace, repository: effectiveRepo },
    writes: [
      [files.packageJson, `${JSON.stringify(nextPackage, null, 2)}\n`],
      [files.tauriConfig, `${JSON.stringify(nextTauri, null, 2)}\n`],
      [files.capability, `${JSON.stringify(nextCapability, null, 2)}\n`],
      [files.cargoToml, nextCargo],
      [files.html, nextHtml],
    ],
  };
}

/** Write every file, or restore all of them if any write fails. */
export function applySetup(plan) {
  const originals = plan.writes.map(([file]) => [file, readFileSync(file, "utf8")]);
  try {
    for (const [file, content] of plan.writes) writeFileSync(file, content);
  } catch (error) {
    for (const [file, content] of originals) writeFileSync(file, content);
    throw error;
  }
}

/** Create an updater key pair outside the project and return the public key. */
function updaterPublicKey(root, keyPath) {
  const file = resolve(keyPath);
  const inside = relative(root, file);
  if (!inside.startsWith("..") && !isAbsolute(inside))
    throw new Error("Keep the updater private key outside the project folder.");
  if (!existsSync(file))
    run("pnpm", ["tauri", "signer", "generate", "--ci", "--password", "", "--write-keys", file], { cwd: root });
  return readFileSync(`${file}.pub`, "utf8").trim();
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const pkg = readJson(paths(ROOT).packageJson);
  const terminal = createInterface({ input: stdin, output: stdout });
  const ask = async (key, label, fallback) => {
    if (key in args) return args[key];
    if (!stdin.isTTY) return fallback;
    const answer = await terminal.question(`${label}${fallback ? ` (${fallback})` : ""}: `);
    return answer.trim() || fallback;
  };
  try {
    const productName = await ask("name", "Product name", pkg.productName === "Tauri App" ? "" : pkg.productName);
    const appId = await ask(
      "app-id",
      "Application ID (permanent)",
      pkg.appConfig.appId === "com.gabrielbacha.tauri-app" ? "" : pkg.appConfig.appId,
    );
    const variant = await ask(
      "variant",
      "Starter variant (clean/showcase)",
      pkg.productName === "Tauri App" ? "clean" : pkg.appConfig.variant,
    );
    const configuredRepo = `${pkg.publish.owner}/${pkg.publish.repo}`;
    const repository = await ask(
      "repo",
      "Public GitHub repository (owner/name; optional)",
      configuredRepo === TEMPLATE_REPOSITORY ? "" : configuredRepo,
    );
    const answers = { ...args, productName, appId, variant, repository };
    if (args["updater-key"]) answers.pubkey = updaterPublicKey(ROOT, args["updater-key"]);
    const plan = planSetup(ROOT, answers);
    const lines = Object.entries(plan.summary).map(([key, value]) => `  ${key}: ${value}`);
    stdout.write(`\nSetup summary\n${lines.join("\n")}\n\n`);
    if (stdin.isTTY && !process.argv.slice(2).length) {
      const answer = await terminal.question("Save configuration and install dependencies? (Y/n): ");
      if (answer.trim() && !/^y(es)?$/i.test(answer.trim())) {
        stdout.write("Setup cancelled; no files changed.\n");
        process.exitCode = 1;
        return;
      }
    }
    applySetup(plan);
    const origin = resolve(ROOT, "template-origin.json");
    if (!existsSync(origin)) {
      let revision = null;
      try {
        revision = run("git", ["rev-parse", "HEAD"], { capture: true }).trim();
      } catch {
        // Not a Git checkout.
      }
      writeJson(origin, { repository: `https://github.com/${TEMPLATE_REPOSITORY}`, revision });
    }
    if (!repository) stdout.write("Set the GitHub repository before release; template publishing links remain.\n");
    if (!args["skip-install"]) {
      run("pnpm", ["install"]);
      // Keep the rewritten files in the repository's format so `pnpm run check` stays green.
      run("pnpm", ["exec", "oxfmt", ...plan.writes.map(([file]) => file)]);
      // Regenerates the bindings for the chosen variant and refreshes Cargo.lock for the new package name.
      run("pnpm", ["run", "bindings"]);
    }
    stdout.write("\nReady. Run pnpm dev to start the app. Replace the icons with pnpm tauri icon <your-icon.png>.\n");
  } finally {
    terminal.close();
  }
}

if (isMain(import.meta.url)) await main();
