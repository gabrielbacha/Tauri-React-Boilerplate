//! Commands the windows call. Each is thin: validate, call a service, broadcast the change.
//!
//! Adding a command: write it here, add it to `ipc::builder`, add `allow-<name>` to
//! `permissions/app-commands.toml`, then run `pnpm run bindings`.

#[cfg(showcase)]
pub mod showcase;

use serde::Deserialize;
use specta::Type;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{MessageDialogButtons, MessageDialogKind, MessageDialogResult};
use tauri_plugin_opener::OpenerExt;
use tauri_specta::Event;
use uuid::Uuid;

use crate::app_config::{PRODUCT_NAME, PROTOCOL};
use crate::application;
use crate::commands_registry::{CommandId, ShortcutOverrides};
use crate::diagnostics::{self, AppInfo, DiagnosticsSnapshot};
use crate::dialogs::{self, Message};
use crate::error::{AppError, AppResult};
use crate::events::{PermissionsChanged, TasksChanged};
use crate::interruption::validate_sources;
use crate::known_links::KnownDestination;
use crate::permissions::{PermissionCapability, PermissionStatus, PromptAnswer};
use crate::preferences::{AppPreferences, LegacyInterfacePreferences, PreferencesPatch};
use crate::state::AppState;
use crate::tasks::BackgroundTask;
use crate::updater::UpdateState;
use crate::windows::{WindowSession, WindowSessionPatch};

type Window = WebviewWindow;

#[tauri::command]
#[specta::specta]
pub fn app_get_info(app: AppHandle, state: State<'_, AppState>, window: Window) -> AppResult<AppInfo> {
    state.caller(&window)?;
    Ok(diagnostics::app_info(&app))
}

#[tauri::command]
#[specta::specta]
pub fn preferences_get(state: State<'_, AppState>, window: Window) -> AppResult<AppPreferences> {
    state.caller(&window)?;
    Ok(state.preferences.get())
}

#[tauri::command]
#[specta::specta]
pub fn preferences_update(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    patch: PreferencesPatch,
) -> AppResult<AppPreferences> {
    state.caller(&window)?;
    let preferences = state.preferences.update(patch)?;
    application::preferences_changed(&app, &preferences);
    Ok(preferences)
}

#[tauri::command]
#[specta::specta]
pub fn preferences_migrate_interface(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    legacy: LegacyInterfacePreferences,
) -> AppResult<AppPreferences> {
    state.caller(&window)?;
    let before = state.preferences.get();
    let preferences = state.preferences.migrate_interface(legacy)?;
    if preferences != before {
        application::preferences_changed(&app, &preferences);
    }
    Ok(preferences)
}

#[tauri::command]
#[specta::specta]
pub fn shortcuts_set(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    id: CommandId,
    binding: Option<String>,
) -> AppResult<AppPreferences> {
    state.caller(&window)?;
    if binding.as_ref().is_some_and(|binding| binding.chars().count() > 80) {
        return Err(AppError::invalid("That shortcut is too long."));
    }
    let mut shortcuts = state.preferences.get().shortcuts;
    shortcuts.insert(id, binding);
    let preferences = state.preferences.set_shortcuts(&shortcuts)?;
    application::preferences_changed(&app, &preferences);
    Ok(preferences)
}

/// Reset one shortcut to its default, or every shortcut when `id` is `null`.
#[tauri::command]
#[specta::specta]
pub fn shortcuts_reset(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    id: Option<CommandId>,
) -> AppResult<AppPreferences> {
    state.caller(&window)?;
    let shortcuts = match id {
        Some(id) => {
            let mut shortcuts = state.preferences.get().shortcuts;
            shortcuts.remove(&id);
            shortcuts
        }
        None => ShortcutOverrides::new(),
    };
    let preferences = state.preferences.set_shortcuts(&shortcuts)?;
    application::preferences_changed(&app, &preferences);
    Ok(preferences)
}

/// Suspend native menu accelerators while this window records a shortcut.
#[tauri::command]
#[specta::specta]
pub fn shortcuts_record(app: AppHandle, state: State<'_, AppState>, window: Window, active: bool) -> AppResult<()> {
    state.caller(&window)?;
    application::set_recording(&app, &window, active)
}

#[tauri::command]
#[specta::specta]
pub fn links_open_known_destination(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    destination: KnownDestination,
) -> AppResult<()> {
    state.caller(&window)?;
    let url = crate::known_links::url(destination)?;
    app.opener().open_url(url.as_str(), None::<&str>).map_err(|_| AppError::unavailable("Unable to open the link."))
}

#[tauri::command]
#[specta::specta]
pub fn window_new(app: AppHandle, state: State<'_, AppState>, window: Window) -> AppResult<()> {
    state.caller(&window)?;
    application::create_window(&app, None).map(|_| ())
}

#[tauri::command]
#[specta::specta]
pub fn window_get_session(app: AppHandle, state: State<'_, AppState>, window: Window) -> AppResult<WindowSession> {
    let label = state.caller(&window)?;
    Ok(application::session_of(&app, &label))
}

#[tauri::command]
#[specta::specta]
pub fn window_set_session(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    patch: WindowSessionPatch,
) -> AppResult<()> {
    let label = state.caller(&window)?;
    {
        let mut registry = state.windows();
        let record = registry.get_mut(&label).ok_or_else(|| AppError::not_found("Window not found."))?;
        record.session.apply(patch)?;
    }
    application::schedule_session_save(&app);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn window_quit(app: AppHandle, state: State<'_, AppState>, window: Window) -> AppResult<()> {
    state.caller(&window)?;
    application::request_quit(&app);
    Ok(())
}

#[derive(Debug, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct DirtyState {
    pub sources: Vec<String>,
}

/// Report the unsaved sources in this window. Quit, update, and close confirm while any exist.
#[tauri::command]
#[specta::specta]
pub fn lifecycle_set_dirty_state(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    dirty: DirtyState,
) -> AppResult<()> {
    let label = state.caller(&window)?;
    if !validate_sources(&dirty.sources) {
        return Err(AppError::invalid("Report at most 20 unsaved sources of 1–80 characters."));
    }
    application::set_dirty_sources(&app, &label, dirty.sources);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn lifecycle_resolve_interruption(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    id: Uuid,
    proceed: bool,
) -> AppResult<()> {
    let label = state.caller(&window)?;
    application::resolve_interruption(&app, &label, id, proceed);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn updates_get_state(state: State<'_, AppState>, window: Window) -> AppResult<UpdateState> {
    state.caller(&window)?;
    Ok(state.updater.state())
}

#[tauri::command]
#[specta::specta]
pub async fn updates_check(app: AppHandle, state: State<'_, AppState>, window: Window) -> AppResult<UpdateState> {
    state.caller(&window)?;
    Ok(state.updater.check(&app, true).await)
}

#[tauri::command]
#[specta::specta]
pub fn updates_restart(app: AppHandle, state: State<'_, AppState>, window: Window) -> AppResult<()> {
    state.caller(&window)?;
    application::request_update_restart(&app)
}

#[tauri::command]
#[specta::specta]
pub fn tasks_list(state: State<'_, AppState>, window: Window) -> AppResult<Vec<BackgroundTask>> {
    state.caller(&window)?;
    Ok(state.tasks.list())
}

#[tauri::command]
#[specta::specta]
pub fn tasks_cancel(state: State<'_, AppState>, window: Window, id: Uuid) -> AppResult<()> {
    state.caller(&window)?;
    state.tasks.cancel(id)
}

#[tauri::command]
#[specta::specta]
pub fn tasks_retry(state: State<'_, AppState>, window: Window, id: Uuid) -> AppResult<BackgroundTask> {
    state.caller(&window)?;
    state.tasks.retry(id)
}

#[tauri::command]
#[specta::specta]
pub fn tasks_dismiss(state: State<'_, AppState>, window: Window, id: Uuid) -> AppResult<()> {
    state.caller(&window)?;
    state.tasks.dismiss(id)
}

#[tauri::command]
#[specta::specta]
pub fn permissions_list(state: State<'_, AppState>, window: Window) -> AppResult<Vec<PermissionStatus>> {
    state.caller(&window)?;
    Ok(state.permissions.list())
}

/// Ask once with a native prompt. Later calls return the remembered decision.
#[tauri::command]
#[specta::specta]
pub async fn permissions_request(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    capability: PermissionCapability,
) -> AppResult<PermissionStatus> {
    state.caller(&window)?;
    let prompt_app = app.clone();
    let prompt_window = window.clone();
    let status = state
        .permissions
        .request(capability, move |capability| async move {
            let label = match capability {
                PermissionCapability::Notifications => "notifications",
                PermissionCapability::Camera => "the camera",
                PermissionCapability::Microphone => "the microphone",
            };
            let message = format!(
                "Allow {PRODUCT_NAME} to use {label}? Choose a session-only grant, remember the grant, or deny it until \
                 reset in Settings."
            );
            let result = dialogs::ask(
                &prompt_app,
                Some(&prompt_window),
                Message {
                    title: "Permission request",
                    message: &message,
                    kind: MessageDialogKind::Info,
                    buttons: MessageDialogButtons::YesNoCancelCustom(
                        "Allow this session".into(),
                        "Always allow".into(),
                        "Don't allow".into(),
                    ),
                },
            )
            .await;
            match result {
                MessageDialogResult::Yes => PromptAnswer::Session,
                MessageDialogResult::Custom(label) if label == "Allow this session" => PromptAnswer::Session,
                MessageDialogResult::No => PromptAnswer::Always,
                MessageDialogResult::Custom(label) if label == "Always allow" => PromptAnswer::Always,
                _ => PromptAnswer::Deny,
            }
        })
        .await?;
    let _ = PermissionsChanged(state.permissions.list()).emit(&app);
    Ok(status)
}

#[tauri::command]
#[specta::specta]
pub fn permissions_reset(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
    capability: Option<PermissionCapability>,
) -> AppResult<Vec<PermissionStatus>> {
    state.caller(&window)?;
    let statuses = state.permissions.reset(capability)?;
    let _ = PermissionsChanged(statuses.clone()).emit(&app);
    Ok(statuses)
}

#[tauri::command]
#[specta::specta]
pub fn deep_links_get_protocol(state: State<'_, AppState>, window: Window) -> AppResult<String> {
    state.caller(&window)?;
    Ok(PROTOCOL.to_owned())
}

/// The window listens for events. Queued deep links and interruption requests are delivered now.
#[tauri::command]
#[specta::specta]
pub fn deep_links_ready(app: AppHandle, state: State<'_, AppState>, window: Window) -> AppResult<()> {
    let label = state.caller(&window)?;
    application::window_ready(&app, &label);
    Ok(())
}

fn diagnostics_for(app: &AppHandle, state: &AppState, label: &str) -> DiagnosticsSnapshot {
    let loaded = state.windows().get(label).is_some_and(|record| record.loaded);
    diagnostics::snapshot(app, state.updater.state().status(), loaded)
}

#[tauri::command]
#[specta::specta]
pub fn diagnostics_get(app: AppHandle, state: State<'_, AppState>, window: Window) -> AppResult<DiagnosticsSnapshot> {
    let label = state.caller(&window)?;
    Ok(diagnostics_for(&app, &state, &label))
}

#[tauri::command]
#[specta::specta]
pub fn diagnostics_copy_report(app: AppHandle, state: State<'_, AppState>, window: Window) -> AppResult<()> {
    let label = state.caller(&window)?;
    let report = serde_json::to_string_pretty(&diagnostics_for(&app, &state, &label))
        .map_err(|_| AppError::internal("Unable to prepare diagnostics."))?;
    app.clipboard().write_text(report).map_err(|_| AppError::unavailable("Unable to copy diagnostics."))
}

#[tauri::command]
#[specta::specta]
pub fn diagnostics_open_logs(app: AppHandle, state: State<'_, AppState>, window: Window) -> AppResult<()> {
    state.caller(&window)?;
    let logs = state.profile.join("logs");
    std::fs::create_dir_all(&logs).map_err(|_| AppError::unavailable("Unable to open the logs folder."))?;
    app.opener()
        .open_path(logs.to_string_lossy(), None::<&str>)
        .map_err(|_| AppError::unavailable("Unable to open the logs folder."))
}

#[tauri::command]
#[specta::specta]
pub fn diagnostics_reload(state: State<'_, AppState>, window: Window) -> AppResult<()> {
    state.caller(&window)?;
    window.reload().map_err(AppError::from)
}

#[tauri::command]
#[specta::specta]
pub fn diagnostics_reset_preferences(
    app: AppHandle,
    state: State<'_, AppState>,
    window: Window,
) -> AppResult<AppPreferences> {
    state.caller(&window)?;
    let preferences = state.preferences.reset()?;
    application::preferences_changed(&app, &preferences);
    Ok(preferences)
}

/// Broadcast the current task list, for commands that change it outside the manager's own events.
pub fn broadcast_tasks(app: &AppHandle) {
    let _ = TasksChanged(app.state::<AppState>().tasks.list()).emit(app);
}
