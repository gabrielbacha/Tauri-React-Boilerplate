import { spawn } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { $, browser, expect } from "@wdio/globals";

import { binaryPath } from "../../../scripts/smoke.mjs";
import { desktop, restart, waitForApp, waitForRoute } from "../helpers.mjs";

const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));

describe("starter", () => {
  before(waitForApp);

  it("reports the configured identity", async () => {
    await expect(await desktop("app.getInfo")).toMatchObject({
      name: pkg.productName,
      protocol: pkg.appConfig.protocol,
    });
    await expect(browser).toHaveTitle(pkg.productName);
  });

  it("keeps preferences across a restart", async () => {
    await desktop("preferences.update", { theme: "dark" });
    await restart();
    await expect(await desktop("preferences.get")).toMatchObject({ theme: "dark" });
    await expect($("html")).toHaveElementClass("dark");
  });

  it("opens deep links sent by a second launch", async () => {
    const second = spawn(await binaryPath(), [`${pkg.appConfig.protocol}://open/settings`], {
      env: { ...process.env, TAURI_APP_PROFILE: process.env.E2E_PROFILE },
      stdio: "ignore",
    });
    await new Promise((resolve) => second.once("exit", resolve));
    await waitForRoute("/settings");
  });

  it("moves corrupt settings aside and starts with defaults", async () => {
    const profile = process.env.E2E_PROFILE;
    writeFileSync(join(profile, "preferences.json"), '{"truncated":');
    writeFileSync(join(profile, "permissions.json"), '{"schemaVersion":1,"decisions":{"camera":"invalid"}}');
    await restart();
    await expect(await desktop("preferences.get")).toMatchObject({ theme: "system" });
    const statuses = await desktop("permissions.list");
    await expect(statuses.every((status) => status.decision === "prompt")).toBe(true);
    const backups = readdirSync(profile).filter((name) => name.includes(".corrupt-"));
    await expect(backups).toHaveLength(2);
    const preferences = backups.find((name) => name.startsWith("preferences"));
    await expect(readFileSync(join(profile, preferences), "utf8")).toBe('{"truncated":');
  });

  if (pkg.appConfig.variant === "clean") {
    it("does not expose showcase commands", async () => {
      const error = await browser.execute(() =>
        window.desktop.tasks.startFileHash().then(
          () => null,
          (reason) => String(reason),
        ),
      );
      await expect(error).toMatch(/not allowed/);
    });
  }
});
