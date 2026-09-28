import { browser } from "@wdio/globals";

/** Wait until the interface has installed the bridge and rendered the shell. */
export async function waitForApp() {
  await browser.waitUntil(
    () => browser.execute(() => Boolean(window.desktop) && Boolean(document.querySelector(".app-shell"))),
    {
      timeoutMsg: "The interface did not start.",
    },
  );
}

/** Call a bridge method in the page and return its result. */
export function desktop(path, ...args) {
  return browser.execute(
    async (method, values) => {
      const [group, name] = method.split(".");
      return window.desktop[group][name](...values);
    },
    path,
    args,
  );
}

/** Wait until Rust records `route` as this window's session route. */
export async function waitForRoute(route) {
  await browser.waitUntil(async () => (await desktop("window.getSession")).route === route, {
    timeoutMsg: `The window did not navigate to ${route}.`,
  });
}

/** Restart the application with the same profile. Ending the session stops the process without the quit flow. */
export async function restart() {
  await browser.reloadSession();
  await waitForApp();
}

/** Quit through the application's own quit flow (which saves the session), then start it again. */
export async function quitAndRelaunch() {
  // The process exits during this call, so the WebDriver reply may never arrive.
  await browser.execute(() => void window.desktop.window.quit()).catch(() => {});
  await browser.pause(1_500);
  await restart();
}
