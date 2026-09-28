import { readFileSync } from "node:fs";

import { $, browser, expect } from "@wdio/globals";

import { desktop, quitAndRelaunch, waitForApp, waitForRoute } from "../helpers.mjs";

const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
const showcase = pkg.appConfig.variant === "showcase";

describe("workspace", () => {
  before(waitForApp);

  it("opens the command palette from the keyboard", async () => {
    const search = $('input[aria-label="Search commands"]');
    await browser.keys(["Control", "k"]);
    await expect(search).toBeDisplayed();
    await expect(search).toBeFocused();
    await browser.keys("Escape");
    await expect(search).not.toExist();
  });

  it("navigates to settings and back", async () => {
    await browser.keys(["Control", ","]);
    await waitForRoute("/settings");
    await browser.keys(["Control", "1"]);
    await waitForRoute("/");
  });

  if (!showcase) return;

  it("saves a document and restores it after a restart", async () => {
    await $("aria/Document title").setValue("E2E note");
    await $("aria/Scratchpad draft").setValue("persistent text");
    await $("button=Save document").click();
    await browser.waitUntil(
      async () => (await desktop("documents.list")).some((document) => document.title === "E2E note"),
      {
        timeoutMsg: "The document was not saved.",
      },
    );
    await expect($(".//*[normalize-space()='Saved to this device']")).toBeDisplayed();
    await desktop("preferences.update", { restoreWindows: true });
    await quitAndRelaunch();
    await expect($("aria/Scratchpad draft")).toHaveValue("persistent text");
  });

  it("asks before quitting with unsaved work", async () => {
    await $("aria/Scratchpad draft").setValue("unsaved change");
    await browser.execute(() => window.desktop.window.quit());
    const dialog = $("h2*=interrupt current work");
    await expect(dialog).toBeDisplayed();
    await $("button=Cancel").click();
    await expect(dialog).not.toBeDisplayed();
    await expect($("aria/Scratchpad draft")).toHaveValue("unsaved change");
    await desktop("lifecycle.setDirtyState", { sources: [] });
  });
});
