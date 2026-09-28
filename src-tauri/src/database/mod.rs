//! SQLite storage for documents, background jobs, and the window session.

pub mod backup;

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

use crate::app_config::now_iso;
use crate::error::{AppError, AppResult};

pub const DATABASE_VERSION: u32 = 1;
pub const MAX_TEXT_LENGTH: usize = 10_000;
pub const MAX_TEXT_BYTES: usize = 40_000;
const PAGE_SIZE: u32 = 100;
pub const MAX_WINDOWS: usize = 20;

const MIGRATIONS: [&str; 1] = ["
    CREATE TABLE documents (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, revision INTEGER NOT NULL,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE windows (id TEXT PRIMARY KEY, data TEXT NOT NULL);
"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SavedDocument {
    pub id: Uuid,
    pub title: String,
    pub text: String,
    pub revision: u32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: Uuid,
    pub title: String,
    pub revision: u32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Type)]
pub struct DocumentInput {
    pub title: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum DocumentWriteResult {
    Saved { document: SavedDocument },
    Conflict { document: Option<SavedDocument> },
}

/// Text limits shared with the import and export commands.
pub fn validate_text(text: &str) -> AppResult<()> {
    if text.chars().count() > MAX_TEXT_LENGTH || text.len() > MAX_TEXT_BYTES {
        return Err(AppError::invalid("Text must be at most 10,000 characters and 40 KB."));
    }
    Ok(())
}

impl DocumentInput {
    fn validated(self) -> AppResult<Self> {
        let title = self.title.trim().to_owned();
        if title.is_empty() || title.chars().count() > 255 {
            return Err(AppError::invalid("Enter a title of 1–255 characters."));
        }
        validate_text(&self.text)?;
        Ok(Self { title, text: self.text })
    }
}

pub struct Database {
    connection: Mutex<Option<Connection>>,
}

impl Database {
    pub fn open(path: &Path) -> AppResult<Self> {
        let mut connection = Connection::open(path)?;
        migrate(&mut connection)?;
        Ok(Self { connection: Mutex::new(Some(connection)) })
    }

    fn with<T>(&self, action: impl FnOnce(&mut Connection) -> rusqlite::Result<T>) -> AppResult<T> {
        let mut guard = self.connection.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let connection = guard.as_mut().ok_or_else(|| AppError::unavailable("Storage is closed."))?;
        Ok(action(connection)?)
    }

    pub fn list_documents(&self, offset: u32) -> AppResult<Vec<DocumentSummary>> {
        self.with(|db| {
            db.prepare(
                "SELECT id,title,revision,createdAt,updatedAt FROM documents ORDER BY updatedAt DESC, id LIMIT ?1 OFFSET ?2",
            )?
            .query_map(params![PAGE_SIZE, offset], |row| {
                Ok(DocumentSummary {
                    id: parse_id(row.get(0)?)?,
                    title: row.get(1)?,
                    revision: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })?
            .collect()
        })
    }

    pub fn get_document(&self, id: Uuid) -> AppResult<Option<SavedDocument>> {
        self.with(|db| get_document(db, id))
    }

    pub fn create_document(&self, input: DocumentInput) -> AppResult<SavedDocument> {
        let DocumentInput { title, text } = input.validated()?;
        let now = now_iso();
        let document =
            SavedDocument { id: Uuid::new_v4(), title, text, revision: 1, created_at: now.clone(), updated_at: now };
        self.with(|db| {
            db.execute(
                "INSERT INTO documents VALUES (?1,?2,?3,?4,?5,?6)",
                params![
                    document.id.to_string(),
                    document.title,
                    document.text,
                    document.revision,
                    document.created_at,
                    document.updated_at
                ],
            )
        })?;
        Ok(document)
    }

    /// Save only when `revision` is current. Otherwise return the stored document as a conflict.
    pub fn save_document(&self, id: Uuid, revision: u32, input: DocumentInput) -> AppResult<DocumentWriteResult> {
        let DocumentInput { title, text } = input.validated()?;
        self.with(|db| {
            let transaction = db.transaction()?;
            let changed = transaction.execute(
                "UPDATE documents SET title=?1, text=?2, revision=revision+1, updatedAt=?3 WHERE id=?4 AND revision=?5",
                params![title, text, now_iso(), id.to_string(), revision],
            )?;
            let document = get_document(&transaction, id)?;
            transaction.commit()?;
            Ok(match document {
                Some(document) if changed > 0 => DocumentWriteResult::Saved { document },
                document => DocumentWriteResult::Conflict { document },
            })
        })
    }

    pub fn delete_document(&self, id: Uuid, revision: u32) -> AppResult<bool> {
        self.with(|db| {
            Ok(db.execute("DELETE FROM documents WHERE id=?1 AND revision=?2", params![id.to_string(), revision])? > 0)
        })
    }

    pub fn load_jobs(&self) -> AppResult<Vec<String>> {
        self.load_rows("SELECT data FROM jobs ORDER BY rowid LIMIT 100")
    }

    /// Replace every job row in one transaction.
    pub fn save_jobs(&self, jobs: &[(Uuid, String)]) -> AppResult<()> {
        self.replace_rows("jobs", jobs)
    }

    pub fn load_windows(&self) -> AppResult<Vec<String>> {
        self.load_rows("SELECT data FROM windows ORDER BY rowid LIMIT 20")
    }

    pub fn save_windows(&self, windows: &[(Uuid, String)]) -> AppResult<()> {
        if windows.len() > MAX_WINDOWS {
            return Err(AppError::invalid("Too many windows to save."));
        }
        self.replace_rows("windows", windows)
    }

    fn load_rows(&self, query: &str) -> AppResult<Vec<String>> {
        self.with(|db| db.prepare(query)?.query_map([], |row| row.get(0))?.collect())
    }

    fn replace_rows(&self, table: &'static str, rows: &[(Uuid, String)]) -> AppResult<()> {
        self.with(|db| {
            let transaction = db.transaction()?;
            transaction.execute(&format!("DELETE FROM {table}"), [])?;
            {
                let mut insert = transaction.prepare(&format!("INSERT INTO {table} VALUES (?1,?2)"))?;
                for (id, data) in rows {
                    insert.execute(params![id.to_string(), data])?;
                }
            }
            transaction.commit()
        })
    }

    /// Online backup to a new file. See [`backup::backup`].
    pub fn backup_to(&self, destination: &Path) -> AppResult<()> {
        let guard = self.connection.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let connection = guard.as_ref().ok_or_else(|| AppError::unavailable("Storage is closed."))?;
        backup::backup(connection, destination)
    }

    /// Close the connection. Later calls fail with `Storage is closed.`
    pub fn close(&self) -> AppResult<()> {
        let connection = self.connection.lock().unwrap_or_else(std::sync::PoisonError::into_inner).take();
        if let Some(connection) = connection {
            connection.close().map_err(|(_, error)| AppError::from(error))?;
        }
        Ok(())
    }
}

fn get_document(db: &Connection, id: Uuid) -> rusqlite::Result<Option<SavedDocument>> {
    db.query_row(
        "SELECT id,title,text,revision,createdAt,updatedAt FROM documents WHERE id=?1",
        params![id.to_string()],
        |row| {
            Ok(SavedDocument {
                id: parse_id(row.get(0)?)?,
                title: row.get(1)?,
                text: row.get(2)?,
                revision: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )
    .optional()
}

fn parse_id(value: String) -> rusqlite::Result<Uuid> {
    Uuid::parse_str(&value)
        .map_err(|error| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error)))
}

/// Apply pending migrations in one transaction. A database from a newer version is never modified.
fn migrate(connection: &mut Connection) -> AppResult<()> {
    let version: u32 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version > DATABASE_VERSION {
        return Err(AppError::storage("The database requires a newer application version."));
    }
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "synchronous", "FULL")?;
    let transaction = connection.transaction()?;
    for (index, migration) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        transaction.execute_batch(migration)?;
        transaction.pragma_update(None, "user_version", u32::try_from(index + 1).unwrap_or(u32::MAX))?;
    }
    transaction.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open() -> (tempfile::TempDir, Database) {
        let directory = tempfile::tempdir().unwrap();
        let database = Database::open(&directory.path().join("app.sqlite")).unwrap();
        (directory, database)
    }

    fn input(title: &str, text: &str) -> DocumentInput {
        DocumentInput { title: title.into(), text: text.into() }
    }

    #[test]
    fn applies_pragmas_and_migrations() {
        let (directory, database) = open();
        database.close().unwrap();
        let connection = Connection::open(directory.path().join("app.sqlite")).unwrap();
        let mode: String = connection.pragma_query_value(None, "journal_mode", |row| row.get(0)).unwrap();
        let version: u32 = connection.pragma_query_value(None, "user_version", |row| row.get(0)).unwrap();
        assert_eq!((mode.as_str(), version), ("wal", DATABASE_VERSION));
    }

    #[test]
    fn refuses_newer_databases() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("app.sqlite");
        Connection::open(&path).unwrap().pragma_update(None, "user_version", 99).unwrap();
        assert!(Database::open(&path).is_err());
    }

    #[test]
    fn saves_with_optimistic_revisions() {
        let (_directory, database) = open();
        let created = database.create_document(input("  Notes  ", "one")).unwrap();
        assert_eq!(created.title, "Notes");
        let DocumentWriteResult::Saved { document } =
            database.save_document(created.id, 1, input("Notes", "two")).unwrap()
        else {
            panic!("the current revision saves")
        };
        assert_eq!(document.revision, 2);
        let DocumentWriteResult::Conflict { document: Some(latest) } =
            database.save_document(created.id, 1, input("Notes", "stale")).unwrap()
        else {
            panic!("a stale revision conflicts")
        };
        assert_eq!(latest.text, "two");
        assert!(!database.delete_document(created.id, 1).unwrap());
        assert!(database.delete_document(created.id, 2).unwrap());
        assert!(matches!(
            database.save_document(created.id, 2, input("Notes", "gone")).unwrap(),
            DocumentWriteResult::Conflict { document: None }
        ));
    }

    #[test]
    fn validates_document_input() {
        let (_directory, database) = open();
        assert!(database.create_document(input("   ", "text")).is_err());
        assert!(database.create_document(input("Big", &"x".repeat(MAX_TEXT_LENGTH + 1))).is_err());
        // 10,000 four-byte characters is exactly 40 KB, the largest valid document.
        assert!(database.create_document(input("Wide", &"😀".repeat(MAX_TEXT_LENGTH))).is_ok());
    }

    #[test]
    fn replaces_job_and_window_rows() {
        let (_directory, database) = open();
        let id = Uuid::new_v4();
        database.save_jobs(&[(id, "{\"a\":1}".into())]).unwrap();
        database.save_jobs(&[(Uuid::new_v4(), "{\"b\":2}".into())]).unwrap();
        assert_eq!(database.load_jobs().unwrap(), ["{\"b\":2}"]);
        let too_many: Vec<_> = (0..21).map(|_| (Uuid::new_v4(), "{}".to_owned())).collect();
        assert!(database.save_windows(&too_many).is_err());
    }

    #[test]
    fn closed_database_rejects_calls() {
        let (_directory, database) = open();
        database.close().unwrap();
        assert!(matches!(database.list_documents(0), Err(AppError::Unavailable(_))));
    }
}
