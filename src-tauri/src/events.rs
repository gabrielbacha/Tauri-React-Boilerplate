//! Typed events from Rust to the windows. Each becomes `events.<camelCaseName>` in the bindings.

use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

use crate::commands_registry::CommandId;
use crate::deep_links::DeepLinkIntent;
use crate::interruption::InterruptionRequest;
use crate::permissions::PermissionStatus;
use crate::preferences::AppPreferences;
use crate::tasks::BackgroundTask;
use crate::updater::UpdateState;

#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct PreferencesChanged(pub AppPreferences);

#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct TasksChanged(pub Vec<BackgroundTask>);

#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct PermissionsChanged(pub Vec<PermissionStatus>);

/// A saved document changed. Windows showing it reload.
#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct DocumentsChanged(pub Uuid);

/// Run a workspace command chosen in the native menu. Sent only to the target window.
#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct CommandRun(pub CommandId);

/// Ask the window to confirm an interruption. Answer with `lifecycleResolveInterruption`.
#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct InterruptionRequested(pub InterruptionRequest);

#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct UpdateStateChanged(pub UpdateState);

#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct DeepLinkOpened(pub DeepLinkIntent);
