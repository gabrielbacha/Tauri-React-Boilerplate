# Database backup and restore

`src-tauri/src/database/backup.rs` provides both operations. Neither is exposed to the interface by default; add a command when your product needs one.

## Backup (online)

`Database::backup_to(destination)` copies the live database with SQLite's online backup API, so writers are not blocked and committed WAL data is included.

1. The snapshot is written to a staging folder beside the destination.
2. `validate` checks the schema version, runs `PRAGMA quick_check`, and confirms the application tables exist.
3. The snapshot is published with a hard link, which fails if a file already exists. A backup never overwrites a file.

Take the destination from a native save dialog in Rust. Never accept a path from the webview.

```rust
#[tauri::command]
#[specta::specta]
pub async fn database_backup(app: AppHandle, state: State<'_, AppState>, window: WebviewWindow) -> AppResult<bool> {
    state.caller(&window)?;
    let Some(path) = dialogs::save_file(&app, &window, "Back up data", "backup.sqlite", ("SQLite", &["sqlite"])).await else {
        return Ok(false);
    };
    state.database.backup_to(&path)?;
    Ok(true)
}
```

## Restore (offline)

`backup::restore(backup, target)` replaces the database only while no connection is open.

1. The backup is validated, then copied into a complete snapshot (including its WAL data).
2. The current `app.sqlite`, `-wal`, and `-shm` files move into an archive folder beside them, which is returned.
3. The snapshot moves into place. If any step fails, the moved files return and the current database is unchanged.

Run a restore at startup, before `Database::open`, or after `Database::close` followed by a restart. A backup from a newer schema version is refused.
