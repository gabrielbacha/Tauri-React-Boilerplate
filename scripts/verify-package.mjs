// Check a build before it ships: consistent configuration, a binary, and no sources or secrets in the web bundle.
//   node scripts/verify-package.mjs [--debug | --profile <cargo-profile>] [--target <rust-triple>]
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { consistencyErrors, loadProject } from "./configuration.mjs";
import { ROOT, cargoPackageName, isMain, targetDirectory } from "./project.mjs";

const FORBIDDEN = [/\.tsx?$/, /(^|\/)\.env/, /\.sqlite$/, /\.pem$/, /\.key$/];

export function webBundleErrors(distDirectory, { debug }) {
  if (!existsSync(join(distDirectory, "index.html"))) return ["The web bundle has no index.html. Run the build first."];
  const errors = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      const path = relative(distDirectory, file);
      if (entry.isDirectory()) {
        if (path === "release-input" || path === "release") continue;
        visit(file);
      } else if (FORBIDDEN.some((pattern) => pattern.test(path)))
        errors.push(`Forbidden file in the web bundle: ${path}`);
      else if (!debug && path.endsWith(".map")) errors.push(`Source map in a release web bundle: ${path}`);
    }
  };
  visit(distDirectory);
  return errors;
}

export function verifyPackage(root, { debug = false, profile = debug ? "debug" : "release", target } = {}) {
  const project = loadProject(root);
  const errors = [...consistencyErrors(project), ...webBundleErrors(join(root, "dist"), { debug })];
  const name = cargoPackageName(project.cargo);
  const binary = join(
    targetDirectory(root),
    ...(target ? [target] : []),
    profile,
    process.platform === "win32" ? `${name}.exe` : name,
  );
  if (!existsSync(binary)) errors.push(`Missing application binary: ${relative(root, binary)}`);
  if (!debug && readFileSync(join(root, "dist/index.html"), "utf8").includes("localhost:1420"))
    errors.push("The release web bundle references the development server.");
  return errors;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const errors = verifyPackage(ROOT, {
    debug: argv.includes("--debug"),
    profile: option("--profile"),
    target: option("--target"),
  });
  if (errors.length) {
    console.error(errors.map((error) => `Error: ${error}`).join("\n"));
    process.exit(1);
  }
  console.log("Package contents verified.");
}
