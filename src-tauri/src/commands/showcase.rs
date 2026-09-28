//! Example capabilities: saved documents, text import and export, file hashing, and sharing.
//!
//! The clean variant does not grant these commands to the webview (`showcase-commands` in the capability),
//! and each command also refuses to run there.

use serde::Deserialize;
use specta::Type;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_specta::Event;
use uuid::Uuid;

use crate::app_config::{PRODUCT_NAME, SHOWCASE};
use crate::database::{DocumentInput, DocumentSummary, DocumentWriteResult, SavedDocument, validate_text};
use crate::dialogs;
use crate::documents::{self, SaveTextInput, SavedText, TextDocument};
use crate::error::{AppError, AppResult};
use crate::events::DocumentsChanged;
use crate::state::AppState;
use crate::tasks::hash::FileSource;
use crate::tasks::{BackgroundTask, TaskStatus};

type Window = WebviewWindow;
const TEXT_FILTER: (&str, &[&str]) = ("Text and Markdown", &["txt", "md"]);

/// The caller is a known window and the showcase is part of this build.
fn caller(state: &AppState, window: &Window) -> AppResult<String> {
    if !SHOWCASE {
        return Err(AppError::unavailable("This feature is not included in this build."));
    }
    state.caller(window)
}

#[tauri::command]
#[specta::specta]
pub fn documents_list(
    state: State<'_, AppState>,
    window: Window,
    offset: Option<u32>,
) -> AppResult<Vec<DocumentSummary>> {
    caller(&state, &window)?;
    let offset = offset.unwrap_or(0);
    if offset > 1_000_000 {
        return Err(AppError::invalid("Invalid page."));
    }
    state.database.list_documents(offset)
}

#[tauri::command]
#[specta::specta]
pub fn documents_get(state: State<'_, AppState>, window: Window, id: Uuid) -> AppResult<Option<SavedDocument>> {
    caller(&state, &window)?;
    state.database.get_document(id)
}

#[tauri::command]
#[specta::specta]
pub fn documents_create(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    input: DocumentInput,
) -> AppResult<SavedDocument> {
    caller(&state, &window)?;
    let document = state.database.create_document(input)?;
    let _ = DocumentsChanged(document.id).emit(&app);
    Ok(document)
}

#[tauri::command]
#[specta::specta]
pub fn documents_save(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    id: Uuid,
    revision: u32,
    input: DocumentInput,
) -> AppResult<DocumentWriteResult> {
    caller(&state, &window)?;
    let result = state.database.save_document(id, revision, input)?;
    if matches!(result, DocumentWriteResult::Saved { .. }) {
        let _ = DocumentsChanged(id).emit(&app);
    }
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn documents_delete(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    id: Uuid,
    revision: u32,
) -> AppResult<bool> {
    caller(&state, &window)?;
    let deleted = state.database.delete_document(id, revision)?;
    if deleted {
        let _ = DocumentsChanged(id).emit(&app);
    }
    Ok(deleted)
}

#[tauri::command]
#[specta::specta]
pub async fn documents_open_text(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
) -> AppResult<Option<TextDocument>> {
    caller(&state, &window)?;
    let Some(path) = dialogs::pick_file(&app, &window, "Import text", Some(TEXT_FILTER)).await else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || documents::read_text_document(&path))
        .await
        .map_err(|_| AppError::internal("Import failed."))?
        .map(Some)
}

#[tauri::command]
#[specta::specta]
pub async fn documents_save_text(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    input: SaveTextInput,
) -> AppResult<Option<SavedText>> {
    caller(&state, &window)?;
    documents::validate_save_input(&input)?;
    let Some(path) = dialogs::save_file(&app, &window, "Export text", &input.suggested_name, TEXT_FILTER).await else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || documents::write_text_document(&path, &input.content))
        .await
        .map_err(|_| AppError::internal("Export failed."))?
        .map(Some)
}

#[derive(Debug, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceSummaryInput {
    pub draft: String,
}

/// Copy the draft and every completed digest to the clipboard.
#[tauri::command]
#[specta::specta]
pub fn sharing_copy_workspace_summary(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    input: WorkspaceSummaryInput,
) -> AppResult<()> {
    caller(&state, &window)?;
    validate_text(&input.draft)?;
    let hashes = state
        .tasks
        .list()
        .into_iter()
        .filter(|task| task.status == TaskStatus::Completed)
        .filter_map(|task| task.result.map(|result| format!("{}: {}", result.file_name, result.sha256)))
        .collect::<Vec<_>>()
        .join("\n");
    let version = app.package_info().version.to_string();
    let summary = format!("{PRODUCT_NAME} {version}\n\n{}\n\n{hashes}", input.draft);
    app.clipboard()
        .write_text(summary.trim().to_owned())
        .map_err(|_| AppError::unavailable("Unable to copy to the clipboard."))
}

#[tauri::command]
#[specta::specta]
pub fn tasks_copy_digest(app: AppHandle, state: State<'_, AppState>, window: Window, id: Uuid) -> AppResult<()> {
    caller(&state, &window)?;
    let digest = state
        .tasks
        .find(id)
        .filter(|task| task.status == TaskStatus::Completed)
        .and_then(|task| task.result)
        .ok_or_else(|| AppError::not_found("Completed task not found."))?
        .sha256;
    app.clipboard().write_text(digest).map_err(|_| AppError::unavailable("Unable to copy to the clipboard."))
}

#[tauri::command]
#[specta::specta]
pub fn tasks_clear_completed(state: State<'_, AppState>, window: Window) -> AppResult<()> {
    caller(&state, &window)?;
    state.tasks.clear_completed()
}

/// Choose a file in a native dialog and queue a SHA-256 task. Returns `null` when the dialog is cancelled.
#[tauri::command]
#[specta::specta]
pub async fn tasks_start_file_hash(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
) -> AppResult<Option<BackgroundTask>> {
    caller(&state, &window)?;
    let Some(path) = dialogs::pick_file(&app, &window, "Choose a file to hash", None).await else {
        return Ok(None);
    };
    let source = FileSource::from_path(path).map_err(|_| {
        AppError::invalid("Unable to start hashing. Check that the file is available and the queue has space.")
    })?;
    state.tasks.start_file_hash(source).map(Some)
}
