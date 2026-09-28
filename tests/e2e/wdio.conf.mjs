// End-to-end tests against a real debug build through tauri-driver (Linux and Windows).
// Run with `pnpm run test:e2e`; on macOS use `pnpm run test:e2e:docker`.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { binaryPath } from "../../scripts/smoke.mjs";

const application = await binaryPath();
let driver;

export const config = {
  runner: "local",
  specs: ["./specs/**/*.e2e.mjs"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  capabilities: [{ maxInstances: 1, "tauri:options": { application } }],
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { ui: "bdd", timeout: 90_000 },
  waitforTimeout: 15_000,

  // Each spec file gets a fresh profile. The app reads it from TAURI_APP_PROFILE (debug builds only).
  beforeSession() {
    process.env.E2E_PROFILE = join(mkdtempSync(join(tmpdir(), "tauri-e2e-")), "profile");
    driver = spawn("tauri-driver", [], {
      env: { ...process.env, TAURI_APP_PROFILE: process.env.E2E_PROFILE },
      stdio: ["ignore", "inherit", "inherit"],
    });
    return new Promise((resolve) => setTimeout(resolve, 1_000));
  },

  afterSession() {
    driver?.kill();
    rmSync(join(process.env.E2E_PROFILE, ".."), { recursive: true, force: true });
  },
};
