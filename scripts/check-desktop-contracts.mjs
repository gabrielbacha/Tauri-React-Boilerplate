import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "packages/desktop-contracts/export-manifest.json"), "utf8"));
if (manifest.owner !== "Electron-Builder-GB-Boilerplate" || manifest.version !== "0.1.0")
  throw new Error("Unsupported canonical desktop contract revision.");
for (const [path, expected] of Object.entries(manifest.files)) {
  if (
    createHash("sha256")
      .update(readFileSync(resolve(root, path)))
      .digest("hex") !== expected
  )
    throw new Error(`Copied contract drift: ${path}`);
}

const wrappers = JSON.parse(readFileSync(resolve(root, "packages/desktop-contracts/shared-ui-files.json"), "utf8"));
for (const entry of wrappers) {
  const host = resolve(root, "src", entry.path);
  const canonical = resolve(root, "packages/desktop-contracts/src/ui", entry.path);
  let target = relative(dirname(host), canonical).replaceAll("\\", "/");
  if (!target.startsWith(".")) target = "./" + target;
  const expected =
    entry.kind === "style"
      ? `@import "${target}";\n`
      : `export * from "${target.replace(/\.tsx?$/, "")}";\n` +
        (entry.default ? `export { default } from "${target.replace(/\.tsx?$/, "")}";\n` : "");
  if (readFileSync(host, "utf8") !== expected) throw new Error(`Shared interface wrapper drift: ${entry.path}`);
}
