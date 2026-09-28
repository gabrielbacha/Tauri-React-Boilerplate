use serde::Serialize;
use specta::Type;

/// Error returned to the webview.
///
/// Messages are user-facing. Never put file-system paths, SQL, or raw OS errors in them; log those instead.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, Serialize, Type)]
#[serde(tag = "kind", content = "message", rename_all = "kebab-case")]
pub enum AppError {
    /// The request was well-formed but not acceptable (validation, limits, wrong state).
    #[error("{0}")]
    Invalid(String),
    #[error("{0}")]
    NotFound(String),
    /// A dependency such as the updater, a dialog, or the clipboard is not available.
    #[error("{0}")]
    Unavailable(String),
    #[error("{0}")]
    Storage(String),
    #[error("{0}")]
    Internal(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::Invalid(message.into())
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound(message.into())
    }

    pub fn unavailable(message: impl Into<String>) -> Self {
        Self::Unavailable(message.into())
    }

    pub fn storage(message: impl Into<String>) -> Self {
        Self::Storage(message.into())
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal(message.into())
    }
}

/// Log the underlying cause and replace it with a user-facing error.
pub trait ResultExt<T> {
    fn or_app(self, error: AppError) -> AppResult<T>;
}

impl<T, E: std::fmt::Display> ResultExt<T> for Result<T, E> {
    fn or_app(self, error: AppError) -> AppResult<T> {
        self.map_err(|cause| {
            log::error!("{error}: {cause}");
            error
        })
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(cause: rusqlite::Error) -> Self {
        log::error!("SQLite error: {cause}");
        Self::storage("Storage is unavailable. Free disk space or fix folder permissions, then retry.")
    }
}

impl From<tauri::Error> for AppError {
    fn from(cause: tauri::Error) -> Self {
        log::error!("Tauri error: {cause}");
        Self::internal("The application could not complete the request.")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_kind_and_message() {
        let json = serde_json::to_value(AppError::not_found("Background task not found.")).unwrap();
        assert_eq!(json, serde_json::json!({ "kind": "not-found", "message": "Background task not found." }));
    }
}
