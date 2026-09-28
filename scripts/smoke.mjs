// Launch a debug build with a temporary profile and prove the interface starts against the Rust bridge.
// Build first with `pnpm run package`. Native UI behaviour remains manual QA.
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cargoPackageName, isMain, targetDirectory } from "./project.mjs";

const READY = "Window bridge ready";
const FAILURES = /Uncaught interface error|Unhandled interface rejection|not allowed|\[ERROR\]|panicked/;
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 60_000);

export async function binaryPath(root = process.cwd(), env = process.env) {
  const name = cargoPackageName(await readFile(join(root, "src-tauri/Cargo.toml"), "utf8"));
  return join(targetDirectory(root, env), "debug", process.platform === "win32" ? `${name}.exe` : name);
}

export function checkOutput(output) {
  const failure = FAILURES.exec(output);
  if (failure) return `The application logged a failure (${failure[0]}).`;
  if (!output.includes("SQLite storage ready")) return "SQLite storage did not initialize.";
  if (!output.includes(READY)) return "The interface did not connect to the bridge.";
  return null;
}

async function main() {
  const binary = await binaryPath();
  await access(binary).catch(() => {
    throw new Error(`No debug build at ${binary}. Run \`pnpm run package\` first.`);
  });
  const profile = await mkdtemp(join(tmpdir(), "tauri-smoke-"));
  const child = spawn(binary, [], {
    env: { ...process.env, TAURI_APP_PROFILE: join(profile, "profile") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const append = (data) => {
    output = (output + data).slice(-32_000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  try {
    await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${READY}".\n${output}`)), TIMEOUT_MS);
      const poll = setInterval(() => {
        if (!output.includes(READY) && !FAILURES.test(output)) return;
        clearInterval(poll);
        clearTimeout(timer);
        // Give the interface a moment to report errors from its first render.
        setTimeout(done, 3_000);
      }, 200);
      child.once("error", (error) => {
        clearInterval(poll);
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        clearInterval(poll);
        clearTimeout(timer);
        reject(new Error(`The application exited early (${code}).\n${output}`));
      });
    });
    const problem = checkOutput(output);
    if (problem) throw new Error(`${problem}\n${output}`);
    await access(join(profile, "profile", "app.sqlite"));
    console.log("The application started, opened storage, and connected the interface to the bridge.");
  } finally {
    const closed = new Promise((done) => child.once("close", done));
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 3_000);
      await closed;
      clearTimeout(timer);
    }
    await rm(profile, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
