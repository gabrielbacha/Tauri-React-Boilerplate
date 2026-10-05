// Create an isolated feature: a Rust command with validation and tests, plus the steps to expose it.
//   pnpm run scaffold:feature -- <kebab-name>
import fs from "node:fs";
import { join } from "node:path";

import { ROOT, isMain } from "./project.mjs";

const RUST_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "const",
  "continue",
  "crate",
  "dyn",
  "else",
  "enum",
  "extern",
  "false",
  "fn",
  "for",
  "if",
  "impl",
  "in",
  "let",
  "loop",
  "match",
  "mod",
  "move",
  "mut",
  "pub",
  "ref",
  "return",
  "self",
  "static",
  "struct",
  "super",
  "trait",
  "true",
  "type",
  "unsafe",
  "use",
  "where",
  "while",
  "abstract",
  "become",
  "box",
  "do",
  "final",
  "gen",
  "macro",
  "override",
  "priv",
  "try",
  "typeof",
  "unsized",
  "virtual",
  "yield",
]);

export function featureNames(name) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name ?? "") || name.length > 48)
    throw new Error("Use a lowercase kebab-case feature name (up to 48 characters).");
  const snake = name.replaceAll("-", "_");
  if (RUST_KEYWORDS.has(snake)) throw new Error(`"${name}" is a Rust keyword. Choose another name.`);
  const pascal = name
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
  return { snake, pascal, camel: pascal[0].toLowerCase() + pascal.slice(1) };
}

export function scaffoldFeature(root, name) {
  const { snake, pascal, camel } = featureNames(name);
  const rustFile = join(root, "src-tauri/src/features", `${snake}.rs`);
  const guideDirectory = join(root, "src/features", name);
  const modFile = join(root, "src-tauri/src/features/mod.rs");
  const moduleSource = fs.readFileSync(modFile, "utf8");
  if (new RegExp(`^pub mod ${snake};$`, "m").test(moduleSource)) throw new Error(`Feature ${name} already exists.`);

  const rust = `//! The \`${pascal}\` feature. Follow \`src/features/${name}/README.md\` to expose it to the interface.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{State, WebviewWindow};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ${pascal}Input {
    pub label: String,
}

#[derive(Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ${pascal}Result {
    pub message: String,
}

/// The feature logic, independent of Tauri so it can be tested directly.
pub fn describe(input: ${pascal}Input) -> AppResult<${pascal}Result> {
    let label = input.label.trim();
    if label.is_empty() || label.chars().count() > 80 {
        return Err(AppError::invalid("Enter a label of 1–80 characters."));
    }
    Ok(${pascal}Result { message: label.to_owned() })
}

/// Only windows this process created may call the command.
#[tauri::command]
#[specta::specta]
pub fn ${snake}_describe(state: State<'_, AppState>, window: WebviewWindow, input: ${pascal}Input) -> AppResult<${pascal}Result> {
    state.caller(&window)?;
    describe(input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_the_label() {
        let input = |label: &str| ${pascal}Input { label: label.into() };
        assert_eq!(describe(input("  hello  ")).unwrap(), ${pascal}Result { message: "hello".into() });
        assert!(describe(input("   ")).is_err());
        assert!(describe(input(&"x".repeat(81))).is_err());
    }

    #[test]
    fn rejects_unknown_fields() {
        assert!(serde_json::from_str::<${pascal}Input>(r#"{"label":"a","path":"/private"}"#).is_err());
    }
}
`;
  const guide = `# ${pascal}

\`src-tauri/src/features/${snake}.rs\` compiles and runs its tests, but the interface cannot call it yet.

1. Add \`crate::features::${snake}::${snake}_describe\` to \`collect_commands!\` in \`src-tauri/src/ipc.rs\`.
2. Add \`"allow-${name}-describe"\` to the \`app-commands\` set in \`src-tauri/permissions/app-commands.toml\`.
3. Run \`pnpm run bindings\`. \`commands.${camel}Describe({ label })\` appears in \`src/shared/bindings.ts\`.
4. Add a \`${camel}\` group to \`DesktopApi\` in \`src/shared/desktop-api.ts\` and map it in \`src/platform/desktop.ts\`.
5. Replace the bounded example with product behaviour. Keep the \`state.caller\` check and input validation in Rust.
6. Call \`window.desktop.${camel}.describe({ label: "Hello" })\` through the existing async feedback hook.

Run \`pnpm run fix\` and \`pnpm run check\`.
`;
  fs.mkdirSync(join(root, "src/features"), { recursive: true });
  let createdDirectory = false;
  let createdRust = false;
  let modifiedModule = false;
  try {
    fs.mkdirSync(guideDirectory); // Exclusive: never replace or merge an existing feature.
    createdDirectory = true;
    const descriptor = fs.openSync(rustFile, "wx");
    createdRust = true;
    try {
      fs.writeFileSync(descriptor, rust);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.writeFileSync(join(guideDirectory, "README.md"), guide, { flag: "wx" });
    modifiedModule = true;
    fs.writeFileSync(modFile, `${moduleSource.trimEnd()}\n\npub mod ${snake};\n`);
  } catch (error) {
    const failures = [error];
    const rollback = (action) => {
      try {
        action();
      } catch (failure) {
        failures.push(failure);
      }
    };
    if (createdDirectory) rollback(() => fs.rmSync(guideDirectory, { recursive: true, force: true }));
    if (createdRust) rollback(() => fs.rmSync(rustFile, { force: true }));
    if (modifiedModule) rollback(() => fs.writeFileSync(modFile, moduleSource));
    if (failures.length > 1)
      throw new AggregateError(failures, "Feature creation and rollback failed.", { cause: error });
    throw error;
  }
  return { rustFile, guide: join(guideDirectory, "README.md") };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length !== 1) throw new Error("Usage: pnpm run scaffold:feature -- <name>");
  const { rustFile, guide } = scaffoldFeature(ROOT, args[0]);
  console.log(`Created ${rustFile}. Follow ${guide} to expose it, then run pnpm run fix and pnpm run check.`);
}
