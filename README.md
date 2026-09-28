# Tauri App Starter

A production foundation for desktop applications with Tauri 2, a typed Rust backend, React, TypeScript, Tailwind CSS, and TanStack Router. It is the Tauri counterpart of the [Electron starter](https://github.com/gabrielbacha/Electron-Builder-GB-Boilerplate): the same interface, features, and release contract, with a small binary and deny-by-default capabilities.

## Start here

Requirements: Node.js 24, pnpm 12, and Rust (the version in `src-tauri/rust-toolchain.toml` installs itself). Linux also needs the [Tauri system packages](https://v2.tauri.app/start/prerequisites/).

```bash
pnpm install
pnpm run setup
pnpm dev
```

For a renamed starter with explicit identity and an updater key:

```bash
pnpm run setup --name "My App" --app-id com.example.myapp --repo owner/my-app --variant clean --updater-key ~/.tauri/my-app.key
```

Setup writes the product name, package name, application ID, URL protocol, repository, variant, and updater key to `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, the capability, and `index.html`, or restores them all if a write fails. It then installs dependencies and regenerates the bindings. Treat the application ID as permanent once released. Replace the icons with `pnpm tauri icon <your-icon.png>`. Run `pnpm run verify:config` to check the result.

## Commands

| Command                               | Purpose                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`                            | Start the app with interface hot reload                                     |
| `pnpm run check`                      | Lint, format check, typecheck, unit and script tests, Rust checks, bindings |
| `pnpm run fix`                        | Apply lint and format fixes (Oxlint, Oxfmt, rustfmt)                        |
| `pnpm run bindings`                   | Regenerate `src/shared/bindings.ts` from the Rust commands                  |
| `pnpm run package`                    | Build and verify a debug app without installers                             |
| `pnpm run smoke`                      | Launch that build with a temporary profile and check it starts cleanly      |
| `pnpm run make`                       | Build installers for this computer into `dist/release-input/`               |
| `pnpm run release`                    | Validate, build, and assemble a local release; add `--publish` to upload    |
| `pnpm run test:e2e`                   | WebdriverIO tests through tauri-driver (Linux, Windows)                     |
| `pnpm run test:e2e:docker`            | The Linux end-to-end suite in Docker, from any computer                     |
| `pnpm run test:template`              | Rename both variants in temporary copies, then check, build, and launch     |
| `pnpm run verify:config`              | Check identity, links, icons, and release prerequisites                     |
| `pnpm run scaffold:feature -- <name>` | Create a Rust command with tests and wiring steps                           |

## Architecture

- `src-tauri/src/` owns windows, storage, updates, dialogs, and every privileged operation. `lib.rs` only wires plugins and events; `application.rs` holds startup, windows, deep links, and the quit flow.
- `src-tauri/src/ipc.rs` lists every command and event. tauri-specta exports them to `src/shared/bindings.ts`; the compiler and `pnpm run bindings:check` keep both sides in step.
- `src/platform/desktop.ts` adapts the bindings to one `window.desktop` API, so interface code never calls `invoke` directly.
- `src/shared/` holds types from the bindings and pure helpers. `src/` otherwise is an ordinary React application.

The command registry (labels and default shortcuts) lives in Rust and is exported to TypeScript, so the macOS menu, toolbar, command palette, and shortcut settings always agree. On Windows and Linux the windows are frameless: the in-window app menu and a keyboard handler replace the native menu.

### Features

- Saved documents in SQLite with revision checks. Concurrent edits in two windows keep your draft and offer a reload or a copy.
- UTF-8 `.txt`/`.md` import up to 10,000 characters and 40 KB, and atomic export.
- A background queue (2 running, 10 waiting, 20 kept) with progress, cancel, retry, and recovery of interrupted work after a restart, up to three attempts. The SHA-256 example never exposes the file path.
- Quit, update restart, and window close ask first when work is unsaved or running, in the window or through a native dialog.
- Typed deep links (`<protocol>://open/home`, `/settings`, `/tasks/<uuid>`) through the deep-link and single-instance plugins.
- Deny-by-default permissions for notifications, camera, and microphone, with session or remembered decisions.
- Versioned preferences with field-by-field migration, recordable shortcuts with conflict and reserved-key checks, zoom, motion, and theme.
- Multiple windows (up to 20) with optional restore of layouts and open documents.
- Sanitized diagnostics, copy report, open logs, reload, and reset preferences.
- A development-only debug panel (Cmd/Ctrl+D) that shows every command with its duration and result, runtime events, window state, and console output.

Choose `--variant clean` for an empty workspace. The clean variant does not grant the example commands to the webview.

## Storage and recovery

Data lives in `<appData>/<appId>` (`<appId>.development` for development builds), with logs in `logs/`. Before any store opens, startup proves the folder is writable, refuses settings or a database from a newer version, and renames unreadable settings to `.corrupt-…` beside the original instead of deleting them. Migrations run in one transaction. Debug builds accept `TAURI_APP_PROFILE` for test profiles; release builds ignore it. See [database backup and restore](docs/recipes/database-backup.md) and [secret storage](docs/recipes/secret-storage.md).

## Distribution

Pushing a `vX.Y.Z` tag runs the release workflow. The tag must match `package.json`. Quality checks, the Linux smoke test, and end-to-end tests run first; then macOS (Apple silicon and Intel), Windows x64, and Linux x64 build in parallel. The publish job checks every artifact name, version, and signature, writes the updater feed `latest.json` and `SHA256SUMS.txt`, and creates the GitHub release. Artifact names use the package name and never contain spaces, so update URLs stay valid.

Only builds signed with the updater key include updater archives; others ship installers only. Local releases run the same assembly into `dist/release/`. A `GH_TOKEN` alone never publishes; pass `--publish`.

### Signing environment

| Variable                                                                    | Purpose                                                                                                                    |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`           | Updater signatures (required for update feeds)                                                                             |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` | macOS code signing                                                                                                         |
| `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_KEY_PATH`                   | macOS notarization. In Actions, store the base64 `.p8` as the `APPLE_API_KEY` secret and the key ID as `APPLE_API_KEY_ID`. |

Windows code signing uses `bundle.windows.signCommand` or a certificate thumbprint in `tauri.conf.json`. Development builds need no credentials.

## Security defaults

Strict CSP, frozen prototypes, no global Tauri object, deny-by-default app commands, plugin access only from Rust, blocked navigation and new windows, typed deep links, and signed updates. Read [SECURITY.md](SECURITY.md) before adding commands, permissions, or remote content.

## Verification

CI runs when started manually in GitHub Actions. It runs `pnpm run check`, configuration checks, a debug build, the smoke test, and the end-to-end suite under Xvfb on Linux, plus build and smoke tests on macOS and Windows. The `template` option also renames and verifies both variants.

tauri-driver does not support macOS, so macOS interaction stays manual QA; see the [QA checklist](docs/development/QA.md). See [extending the app](docs/development/EXTENDING.md) and [upgrading](docs/development/UPGRADING.md).
