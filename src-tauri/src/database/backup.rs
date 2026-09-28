//! Database backup and restore. Destinations come from trusted code or a native save dialog.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{Connection, OpenFlags};

use super::DATABASE_VERSION;
use crate::error::{AppError, AppResult, ResultExt};

const EXPECTED_TABLES: [&str; 3] = [
    "SELECT id,title,text,revision,createdAt,updatedAt FROM documents LIMIT 0",
    "SELECT id,data FROM jobs LIMIT 0",
    "SELECT id,data FROM windows LIMIT 0",
];

/// Check the schema version, integrity, and table shape of a backup file.
pub fn validate(file: &Path) -> AppResult<()> {
    let database =
        Connection::open_with_flags(file, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
    let version: u32 = database.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version < 1 || version > DATABASE_VERSION {
        return Err(AppError::invalid("Unsupported backup schema version."));
    }
    let check: String = database.pragma_query_value(None, "quick_check", |row| row.get(0))?;
    if check != "ok" {
        return Err(AppError::invalid("Backup integrity check failed."));
    }
    for query in EXPECTED_TABLES {
        database.prepare(query).map_err(|_| AppError::invalid("The backup is missing application tables."))?;
    }
    Ok(())
}

/// Copy a live database to `destination` without blocking writers. Never overwrites an existing file.
pub fn backup(source: &Connection, destination: &Path) -> AppResult<()> {
    let directory = destination.parent().ok_or_else(|| AppError::invalid("Choose a folder for the backup."))?;
    let staging = tempfile::Builder::new()
        .prefix(".database-backup-")
        .tempdir_in(directory)
        .or_app(AppError::storage("Unable to prepare the backup."))?;
    let snapshot = staging.path().join("app.sqlite");
    {
        let mut target = Connection::open(&snapshot)?;
        let backup = rusqlite::backup::Backup::new(source, &mut target)?;
        backup.run_to_completion(256, Duration::from_millis(10), None)?;
    }
    validate(&snapshot)?;
    // Exclusive publication: a hard link fails when a file already exists at the destination.
    fs::hard_link(&snapshot, destination).or_app(AppError::invalid("A file already exists at that location."))?;
    Ok(())
}

/// Replace `target` with `backup`. Offline only: every connection to `target` must be closed.
///
/// The current database files move into an archive directory, which is returned, and move back on failure.
pub fn restore(backup_file: &Path, target: &Path) -> AppResult<PathBuf> {
    let resolved_backup = fs::canonicalize(backup_file).or_app(AppError::not_found("Backup file not found."))?;
    if fs::canonicalize(target).is_ok_and(|resolved| resolved == resolved_backup) {
        return Err(AppError::invalid("Choose a separate backup file."));
    }
    validate(backup_file)?;
    let directory = target.parent().ok_or_else(|| AppError::invalid("Invalid database location."))?;
    let staging = tempfile::Builder::new()
        .prefix(".database-restore-")
        .tempdir_in(directory)
        .or_app(AppError::storage("Unable to prepare the restore."))?;
    let snapshot = staging.path().join("app.sqlite");
    {
        // Materialize a complete snapshot, including committed WAL data in the source.
        let source = Connection::open_with_flags(backup_file, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let mut copy = Connection::open(&snapshot)?;
        rusqlite::backup::Backup::new(&source, &mut copy)?.run_to_completion(256, Duration::ZERO, None)?;
    }
    validate(&snapshot)?;
    let file_name = target.file_name().and_then(|name| name.to_str()).unwrap_or("app.sqlite");
    let archive = tempfile::Builder::new()
        .prefix(&format!("{file_name}.before-restore-"))
        .tempdir_in(directory)
        .or_app(AppError::storage("Unable to archive the current database."))?
        .keep();
    let mut moved = Vec::new();
    let result = (|| -> std::io::Result<()> {
        for suffix in ["", "-wal", "-shm"] {
            let file = PathBuf::from(format!("{}{suffix}", target.display()));
            if !file.exists() {
                continue;
            }
            fs::rename(&file, archive.join(format!("{file_name}{suffix}")))?;
            moved.push(suffix);
        }
        fs::rename(&snapshot, target)
    })();
    if let Err(error) = result {
        for suffix in moved {
            let _ = fs::rename(archive.join(format!("{file_name}{suffix}")), format!("{}{suffix}", target.display()));
        }
        let _ = fs::remove_dir(&archive);
        log::error!("Database restore failed: {error}");
        return Err(AppError::storage("Unable to restore the backup. The current database is unchanged."));
    }
    Ok(archive)
}

#[cfg(test)]
mod tests {
    use super::super::{Database, DocumentInput};
    use super::*;

    fn seeded(path: &Path, title: &str) -> Database {
        let database = Database::open(path).unwrap();
        database.create_document(DocumentInput { title: title.into(), text: "body".into() }).unwrap();
        database
    }

    #[test]
    fn backs_up_without_overwriting() {
        let directory = tempfile::tempdir().unwrap();
        let database = seeded(&directory.path().join("app.sqlite"), "Original");
        let destination = directory.path().join("backup.sqlite");
        database.backup_to(&destination).unwrap();
        validate(&destination).unwrap();
        assert!(database.backup_to(&destination).is_err());
        let names: Vec<_> = fs::read_dir(directory.path()).unwrap().map(|entry| entry.unwrap().file_name()).collect();
        assert!(names.iter().all(|name| !name.to_string_lossy().starts_with(".database-backup-")));
    }

    #[test]
    fn restores_and_archives_the_previous_database() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("app.sqlite");
        let backup_file = directory.path().join("backup.sqlite");
        seeded(&target, "Backed up").backup_to(&backup_file).unwrap();
        let current = Database::open(&target).unwrap();
        current.create_document(DocumentInput { title: "Newer".into(), text: "body".into() }).unwrap();
        current.close().unwrap();

        let archive = restore(&backup_file, &target).unwrap();
        assert!(archive.join("app.sqlite").exists());
        let restored = Database::open(&target).unwrap();
        let titles: Vec<_> = restored.list_documents(0).unwrap().into_iter().map(|document| document.title).collect();
        assert_eq!(titles, ["Backed up"]);
    }

    #[test]
    fn rejects_invalid_backups() {
        let directory = tempfile::tempdir().unwrap();
        let bogus = directory.path().join("bogus.sqlite");
        Connection::open(&bogus)
            .unwrap()
            .execute_batch("CREATE TABLE other (id TEXT); PRAGMA user_version = 1;")
            .unwrap();
        assert!(validate(&bogus).is_err());
        let target = directory.path().join("app.sqlite");
        seeded(&target, "Keep").close().unwrap();
        assert!(restore(&bogus, &target).is_err());
        assert!(restore(&target, &target).is_err());
    }
}
