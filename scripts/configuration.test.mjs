import assert from "node:assert/strict";
import { test } from "node:test";

import { configurationSchema, consistencyErrors, loadProject, releaseConfigurationErrors } from "./configuration.mjs";
import { ROOT } from "./project.mjs";

const project = () => structuredClone(loadProject(ROOT));

test("the project files agree with each other", () => {
  assert.deepEqual(consistencyErrors(project()), []);
});

test("rejects unsafe identities and destinations", () => {
  const { pkg } = project();
  assert.ok(configurationSchema.safeParse(pkg).success);
  for (const protocol of ["app", "http", "https", "file", "javascript", "tauri", "Bad"]) {
    const candidate = structuredClone(pkg);
    candidate.appConfig.protocol = protocol;
    assert.equal(configurationSchema.safeParse(candidate).success, false, protocol);
  }
  for (const url of ["http://example.com", "file:///tmp/x", "https://user:secret@example.com"]) {
    const candidate = structuredClone(pkg);
    candidate.appConfig.destinations.support = url;
    assert.equal(configurationSchema.safeParse(candidate).success, false, url);
  }
});

test("detects drift between package.json and the Tauri configuration", () => {
  const drifted = project();
  drifted.tauri.identifier = "com.example.other";
  drifted.tauri.plugins["deep-link"].desktop.schemes = ["other"];
  drifted.tauri.app.withGlobalTauri = true;
  const grants = drifted.capability.permissions;
  drifted.capability.permissions = grants.includes("showcase-commands")
    ? grants.filter((grant) => grant !== "showcase-commands")
    : [...grants, "showcase-commands"];
  drifted.html = drifted.html.replace(/<title>.*<\/title>/, "<title>Other</title>");
  const errors = consistencyErrors(drifted).join("\n");
  for (const expected of ["identifier", "deep-link", "withGlobalTauri", "showcase-commands", "title"])
    assert.match(errors, new RegExp(expected));
});

test("a release needs a renamed identity, independently of updater configuration", () => {
  // Exercise a fresh template even when this test runs in a renamed application.
  const template = project();
  template.pkg.productName = "Tauri App";
  template.tauri.plugins.updater.pubkey = "";
  const errors = releaseConfigurationErrors(template).join("\n");
  assert.match(errors, /Template identity/);
  assert.doesNotMatch(errors, /updater public key/);
});

test("rejects invalid names and application IDs", () => {
  const { pkg } = project();
  for (const productName of ["", "   ", "x".repeat(81)])
    assert.equal(configurationSchema.safeParse({ ...pkg, productName }).success, false);
  for (const appId of ["com.example.my_notes", "com.example.app!", "notes", "com..notes"])
    assert.equal(configurationSchema.safeParse({ ...pkg, appConfig: { ...pkg.appConfig, appId } }).success, false);
  for (const email of [".invalid@example.com", "two..dots@example.com"])
    assert.equal(configurationSchema.safeParse({ ...pkg, author: { ...pkg.author, email } }).success, false);
});
