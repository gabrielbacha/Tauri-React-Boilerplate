import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parse } from "yaml";

const workflow = (name) => parse(readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8"));
const commands = (job) => new Set(job.steps.map((step) => step.run ?? ""));

test("CI requires manual dispatch; only version tags trigger releases", () => {
  assert.deepEqual(Object.keys(workflow("ci.yml").on), ["workflow_dispatch"]);
  const release = workflow("release.yml");
  assert.deepEqual(Object.keys(release.on), ["push"]);
  assert.deepEqual(Object.keys(release.on.push), ["tags"]);
});

test("releases run every quality gate before building and publishing", () => {
  const release = workflow("release.yml");
  const quality = commands(release.jobs.quality);
  for (const command of [
    "pnpm run check",
    "node scripts/verify-config.mjs --strict",
    "dbus-run-session -- xvfb-run -a pnpm run smoke",
    "dbus-run-session -- xvfb-run -a pnpm run test:e2e",
  ])
    assert.ok(quality.has(command), command);
  assert.equal(release.jobs.build.needs, "quality");
  assert.equal(release.jobs.publish.needs, "build");
  assert.ok(
    commands(release.jobs.publish).has(
      "node scripts/assemble-release.mjs release-input release --require-mac-architectures",
    ),
  );
});

test("release builds cover both Mac architectures, Windows, and Linux", () => {
  const targets = workflow("release.yml").jobs.build.strategy.matrix.include.map((entry) => entry.target);
  assert.deepEqual(targets.toSorted(), [
    "aarch64-apple-darwin",
    "x86_64-apple-darwin",
    "x86_64-pc-windows-msvc",
    "x86_64-unknown-linux-gnu",
  ]);
});

test("every job supplies pnpm's supported major version", () => {
  for (const name of ["ci.yml", "release.yml"]) {
    for (const [jobName, job] of Object.entries(workflow(name).jobs)) {
      const setup = job.steps.find((step) => step.uses === "pnpm/action-setup@v4");
      assert.equal(setup?.with?.version, 12, `${name}: ${jobName}`);
    }
  }
});

test("template acceptance stays opt in and covers all desktop platforms", () => {
  const job = workflow("ci.yml").jobs.template;
  assert.equal(job.if, "inputs.template");
  assert.deepEqual(job.strategy.matrix.os, ["ubuntu-22.04", "macos-latest", "windows-latest"]);
  assert.ok(commands(job).has("dbus-run-session -- xvfb-run -a pnpm run test:template"));
  assert.ok(commands(job).has("pnpm run test:template"));
  assert.ok(
    job.steps.some((step) => step.name === "Install matching Edge WebDriver" && step.if === "runner.os == 'Windows'"),
  );
});
