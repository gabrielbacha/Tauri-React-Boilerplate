//! Database backup and restore. Destinations come from trusted code or a native save dialog.

use std::fs;
use std::io::Write;
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
    if !(1..=DATABASE_VERSION).contains(&version) {
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RecoveryState {
    pub archive: PathBuf,
    pub moved: Vec<String>,
    pub unresolved: Vec<String>,
}
#[derive(Debug, thiserror::Error)]
pub enum RestoreError {
    #[error(transparent)]
    Failure(#[from] AppError),
    #[error("Database recovery is required; retain the archived original files.")]
    RecoveryRequired { cause: AppError, recovery: RecoveryState },
}
fn restore_marker(target: &Path) -> PathBuf {
    PathBuf::from(format!("{}.restore-in-progress.json", target.display()))
}
/// Offline only. The archive and marker are trusted recovery metadata; never expose their paths through IPC.
pub fn restore(backup_file: &Path, target: &Path) -> Result<PathBuf, RestoreError> {
    restore_with(backup_file, target, |source, destination| fs::rename(source, destination))
}
fn restore_with(
    backup_file: &Path,
    target: &Path,
    mut move_file: impl FnMut(&Path, &Path) -> std::io::Result<()>,
) -> Result<PathBuf, RestoreError> {
    let prepared = (|| -> AppResult<_> {
        let resolved = fs::canonicalize(backup_file).or_app(AppError::not_found("Backup file not found."))?;
        if fs::canonicalize(target).is_ok_and(|path| path == resolved) {
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
            let source = Connection::open_with_flags(backup_file, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            let mut copy = Connection::open(&snapshot)?;
            rusqlite::backup::Backup::new(&source, &mut copy)?.run_to_completion(256, Duration::ZERO, None)?;
        }
        validate(&snapshot)?;
        let archive = tempfile::Builder::new()
            .prefix(".database-before-restore-")
            .tempdir_in(directory)
            .or_app(AppError::storage("Unable to archive the current database."))?
            .keep();
        Ok((staging, snapshot, archive))
    })()?;
    let (_staging, snapshot, archive) = prepared;
    let marker = restore_marker(target);
    let mut recovery = RecoveryState { archive, moved: Vec::new(), unresolved: Vec::new() };
    // Exclusive marker prevents a concurrent restore from removing another operation's recovery fence.
    let mut receipt = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&marker)
        .or_app(AppError::storage("A restore is already pending or storage is unavailable."))?;
    receipt
        .write_all(&serde_json::to_vec(&recovery).map_err(|error| AppError::internal(error.to_string()))?)
        .or_app(AppError::storage("Unable to record restore intent."))?;
    receipt.sync_all().or_app(AppError::storage("Unable to save restore intent."))?;
    drop(receipt);
    let file_name = target.file_name().ok_or_else(|| AppError::invalid("Invalid database filename."))?;
    let result = (|| -> std::io::Result<()> {
        for suffix in ["", "-wal", "-shm"] {
            let file = PathBuf::from(format!("{}{suffix}", target.display()));
            match fs::metadata(&file) {
                Ok(_) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error),
            }
            let mut name = file_name.to_os_string();
            name.push(suffix);
            move_file(&file, &recovery.archive.join(name))?;
            recovery.moved.push(suffix.into());
            crate::storage::atomic::write(&marker, &serde_json::to_vec(&recovery).map_err(std::io::Error::other)?)?;
        }
        move_file(&snapshot, target)
    })();
    let result = result
        .map_err(|error| {
            log::error!("Database restore failed: {error}");
            AppError::storage("Unable to publish the restored database.")
        })
        .and_then(|()| validate(target));
    if let Err(cause) = result {
        for suffix in &recovery.moved {
            let mut name = file_name.to_os_string();
            name.push(suffix);
            if let Err(error) =
                move_file(&recovery.archive.join(name), &PathBuf::from(format!("{}{suffix}", target.display())))
            {
                log::error!("Database rollback failed: {error}");
                recovery.unresolved.push(suffix.clone());
            }
        }
        if recovery.unresolved.is_empty() && recovery.moved.iter().any(String::is_empty) && validate(target).is_err() {
            recovery.unresolved.push("validation".into());
        }
        if !recovery.unresolved.is_empty() {
            if let Ok(bytes) = serde_json::to_vec(&recovery) {
                let _ = crate::storage::atomic::write(&marker, &bytes);
            }
            return Err(RestoreError::RecoveryRequired { cause, recovery });
        }
        fs::remove_file(&marker)
            .or_app(AppError::storage("Original files restored; restore marker needs recovery."))?;
        let _ = fs::remove_dir(&recovery.archive);
        return Err(RestoreError::Failure(cause));
    }
    fs::remove_file(&marker).or_app(AppError::storage("Database restored; restore marker needs recovery."))?;
    Ok(recovery.archive)
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

#[cfg(test)]
mod failure_tests {
    use super::*;
    use crate::database::{Database, DocumentInput};
    fn fixture() -> (tempfile::TempDir, PathBuf, PathBuf, Vec<u8>) {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("app.sqlite");
        let backup_file = directory.path().join("backup.sqlite");
        let database = Database::open(&target).unwrap();
        database.create_document(DocumentInput { title: "original".into(), text: "keep".into() }).unwrap();
        database.backup_to(&backup_file).unwrap();
        database.close().unwrap();
        for suffix in ["-wal", "-shm"] {
            fs::write(format!("{}{suffix}", target.display()), []).unwrap();
        }
        let bytes = fs::read(&target).unwrap();
        (directory, target, backup_file, bytes)
    }
    #[test]
    fn every_forward_failure_restores_the_original_file_set() {
        for fail in 0..4 {
            let (_directory, target, backup_file, bytes) = fixture();
            let mut calls = 0;
            let result = restore_with(&backup_file, &target, |source, destination| {
                let current = calls;
                calls += 1;
                if current == fail {
                    Err(std::io::Error::other("forward failure"))
                } else {
                    fs::rename(source, destination)
                }
            });
            assert!(result.is_err());
            assert_eq!(fs::read(&target).unwrap(), bytes);
            assert!(!restore_marker(&target).exists());
        }
    }
    #[test]
    fn every_failed_rollback_is_reported_and_remaining_restores_are_attempted() {
        for fail in 0..3 {
            let (_directory, target, backup_file, _bytes) = fixture();
            let mut calls = 0;
            let result = restore_with(&backup_file, &target, |source, destination| {
                let current = calls;
                calls += 1;
                if current == 3 || current == 4 + fail {
                    Err(std::io::Error::other("injected move failure"))
                } else {
                    fs::rename(source, destination)
                }
            });
            let Err(RestoreError::RecoveryRequired { recovery, .. }) = result else {
                panic!("explicit recovery state required");
            };
            assert_eq!(calls, 7);
            assert_eq!(recovery.unresolved.len(), 1);
            assert!(recovery.archive.exists());
            assert!(restore_marker(&target).exists());
            assert!(Database::open(&target).is_err());
        }
    }
    #[test]
    fn an_existing_operation_marker_and_original_bytes_are_never_replaced() {
        let (_directory, target, backup_file, bytes) = fixture();
        let marker = restore_marker(&target);
        fs::write(&marker, b"another operation").unwrap();
        assert!(restore(&backup_file, &target).is_err());
        assert_eq!(fs::read(&marker).unwrap(), b"another operation");
        assert_eq!(fs::read(&target).unwrap(), bytes);
    }
}
