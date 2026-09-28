import { readFileSync } from "node:fs";

import { z } from "zod";

import { TEMPLATE_REPOSITORY, cargoPackageName, escapeHtml, paths, readJson, updaterEndpoint } from "./project.mjs";

export { updaterEndpoint };

const RESERVED_PROTOCOLS = new Set(["app", "http", "https", "file", "data", "javascript", "tauri", "asset", "ipc"]);

const httpsUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS URL without credentials.");

export const configurationSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  productName: z.string().trim().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Use a plain semantic version such as 1.2.3."),
  description: z.string().trim().min(1),
  author: z.object({ name: z.string().min(1), email: z.email() }),
  license: z.string().min(1),
  repository: z.object({ url: httpsUrl }),
  appConfig: z.object({
    appId: z.string().regex(/^[a-zA-Z][\w-]*(\.[a-zA-Z][\w-]*){2,}$/, "Use reverse-DNS notation."),
    protocol: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .refine((value) => !RESERVED_PROTOCOLS.has(value), "Choose a non-reserved external URL scheme."),
    storageNamespace: z.string().regex(/^[a-z][a-z0-9._-]*$/),
    variant: z.enum(["showcase", "clean"]),
    destinations: z.object({ repository: httpsUrl, documentation: httpsUrl, license: httpsUrl, support: httpsUrl }),
  }),
  publish: z.object({ provider: z.literal("github"), owner: z.string().min(1), repo: z.string().min(1) }),
});

export const REQUIRED_ICONS = [
  "src-tauri/icons/32x32.png",
  "src-tauri/icons/128x128.png",
  "src-tauri/icons/128x128@2x.png",
  "src-tauri/icons/icon.icns",
  "src-tauri/icons/icon.ico",
  "src-tauri/icons/icon.png",
];

/** Read every identity file. */
export function loadProject(root) {
  const files = paths(root);
  return {
    pkg: readJson(files.packageJson),
    tauri: readJson(files.tauriConfig),
    capability: readJson(files.capability),
    cargo: readFileSync(files.cargoToml, "utf8"),
    html: readFileSync(files.html, "utf8"),
  };
}

/** Problems that make the project inconsistent. Each must be fixed before a build. */
export function consistencyErrors({ pkg, tauri, capability, cargo, html }) {
  const errors = [];
  const parsed = configurationSchema.safeParse(pkg);
  if (!parsed.success)
    return parsed.error.issues.map((issue) => `package.json ${issue.path.join(".")}: ${issue.message}`);
  if (tauri.productName !== pkg.productName) errors.push("tauri.conf.json productName differs from package.json.");
  if (tauri.identifier !== pkg.appConfig.appId) errors.push("tauri.conf.json identifier differs from appConfig.appId.");
  if (tauri.version !== "../package.json") errors.push('tauri.conf.json version must be "../package.json".');
  const schemes = tauri.plugins?.["deep-link"]?.desktop?.schemes ?? [];
  if (schemes.length !== 1 || schemes[0] !== pkg.appConfig.protocol)
    errors.push("The deep-link scheme in tauri.conf.json differs from appConfig.protocol.");
  const endpoints = tauri.plugins?.updater?.endpoints ?? [];
  if (endpoints.length !== 1 || endpoints[0] !== updaterEndpoint(pkg.publish.owner, pkg.publish.repo))
    errors.push("The updater endpoint differs from the publish repository.");
  const security = tauri.app?.security ?? {};
  if (tauri.app?.withGlobalTauri !== false) errors.push("app.withGlobalTauri must be false.");
  if (!security.csp || typeof security.csp !== "object") errors.push("app.security.csp must be set.");
  if (tauri.app?.macOSPrivateApi) errors.push("app.macOSPrivateApi must stay off.");
  const showcase = capability.permissions.includes("showcase-commands");
  if (showcase !== (pkg.appConfig.variant === "showcase"))
    errors.push("capabilities/desktop.json must grant showcase-commands only in the showcase variant.");
  const crate = cargoPackageName(cargo);
  if (!/^[a-z][a-z0-9-]*$/.test(crate)) errors.push("The Cargo package name must be lowercase kebab-case.");
  if (!html.includes(`<title>${escapeHtml(pkg.productName)}</title>`))
    errors.push("The index.html title differs from productName.");
  return errors;
}

/** Template identity that must change before a public release. */
export function releaseConfigurationErrors({ pkg, tauri, cargo }) {
  const errors = [];
  const repository = `https://github.com/${pkg.publish.owner}/${pkg.publish.repo}`;
  if (pkg.repository.url.replace(/\.git$/, "") !== repository || pkg.appConfig.destinations.repository !== repository)
    errors.push("Repository and updater destinations must agree.");
  const template =
    pkg.productName === "Tauri App" ||
    pkg.name === "tauri-gb-boilerplate" ||
    pkg.appConfig.appId === "com.gabrielbacha.tauri-app" ||
    pkg.appConfig.protocol === "tauri-app" ||
    pkg.appConfig.storageNamespace === "tauri-boilerplate" ||
    cargoPackageName(cargo) === "tauri-app" ||
    `${pkg.publish.owner}/${pkg.publish.repo}` === TEMPLATE_REPOSITORY ||
    Object.values(pkg.appConfig.destinations).some((url) => url.includes(TEMPLATE_REPOSITORY));
  if (template) errors.push("Template identity or destinations remain. Run pnpm run setup before release.");
  if (!tauri.plugins?.updater?.pubkey) errors.push("No updater public key. Run setup with --updater-key.");
  return errors;
}
