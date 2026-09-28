//! Startup, windows, deep links, and the quit flow. The Tauri counterpart of Electron's `application.ts`.

use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{AppHandle, Manager, RunEvent, Runtime, Webview, WebviewWindow, Window, WindowEvent};
use tauri_plugin_dialog::{MessageDialogButtons, MessageDialogKind, MessageDialogResult};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_specta::Event;
use uuid::Uuid;

use crate::app_config::{APP_ID, PROTOCOL, is_development};
use crate::commands_registry::CommandId;
use crate::database::Database;
use crate::deep_links::{self, DeepLinkIntent, DeepLinkQueue};
use crate::dialogs::{self, Message};
use crate::error::{AppError, AppResult};
use crate::events::{CommandRun, DeepLinkOpened, InterruptionRequested, PreferencesChanged, TasksChanged};
use crate::interruption::{
    Delivery, InterruptionCoordinator, InterruptionKind, InterruptionRequest, Proceed, RequestOutcome,
};
use crate::known_links::{self, KnownDestination};
use crate::permissions::{PermissionBroker, PermissionCapability};
use crate::preferences::{AppPreferences, PreferencesStore, ThemeMode};
use crate::shutdown::{ShutdownChoice, ShutdownSteps, finish_shutdown};
use crate::state::{AppState, DatabaseJobs, lock};
use crate::storage::bootstrap::{ProfileOptions, initialize_profile, prepare_settings};
use crate::tasks::{self, BackgroundTask, CompletionTracker, TaskManager, TaskPersistence};
use crate::updater::Updater;
use crate::windows::lifecycle::{CloseAction, close_action};
use crate::windows::{self, PlacementStore, SavedWindow, WindowRecord, WindowRegistry, WindowSession};
use crate::{database, menu};

/// Open storage, restore windows, and start background work. Any storage failure stops startup.
pub fn setup<R: Runtime>(app: &mut tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let state = match open_state(&handle) {
        Ok(state) => state,
        Err(message) => {
            log::error!("Startup failed: {message}");
            dialogs::error(
                &handle,
                "Unable to open application storage",
                &format!(
                    "{message}\n\nCheck disk space and folder permissions. If this profile was opened by a newer app, \
                     install that version. Your existing files have been preserved."
                ),
            );
            std::process::exit(1);
        }
    };
    let restore = state.preferences.get().restore_windows;
    let check_updates = state.preferences.get().check_for_updates_automatically;
    let saved: Vec<SavedWindow> = if restore {
        state.database.load_windows().unwrap_or_default().iter().filter_map(|data| SavedWindow::parse(data)).collect()
    } else {
        Vec::new()
    };
    app.manage(state);
    apply_theme(&handle, handle.state::<AppState>().preferences.get().theme);
    watch_tasks(&handle);
    listen_for_deep_links(&handle);
    menu::install(&handle);

    if saved.is_empty() {
        create_window(&handle, None)?;
    } else {
        for window in saved {
            create_window(&handle, Some(window))?;
        }
    }
    if check_updates {
        let app = handle.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(8)).await;
            app.state::<AppState>().updater.check(&app, false).await;
        });
    }
    let state = handle.state::<AppState>();
    state.ready.store(true, Ordering::SeqCst);
    state.tasks.start();
    accept_deep_link(&handle, deep_links::extract(&std::env::args().collect::<Vec<_>>(), PROTOCOL));
    Ok(())
}

fn open_state<R: Runtime>(app: &AppHandle<R>) -> Result<AppState, String> {
    let app_data = app.path().data_dir().map_err(|error| error.to_string())?;
    let override_path = std::env::var_os("TAURI_APP_PROFILE").map(Into::into);
    let profile = initialize_profile(&ProfileOptions {
        app_data: &app_data,
        app_id: APP_ID,
        development: is_development(),
        override_path,
    })
    .map_err(|error| format!("The profile folder is not writable ({error})."))?;
    app.plugin(
        tauri_plugin_log::Builder::new()
            .level(if is_development() { log::LevelFilter::Debug } else { log::LevelFilter::Info })
            .targets([
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
                    path: profile.join("logs"),
                    file_name: None,
                }),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
            ])
            .build(),
    )
    .map_err(|error| error.to_string())?;
    prepare_settings(&profile).map_err(|error| error.to_string())?;
    let mac = cfg!(target_os = "macos");
    let packaged = !is_development();
    let preferences = PreferencesStore::open(&profile, mac, packaged).map_err(|error| error.to_string())?;
    let permissions = PermissionBroker::open(&profile).map_err(|error| error.to_string())?;
    let database = Arc::new(Database::open(&profile.join("app.sqlite")).map_err(|error| error.to_string())?);
    log::info!("SQLite storage ready");
    let persistence: Arc<dyn TaskPersistence> = Arc::new(DatabaseJobs(database.clone()));
    let tasks = TaskManager::new(tasks::default_runner(), Some(persistence)).map_err(|error| error.to_string())?;
    let placement = PlacementStore::new(&profile);
    Ok(AppState {
        profile,
        mac,
        packaged,
        preferences,
        permissions,
        database,
        tasks,
        updater: Updater::default(),
        placement,
        windows: Mutex::new(WindowRegistry::default()),
        interruptions: Mutex::new(InterruptionCoordinator::default()),
        deep_links: Mutex::new(DeepLinkQueue::default()),
        completion: Mutex::new(CompletionTracker::default()),
        last_session: Mutex::new(Vec::new()),
        session_generation: 0.into(),
        ready: false.into(),
        quitting: false.into(),
        shutting_down: false.into(),
        closing_last_window: false.into(),
    })
}

/// Broadcast task changes and notify about completions while no window is focused.
fn watch_tasks<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    lock(&state.completion).update(&state.tasks.list());
    let handle = app.clone();
    state.tasks.set_listener(Arc::new(move |tasks: Vec<BackgroundTask>| {
        let state = handle.state::<AppState>();
        let fresh = lock(&state.completion).update(&tasks);
        if let Err(error) = TasksChanged(tasks).emit(&handle) {
            log::error!("Unable to send task changes: {error}");
        }
        if state.windows().any_focused() || !state.permissions.is_granted(PermissionCapability::Notifications) {
            return;
        }
        for task in fresh {
            let file = task.result.as_ref().map_or("Your file", |result| result.file_name.as_str());
            let _ =
                handle.notification().builder().title("File hash complete").body(format!("{file} is ready.")).show();
        }
    }));
}

fn listen_for_deep_links<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(desktop)]
    {
        use tauri_plugin_deep_link::DeepLinkExt;
        let links = app.deep_link();
        // Packaged Windows and Linux builds register at install time; development builds register here.
        #[cfg(any(windows, target_os = "linux"))]
        if is_development()
            && let Err(error) = links.register_all()
        {
            log::warn!("Unable to register the development protocol: {error}");
        }
        let handle = app.clone();
        links.on_open_url(move |event| {
            for url in event.urls() {
                accept_deep_link(&handle, deep_links::parse(url.as_str(), PROTOCOL));
            }
        });
        if let Ok(Some(urls)) = links.get_current() {
            for url in urls {
                accept_deep_link(app, deep_links::parse(url.as_str(), PROTOCOL));
            }
        }
    }
}

/// Another launch forwards its arguments here (Windows and Linux deep links arrive this way).
pub fn on_second_instance<R: Runtime>(app: &AppHandle<R>, argv: &[String]) {
    accept_deep_link(app, deep_links::extract(argv, PROTOCOL));
    if app.state::<AppState>().is(&app.state::<AppState>().ready) {
        show_workspace(app);
    }
}

pub fn accept_deep_link<R: Runtime>(app: &AppHandle<R>, intent: Option<DeepLinkIntent>) {
    let Some(intent) = intent else { return };
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    lock(&state.deep_links).push(intent);
    if state.is(&state.ready) {
        show_workspace(app);
        deliver_deep_links(app);
    }
}

pub fn deliver_deep_links<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    let label = {
        let registry = state.windows();
        registry.current().filter(|label| registry.is_ready(label))
    };
    let Some(label) = label else { return };
    for intent in lock(&state.deep_links).drain() {
        if let Err(error) = DeepLinkOpened(intent).emit_to(app, label.as_str()) {
            log::error!("Unable to deliver a deep link: {error}");
        }
    }
}

pub fn create_window<R: Runtime>(app: &AppHandle<R>, saved: Option<SavedWindow>) -> AppResult<String> {
    let state = app.state::<AppState>();
    if state.is(&state.shutting_down) {
        return Err(AppError::unavailable("Application is shutting down."));
    }
    if state.windows().len() >= database::MAX_WINDOWS {
        return Err(AppError::invalid("Close a window before opening another (20 maximum)."));
    }
    let id = saved.as_ref().map_or_else(Uuid::new_v4, |saved| saved.id);
    let placement = saved.as_ref().map(|saved| saved.placement).or_else(|| state.placement.load());
    let dark = state.preferences.get().theme == ThemeMode::Dark;
    let (label, window, placement) = windows::build(app, id, placement, dark)?;
    state.windows().add(
        label.clone(),
        WindowRecord {
            id,
            loaded: false,
            subscribed: false,
            session: saved.map(|saved| saved.session).unwrap_or_default(),
            dirty_sources: Vec::new(),
            close_allowed: false,
            recording_shortcut: false,
            placement,
            interruptions: InterruptionCoordinator::default(),
        },
    );
    drop(window);
    schedule_session_save(app);
    Ok(label)
}

pub fn show_workspace<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    if state.is(&state.shutting_down) {
        return;
    }
    let label = state.windows().current();
    let label = match label {
        Some(label) => label,
        None => match create_window(app, None) {
            Ok(label) => label,
            Err(error) => {
                log::error!("Unable to open a window: {error}");
                return;
            }
        },
    };
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        if state.windows().get(&label).is_some_and(|record| record.loaded) {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

pub fn run_command_in_current_window<R: Runtime>(app: &AppHandle<R>, command: CommandId) {
    let state = app.state::<AppState>();
    let Some(label) = state.windows().current() else {
        return;
    };
    if state.windows().get(&label).is_none_or(|record| record.recording_shortcut) {
        return;
    }
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = CommandRun(command).emit_to(app, label.as_str());
}

pub fn open_destination<R: Runtime>(app: &AppHandle<R>, destination: KnownDestination) {
    match known_links::url(destination) {
        Ok(url) => {
            if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
                log::error!("Unable to open a destination: {error}");
            }
        }
        Err(error) => log::error!("{error}"),
    }
}

pub fn apply_theme<R: Runtime>(app: &AppHandle<R>, theme: ThemeMode) {
    app.set_theme(match theme {
        ThemeMode::System => None,
        ThemeMode::Light => Some(tauri::Theme::Light),
        ThemeMode::Dark => Some(tauri::Theme::Dark),
    });
}

/// Apply and broadcast a preferences change.
pub fn preferences_changed<R: Runtime>(app: &AppHandle<R>, preferences: &AppPreferences) {
    apply_theme(app, preferences.theme);
    menu::install(app);
    if let Err(error) = PreferencesChanged(preferences.clone()).emit(app) {
        log::error!("Unable to send preferences: {error}");
    }
}

/// Save the window session 250 ms after the last change.
pub fn schedule_session_save<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    if state.is(&state.shutting_down) {
        return;
    }
    *lock(&state.last_session) = state.windows().snapshot();
    let generation = state.session_generation.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(250)).await;
        let state = app.state::<AppState>();
        if state.session_generation.load(Ordering::SeqCst) != generation || state.is(&state.shutting_down) {
            return;
        }
        if let Err(error) = save_session(&state, &lock(&state.last_session)) {
            log::error!("Unable to save the window session: {error}");
        }
    });
}

fn save_session(state: &AppState, windows: &[SavedWindow]) -> AppResult<()> {
    let rows: Vec<(Uuid, String)> =
        windows.iter().filter_map(|window| serde_json::to_string(window).ok().map(|data| (window.id, data))).collect();
    state.database.save_windows(&rows)
}

// ---------------------------------------------------------------------------------------------
// Interruptions and quitting

enum Scope {
    Global,
    Window(String),
}

pub fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    let app_for_action = app.clone();
    request(app, &Scope::Global, InterruptionKind::Quit, Box::new(move || spawn_shutdown(&app_for_action, false)));
}

pub fn request_update_restart<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if !app.state::<AppState>().updater.is_ready() {
        return Err(AppError::invalid("No downloaded update is ready."));
    }
    let app_for_action = app.clone();
    request(
        app,
        &Scope::Global,
        InterruptionKind::InstallUpdate,
        Box::new(move || spawn_shutdown(&app_for_action, true)),
    );
    Ok(())
}

fn request<R: Runtime>(app: &AppHandle<R>, scope: &Scope, kind: InterruptionKind, proceed: Proceed) {
    let state = app.state::<AppState>();
    // Lock order is always window registry, then interruptions. Task counts are read before either.
    let active_tasks = state.tasks.active_count();
    let outcome = {
        let mut registry = state.windows();
        match scope {
            Scope::Global => {
                let current = registry.current();
                let mut coordinator = lock(&state.interruptions);
                coordinator.set_dirty_sources(registry.dirty_sources());
                coordinator.request(kind, active_tasks, proceed, |label| registry.is_ready(label), current)
            }
            Scope::Window(label) => {
                let ready = registry.is_ready(label);
                let Some(record) = registry.get_mut(label) else {
                    return;
                };
                record.interruptions.request(kind, 0, proceed, |_| ready, Some(label.clone()))
            }
        }
    };
    match outcome {
        RequestOutcome::Proceed(action) => action(),
        RequestOutcome::Deliver(delivery) => deliver(app, scope, delivery),
    }
}

fn deliver<R: Runtime>(app: &AppHandle<R>, scope: &Scope, delivery: Delivery) {
    match delivery {
        Delivery::Nothing => {}
        Delivery::Window(label, request) => {
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.show();
                let _ = window.set_focus();
            }
            if let Err(error) = InterruptionRequested(request).emit_to(app, label.as_str()) {
                log::error!("Unable to deliver an interruption request: {error}");
            }
        }
        Delivery::Native(request) => {
            let app = app.clone();
            let scope = match scope {
                Scope::Global => Scope::Global,
                Scope::Window(label) => Scope::Window(label.clone()),
            };
            tauri::async_runtime::spawn(async move {
                let proceed = native_confirm(&app, &scope, &request).await;
                let action = resolve_in(&app, &scope, request.id, proceed, None);
                if let Some(action) = action {
                    action();
                }
            });
        }
    }
}

async fn native_confirm<R: Runtime>(app: &AppHandle<R>, scope: &Scope, request: &InterruptionRequest) -> bool {
    let plural = |count: usize, noun: &str| format!("{count} {noun}{}", if count == 1 { "" } else { "s" });
    let mut parts = Vec::new();
    if !request.dirty_sources.is_empty() {
        parts.push(plural(request.dirty_sources.len(), "unsaved source"));
    }
    if request.active_task_count > 0 {
        parts.push(plural(request.active_task_count as usize, "active background task"));
    }
    let (title, action) = match request.kind {
        InterruptionKind::CloseWindow => ("Close window?", "Close"),
        InterruptionKind::Quit => ("Quit application?", "Quit"),
        InterruptionKind::InstallUpdate => ("Restart to install update?", "Restart"),
    };
    let message = format!(
        "Work in progress will be interrupted: {}. Unsaved edits will be discarded. Background jobs are preserved for recovery.",
        parts.join(" and ")
    );
    let parent = match scope {
        Scope::Window(label) => app.get_webview_window(label),
        Scope::Global => app.state::<AppState>().windows().current().and_then(|label| app.get_webview_window(&label)),
    };
    let result = dialogs::ask(
        app,
        parent.as_ref(),
        Message {
            title,
            message: &message,
            kind: MessageDialogKind::Warning,
            buttons: MessageDialogButtons::OkCancelCustom(action.into(), "Cancel".into()),
        },
    )
    .await;
    matches!(result, MessageDialogResult::Ok) || result == MessageDialogResult::Custom(action.into())
}

fn resolve_in<R: Runtime>(
    app: &AppHandle<R>,
    scope: &Scope,
    id: Uuid,
    proceed: bool,
    sender: Option<&str>,
) -> Option<Proceed> {
    let state = app.state::<AppState>();
    match scope {
        Scope::Global => lock(&state.interruptions).resolve(id, proceed, sender),
        Scope::Window(label) => state.windows().get_mut(label)?.interruptions.resolve(id, proceed, None),
    }
}

/// A window answered an interruption request.
pub fn resolve_interruption<R: Runtime>(app: &AppHandle<R>, label: &str, id: Uuid, proceed: bool) {
    let window_action = resolve_in(app, &Scope::Window(label.to_owned()), id, proceed, None);
    let global_action = resolve_in(app, &Scope::Global, id, proceed, Some(label));
    for action in [window_action, global_action].into_iter().flatten() {
        action();
    }
}

/// Re-send pending requests once a window can show them.
pub fn deliver_pending_interruptions<R: Runtime>(app: &AppHandle<R>, label: &str) {
    let state = app.state::<AppState>();
    let window_delivery = {
        let mut registry = state.windows();
        let ready = registry.is_ready(label);
        registry.get_mut(label).map(|record| record.interruptions.deliver_pending(|_| ready, Some(label.to_owned())))
    };
    if let Some(delivery) = window_delivery {
        deliver(app, &Scope::Window(label.to_owned()), delivery);
    }
    let global_delivery = {
        let registry = state.windows();
        let current = registry.current();
        lock(&state.interruptions).deliver_pending(|candidate| registry.is_ready(candidate), current)
    };
    deliver(app, &Scope::Global, global_delivery);
}

pub fn set_dirty_sources<R: Runtime>(app: &AppHandle<R>, label: &str, sources: Vec<String>) {
    let state = app.state::<AppState>();
    let mut registry = state.windows();
    if let Some(record) = registry.get_mut(label) {
        record.interruptions.set_dirty_sources(sources.clone());
        record.dirty_sources = sources;
    }
    lock(&state.interruptions).set_dirty_sources(registry.dirty_sources());
}

/// Suspend menu accelerators while a window records a shortcut.
pub fn set_recording<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>, active: bool) -> AppResult<()> {
    let state = app.state::<AppState>();
    if active && !window.is_focused().unwrap_or(false) {
        return Err(AppError::invalid("Focus the app to record a shortcut."));
    }
    let changed = {
        let mut registry = state.windows();
        let Some(record) = registry.get_mut(window.label()) else {
            return Ok(());
        };
        let changed = record.recording_shortcut != active;
        record.recording_shortcut = active;
        changed
    };
    if changed {
        menu::install(app);
    }
    Ok(())
}

fn spawn_shutdown<R: Runtime>(app: &AppHandle<R>, update: bool) {
    let state = app.state::<AppState>();
    if state.shutting_down.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut steps = AppShutdown { app: app.clone() };
        if !finish_shutdown(update, &mut steps).await {
            app.state::<AppState>().shutting_down.store(false, Ordering::SeqCst);
        }
    });
}

struct AppShutdown<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> ShutdownSteps for AppShutdown<R> {
    async fn stop(&mut self) {
        self.app.state::<AppState>().tasks.stop().await;
    }

    fn save(&mut self) -> Result<(), String> {
        let state = self.app.state::<AppState>();
        state.tasks.save_stopped().map_err(|error| error.to_string())?;
        let windows = {
            let registry = state.windows();
            if registry.is_empty() { lock(&state.last_session).clone() } else { registry.snapshot() }
        };
        save_session(&state, &windows).map_err(|error| error.to_string())?;
        state.placement.flush().map_err(|error| error.to_string())
    }

    fn close(&mut self) -> Result<(), String> {
        self.app.state::<AppState>().database.close().map_err(|error| error.to_string())
    }

    fn finish(&mut self, install_update: bool) {
        let state = self.app.state::<AppState>();
        state.quitting.store(true, Ordering::SeqCst);
        if install_update {
            match state.updater.install() {
                Ok(()) => self.app.restart(),
                Err(error) => log::error!("{error}"),
            }
        }
        self.app.exit(0);
    }

    fn recover(&mut self) {
        self.app.state::<AppState>().tasks.resume_after_shutdown();
    }

    async fn on_failure(&mut self, error: String) -> ShutdownChoice {
        log::error!("Unable to complete shutdown: {error}");
        let result = dialogs::ask(
            &self.app,
            None,
            Message {
                title: "Unable to save before quitting",
                message: "Storage could not be saved. Free disk space or fix folder permissions, then retry. Previously saved \
                          data is preserved. Quit without saving discards unsaved edits and will not install an update.",
                kind: MessageDialogKind::Error,
                buttons: MessageDialogButtons::YesNoCancelCustom("Retry".into(), "Quit without saving".into(), "Cancel".into()),
            },
        )
        .await;
        match result {
            MessageDialogResult::Yes => ShutdownChoice::Retry,
            MessageDialogResult::No => ShutdownChoice::Quit,
            MessageDialogResult::Custom(label) if label == "Retry" => ShutdownChoice::Retry,
            MessageDialogResult::Custom(label) if label == "Quit without saving" => ShutdownChoice::Quit,
            _ => ShutdownChoice::Cancel,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Window and run-loop events

pub fn on_page_load<R: Runtime>(webview: &Webview<R>, payload: &PageLoadPayload<'_>) {
    let app = webview.app_handle();
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let label = webview.label().to_owned();
    match payload.event() {
        PageLoadEvent::Started => {
            let stopped_recording = {
                let mut registry = state.windows();
                let Some(record) = registry.get_mut(&label) else {
                    return;
                };
                record.loaded = false;
                record.subscribed = false;
                std::mem::take(&mut record.recording_shortcut)
            };
            if stopped_recording {
                menu::install(app);
            }
        }
        PageLoadEvent::Finished => {
            if let Some(record) = state.windows().get_mut(&label) {
                record.loaded = true;
            }
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

/// The window subscribed to events and can receive deep links and interruption requests.
pub fn window_ready<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Some(record) = app.state::<AppState>().windows().get_mut(label) {
        record.subscribed = true;
    }
    log::info!("Window bridge ready");
    deliver_deep_links(app);
    deliver_pending_interruptions(app, label);
}

pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    let app = window.app_handle();
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let label = window.label().to_owned();
    match event {
        WindowEvent::Focused(focused) => {
            let stopped_recording = {
                let mut registry = state.windows();
                registry.set_focused(&label, *focused);
                match registry.get_mut(&label) {
                    Some(record) if !focused => std::mem::take(&mut record.recording_shortcut),
                    _ => false,
                }
            };
            if stopped_recording {
                menu::install(app);
            }
        }
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => save_placement(app, &label),
        WindowEvent::CloseRequested { api, .. } => {
            save_placement(app, &label);
            let action = {
                let registry = state.windows();
                let Some(record) = registry.get(&label) else {
                    return;
                };
                close_action(
                    state.mac,
                    state.is(&state.quitting),
                    record.close_allowed,
                    registry.len() == 1,
                    !record.dirty_sources.is_empty(),
                )
            };
            match action {
                CloseAction::Allow => {}
                CloseAction::Quit => {
                    api.prevent_close();
                    request_quit(app);
                }
                CloseAction::Confirm => {
                    api.prevent_close();
                    let app_for_action = app.clone();
                    let target = label.clone();
                    let proceed: Proceed = Box::new(move || {
                        let state = app_for_action.state::<AppState>();
                        if let Some(record) = state.windows().get_mut(&target) {
                            record.close_allowed = true;
                        }
                        if let Some(window) = app_for_action.get_webview_window(&target) {
                            let _ = window.close();
                        }
                    });
                    request(app, &Scope::Window(label), InterruptionKind::CloseWindow, proceed);
                }
            }
        }
        WindowEvent::Destroyed => {
            let (empty, recording_changed) = {
                let mut registry = state.windows();
                let removed = registry.remove(&label);
                lock(&state.interruptions).set_dirty_sources(registry.dirty_sources());
                (registry.is_empty(), removed.is_some_and(|record| record.recording_shortcut))
            };
            if recording_changed {
                menu::install(app);
            }
            if empty && state.mac && !state.is(&state.quitting) {
                state.closing_last_window.store(true, Ordering::SeqCst);
            }
            if !state.is(&state.shutting_down) && !empty {
                schedule_session_save(app);
            }
        }
        _ => {}
    }
}

fn save_placement<R: Runtime>(app: &AppHandle<R>, label: &str) {
    let state = app.state::<AppState>();
    if state.is(&state.shutting_down) {
        return;
    }
    let Some(window) = app.get_webview_window(label) else {
        return;
    };
    let maximized = window.is_maximized().unwrap_or(false);
    let normal = windows::placement_of(&window);
    let placement = {
        let mut registry = state.windows();
        let Some(record) = registry.get_mut(label) else {
            return;
        };
        if let Some(normal) = normal {
            record.placement = normal;
        }
        record.placement.is_maximized = maximized;
        record.placement
    };
    state.placement.save(app, placement);
    schedule_session_save(app);
}

pub fn on_run_event<R: Runtime>(app: &AppHandle<R>, event: &RunEvent) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    match event {
        RunEvent::ExitRequested { api, code, .. } => {
            if state.is(&state.quitting) {
                return;
            }
            api.prevent_exit();
            // macOS keeps running without windows; the Dock icon reopens the workspace.
            if code.is_none() && state.closing_last_window.swap(false, Ordering::SeqCst) {
                return;
            }
            request_quit(app);
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { has_visible_windows, .. } if !has_visible_windows && state.is(&state.ready) => {
            show_workspace(app);
        }
        _ => {}
    }
}

pub fn session_of<R: Runtime>(app: &AppHandle<R>, label: &str) -> WindowSession {
    app.state::<AppState>().windows().get(label).map(|record| record.session.clone()).unwrap_or_default()
}
