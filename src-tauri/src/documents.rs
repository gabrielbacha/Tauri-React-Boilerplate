//! Text import and export. Paths come only from native dialogs and never reach the webview.

use std::fs::File;
use std::io::Read;
use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::database::{MAX_TEXT_BYTES, validate_text};
use crate::error::{AppError, AppResult};
use crate::storage::atomic;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TextDocument {
    pub display_name: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveTextInput {
    pub suggested_name: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SavedText {
    pub display_name: String,
}

pub fn has_text_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("txt") || extension.eq_ignore_ascii_case("md"))
}

pub fn display_name(path: &Path) -> String {
    path.file_name().map_or_else(|| "Untitled".to_owned(), |name| name.to_string_lossy().into_owned())
}

/// A suggested export name: 1–255 characters, no separators or control characters, `.txt` or `.md`.
pub fn validate_save_input(input: &SaveTextInput) -> AppResult<()> {
    let name = &input.suggested_name;
    let safe = !name.is_empty()
        && name.chars().count() <= 255
        && !name.chars().any(|ch| ch == '/' || ch == '\\' || ch.is_control())
        && has_text_extension(Path::new(name))
        && Path::new(name).file_stem().is_some_and(|stem| !stem.is_empty());
    if !safe {
        return Err(AppError::invalid("Use a file name that ends in .txt or .md."));
    }
    validate_text(&input.content)
}

/// Read at most 40 KB of strict UTF-8 from a regular `.txt` or `.md` file.
pub fn read_text_document(path: &Path) -> AppResult<TextDocument> {
    if !has_text_extension(path) {
        return Err(AppError::invalid("Choose a .txt or .md file."));
    }
    let invalid = || {
        AppError::invalid("Unable to import. Choose valid UTF-8 .txt or .md text, at most 10,000 characters and 40 KB.")
    };
    let file = File::open(path).map_err(|_| invalid())?;
    if !file.metadata().map_err(|_| invalid())?.is_file() {
        return Err(AppError::invalid("Choose a regular text file."));
    }
    let mut buffer = Vec::with_capacity(MAX_TEXT_BYTES + 1);
    file.take(MAX_TEXT_BYTES as u64 + 1).read_to_end(&mut buffer).map_err(|_| invalid())?;
    if buffer.len() > MAX_TEXT_BYTES {
        return Err(AppError::invalid("Text files must be at most 40 KB."));
    }
    let content = String::from_utf8(buffer).map_err(|_| invalid())?;
    validate_text(&content).map_err(|_| invalid())?;
    Ok(TextDocument { display_name: display_name(path), content })
}

pub fn write_text_document(path: &Path, content: &str) -> AppResult<SavedText> {
    if !has_text_extension(path) {
        return Err(AppError::invalid("Use a .txt or .md extension."));
    }
    atomic::write(path, content.as_bytes()).map_err(|error| {
        log::error!("Text export failed: {error}");
        AppError::storage("Unable to export the text file.")
    })?;
    Ok(SavedText { display_name: display_name(path) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_bounded_utf8_text() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("notes.MD");
        std::fs::write(&path, "hello").unwrap();
        assert_eq!(
            read_text_document(&path).unwrap(),
            TextDocument { display_name: "notes.MD".into(), content: "hello".into() }
        );
    }

    #[test]
    fn rejects_wrong_types_large_files_and_invalid_utf8() {
        let directory = tempfile::tempdir().unwrap();
        let binary = directory.path().join("image.png");
        std::fs::write(&binary, "x").unwrap();
        assert!(read_text_document(&binary).is_err());
        let large = directory.path().join("large.txt");
        std::fs::write(&large, "x".repeat(MAX_TEXT_BYTES + 1)).unwrap();
        assert!(read_text_document(&large).is_err());
        let invalid = directory.path().join("invalid.txt");
        std::fs::write(&invalid, [0xff, 0xfe]).unwrap();
        assert!(read_text_document(&invalid).is_err());
        assert!(read_text_document(&directory.path().join("missing.txt")).is_err());
    }

    #[test]
    fn validates_suggested_names() {
        let input = |name: &str| SaveTextInput { suggested_name: name.into(), content: "text".into() };
        assert!(validate_save_input(&input("notes.md")).is_ok());
        for name in ["", ".md", "../notes.md", "a\\b.txt", "notes.exe", "bad\u{7}.txt"] {
            assert!(validate_save_input(&input(name)).is_err(), "{name}");
        }
    }

    #[test]
    fn exports_atomically() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("export.txt");
        assert_eq!(write_text_document(&path, "content").unwrap().display_name, "export.txt");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "content");
        assert!(write_text_document(&directory.path().join("export.sh"), "x").is_err());
    }
}
