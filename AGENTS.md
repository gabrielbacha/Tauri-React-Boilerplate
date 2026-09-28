# Repository Guidelines

## Project Structure & Module Organization

Tauri 2 desktop application with a Rust backend and a React + TypeScript interface. `src-tauri/src/lib.rs` wires plugins and events; `application.rs` owns startup, windows, deep links, and the quit flow; each service (`preferences/`, `database/`, `tasks/`, `permissions.rs`, `updater.rs`, …) is plain Rust with tests. `src-tauri/src/ipc.rs` lists every command and event, and tauri-specta generates `src/shared/bindings.ts` (never edit it). `src/platform/desktop.ts` adapts the bindings to `window.desktop`. Interface code lives in `src/` (components, layouts, routes, pages, hooks, styles). Build settings: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `vite.config.ts`, `vitest.config.ts`. The web bundle goes to `dist/`; Rust output to `src-tauri/target/`.

## Build, Test, and Development Commands

- `pnpm dev` — Tauri dev with Vite hot reload.
- `pnpm run check` — Oxlint, Oxfmt check, tsc, Vitest, script tests, rustfmt, clippy (`-D warnings`), cargo test, bindings check.
- `pnpm run fix` — Oxlint and Oxfmt fixes plus rustfmt.
- `pnpm run bindings` — regenerate `src/shared/bindings.ts` after changing commands or their types.
- `pnpm run package` then `pnpm run smoke` — debug build and a clean-launch check.
- `pnpm run make` / `pnpm run release` — installers and a verified release.
- `pnpm run test:e2e:docker` — the Linux WebdriverIO suite in Docker.

## Coding Style & Naming Conventions

TypeScript: explicit return types on exported APIs; two-space indentation, double quotes, trailing commas, sorted imports and Tailwind classes, 120-character lines (Oxfmt). Components and layouts `PascalCase`, hooks `useX`, helpers `camelCase`, constants `SCREAMING_SNAKE_CASE`. Rust: edition 2024, rustfmt at 120 columns, clippy pedantic with warnings as errors, no `unwrap`/`expect` outside tests, no `unsafe`. Commands are `group_method` in snake_case; errors are `AppError` with user-facing messages.

## Testing & QA Guidelines

Put Rust tests beside the logic in `#[cfg(test)]` modules, Vitest tests beside interface code (`*.test.ts[x]`, jsdom per file), and script tests as `scripts/*.test.mjs`. Mock the bridge with `window.desktop` or `@tauri-apps/api/mocks`. Do manual QA for native behavior: menus, dialogs, deep links, signing, and updates.

## Commit & Pull Request Guidelines

Conventional Commits with imperative subjects of 72 characters or fewer. Describe behavior changes and QA in the body. Pull requests include a summary, screenshots for interface changes, and the result of `pnpm run check`.

## Release & Security Notes

Keep credentials out of source control; pass signing secrets through CI. Add privileged behavior as a Rust command with validated input, list its permission in `src-tauri/permissions/app-commands.toml`, and never grant a plugin to the webview directly. Keep the CSP, `withGlobalTauri: false`, and the navigation guard. Before tagging, run `pnpm run check`, `node scripts/verify-config.mjs --strict`, and a smoke test of each platform. See `SECURITY.md` and `README.md`.
