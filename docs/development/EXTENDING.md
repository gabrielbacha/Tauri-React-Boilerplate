# Extending the app

## Add a command

1. Run `pnpm run scaffold:feature -- recent-items`. It creates `src-tauri/src/features/recent_items.rs` with a validated command and tests, registers the module, and writes `src/features/recent-items/README.md`.
2. Follow that README: add the command to `ipc::builder`, add `allow-recent-items-describe` to `src-tauri/permissions/app-commands.toml`, and run `pnpm run bindings`.
3. Add a group to `DesktopApi` (`src/shared/desktop-api.ts`) and map it in `src/platform/desktop.ts`. Components call `window.desktop.recentItems.describe(...)`.
4. Run `pnpm run check`. `bindings:check` fails if a command lacks a permission or a permission lacks a command.

Keep logic in a plain function and the `#[tauri::command]` thin: check the caller, validate, call the function, broadcast a change.

## Send an event to the interface

Declare a newtype in `src-tauri/src/events.rs`, derive `tauri_specta::Event`, add it to `collect_events!`, and emit it with `.emit(app)` (every window) or `.emit_to(app, label)` (one window). Subscribe in the adapter with `on(events.yourEvent)`.

## Store data

- Preferences: add a field to `AppPreferences` and `PreferencesPatch`, give it a default, and salvage it in `preferences/migrations.rs`. Increment `storage::versions::PREFERENCES` when the stored shape changes.
- Records: add a migration string to `MIGRATIONS` in `database/mod.rs`. Migrations run in one transaction; never edit a released migration.

## Add a page

Add the route to `APP_ROUTES` (`src/shared/routes.ts`) and `ROUTES` (`src-tauri/src/windows/mod.rs`), register it in `src/routes/routes.tsx`, and add a command to the registry in `src-tauri/src/commands_registry.rs` if it needs a shortcut.

## Use a Tauri plugin

Add the crate, register it in `lib.rs`, and call it from a Rust command. Grant a plugin permission to the webview only when the interface must call it directly and the permission can be scoped, as `opener:allow-open-url` is.
