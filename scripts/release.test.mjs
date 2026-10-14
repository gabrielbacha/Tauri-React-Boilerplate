import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { assembleRelease } from "./assemble-release.mjs";
import { permissionErrors } from "./check-bindings.mjs";
import { collectBundles } from "./collect-bundles.mjs";
import { makeOptions } from "./make.mjs";
import { parseArtifactName, releaseArch } from "./release-artifacts.mjs";
import { webBundleErrors } from "./verify-package.mjs";

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "release-test-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const write = (file, content = "x") => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content);
};
const identity = (arch) => ({ slug: "notes", version: "1.2.0", arch });
const release = { version: "1.2.0", owner: "example", repo: "notes", now: new Date("2026-01-01T00:00:00Z") };

function macBundle(directory) {
  write(join(directory, "dmg/Notes_1.2.0_aarch64.dmg"));
  write(join(directory, "macos/Notes.app.tar.gz"));
  write(join(directory, "macos/Notes.app.tar.gz.sig"), "c2lnbmF0dXJl");
}

test("names artifacts without spaces and maps updater platforms", () => {
  assert.deepEqual(parseArtifactName("notes_1.2.0_aarch64.app.tar.gz.sig"), {
    slug: "notes",
    version: "1.2.0",
    arch: "aarch64",
    kind: ".app.tar.gz",
    signature: true,
    updater: "darwin-aarch64",
  });
  assert.equal(parseArtifactName("Notes 1.2.0.dmg"), null);
  assert.equal(releaseArch("aarch64-apple-darwin"), "aarch64");
  assert.equal(releaseArch("x64"), "x86_64");
});

test("unsigned builds ship installers only", () => {
  macBundle(join(root, "bundle"));
  const files = collectBundles(join(root, "bundle"), join(root, "out"), identity("aarch64"), { signed: false });
  assert.deepEqual(files, ["notes_1.2.0_aarch64.dmg"]);
});

test("signed builds carry their updater archive and signature", () => {
  macBundle(join(root, "bundle"));
  const files = collectBundles(join(root, "bundle"), join(root, "out"), identity("aarch64"), { signed: true });
  assert.deepEqual(files, [
    "notes_1.2.0_aarch64.dmg",
    "notes_1.2.0_aarch64.app.tar.gz",
    "notes_1.2.0_aarch64.app.tar.gz.sig",
  ]);
});

test("assembles the updater feed and checksums from every platform", () => {
  for (const arch of ["aarch64", "x86_64"]) {
    macBundle(join(root, `bundle-${arch}`));
    collectBundles(join(root, `bundle-${arch}`), join(root, "input", `mac-${arch}`), identity(arch), { signed: true });
  }
  write(join(root, "input/win-x86_64/notes_1.2.0_x86_64-setup.exe"));
  write(join(root, "input/win-x86_64/notes_1.2.0_x86_64-setup.exe.sig"), "d2lu");
  const result = assembleRelease(join(root, "input"), join(root, "release"), {
    ...release,
    requireMacArchitectures: true,
  });
  assert.deepEqual(result.platforms.toSorted(), ["darwin-aarch64", "darwin-x86_64", "windows-x86_64"]);
  const feed = JSON.parse(readFileSync(join(root, "release/latest.json"), "utf8"));
  assert.equal(
    feed.platforms["windows-x86_64"].url,
    "https://github.com/example/notes/releases/download/v1.2.0/notes_1.2.0_x86_64-setup.exe",
  );
  assert.equal(feed.platforms["darwin-aarch64"].signature, "c2lnbmF0dXJl");
  const outputs = readdirSync(join(root, "release"));
  assert.ok(outputs.includes("SHA256SUMS.txt") && !outputs.some((name) => name.endsWith(".sig")));
});

test("rejects inconsistent releases before writing", () => {
  write(join(root, "input/a/notes_1.2.0_aarch64.app.tar.gz"));
  assert.throws(() => assembleRelease(join(root, "input"), join(root, "release"), release), /Unsigned macOS/);
  rmSync(join(root, "input"), { recursive: true });
  write(join(root, "input/a/notes_1.1.0_aarch64.dmg"));
  assert.throws(() => assembleRelease(join(root, "input"), join(root, "release"), release), /not version 1.2.0/);
  rmSync(join(root, "input"), { recursive: true });
  write(join(root, "input/a/notes_1.2.0_aarch64.app.tar.gz"));
  write(join(root, "input/a/notes_1.2.0_aarch64.app.tar.gz.sig"), "c2ln");
  assert.throws(
    () => assembleRelease(join(root, "input"), join(root, "release"), { ...release, requireMacArchitectures: true }),
    /both aarch64 and x86_64/,
  );
  assert.deepEqual(readdirSync(root).includes("release"), false);
});

test("builds only for the host platform and signs only with a key", () => {
  const options = makeOptions(["--mac"], { platform: "darwin", arch: "arm64", env: {}, pubkey: "" });
  assert.deepEqual(options.args, ["tauri", "build", "--bundles", "app,dmg"]);
  assert.equal(options.profile, "release");
  assert.equal(options.signed, false);
  const dist = makeOptions(["--dist"], { platform: "darwin", arch: "arm64", env: {}, pubkey: "" });
  assert.deepEqual(dist.args, ["tauri", "build", "--bundles", "app,dmg", "--", "--profile", "dist"]);
  assert.equal(dist.profile, "dist");
  const signed = makeOptions([], {
    platform: "linux",
    arch: "x64",
    env: { TAURI_SIGNING_PRIVATE_KEY: "k" },
    pubkey: "p",
  });
  assert.equal(signed.signed, true);
  assert.equal(signed.arch, "x86_64");
  assert.throws(() => makeOptions(["--win"], { platform: "darwin", arch: "arm64", env: {} }), /win computer/);
});

test("keeps sources, secrets, and release source maps out of the web bundle", () => {
  write(join(root, "dist/index.html"), "<html></html>");
  write(join(root, "dist/assets/app.js.map"));
  write(join(root, "dist/assets/.env"));
  assert.equal(webBundleErrors(join(root, "dist"), { debug: true }).length, 1);
  assert.equal(webBundleErrors(join(root, "dist"), { debug: false }).length, 2);
});

test("every bound command has exactly one permission", () => {
  const bindings = '__TAURI_INVOKE<null>("tasks_list") __TAURI_INVOKE<{\n a: string }>("app_get_info")';
  assert.deepEqual(permissionErrors(bindings, '"allow-tasks-list", "allow-app-get-info"'), []);
  assert.deepEqual(permissionErrors(bindings, '"allow-tasks-list", "allow-removed"'), [
    "app_get_info has no allow-* permission.",
    "allow-removed has no command.",
  ]);
});
