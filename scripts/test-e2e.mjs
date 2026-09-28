// Build a debug binary and run the WebdriverIO suite through tauri-driver.
//   pnpm run test:e2e           Linux (under a display server, for example xvfb-run) or Windows
//   pnpm run test:e2e:docker    any computer with Docker; runs the Linux suite in a container
import { spawnSync } from "node:child_process";

import { ROOT, run } from "./project.mjs";

const docker = process.argv.includes("--docker");

if (docker) {
  const image = "tauri-app-e2e";
  run("docker", ["build", "--tag", image, "--file", "tests/e2e/Dockerfile", "tests/e2e"]);
  run("docker", [
    "run",
    "--rm",
    "--volume",
    `${ROOT}:/app`,
    // Linux dependencies and build output live in volumes, apart from the host's.
    "--volume",
    "tauri-app-e2e-node-modules:/app/node_modules",
    "--volume",
    "tauri-app-e2e-target:/app/src-tauri/target",
    image,
  ]);
} else {
  if (process.platform === "darwin")
    throw new Error("tauri-driver does not support macOS. Run pnpm run test:e2e:docker, or rely on CI.");
  const driver = spawnSync("tauri-driver", ["--help"], { stdio: "ignore" });
  if (driver.error) throw new Error("Install tauri-driver first: cargo install tauri-driver --locked");
  run("pnpm", ["tauri", "build", "--debug", "--no-bundle"]);
  run("pnpm", ["exec", "wdio", "run", "tests/e2e/wdio.conf.mjs"]);
}
