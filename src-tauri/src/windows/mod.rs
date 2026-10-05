//! Window records, sessions, and placement. Windows are created in Rust so each has a stable identity.

pub mod geometry;
pub mod lifecycle;

use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use specta::Type;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use uuid::Uuid;

use self::geometry::{DEFAULT_WINDOW_STATE, MIN_HEIGHT, MIN_WIDTH, Rect, WindowState, normalize};
use crate::app_config::PRODUCT_NAME;
use crate::error::{AppError, AppResult, ResultExt};
use crate::interruption::InterruptionCoordinator;
use crate::storage::json_store::JsonStore;
use crate::storage::versions;

pub const LABEL_PREFIX: &str = "window-";
pub const ROUTES: [&str; 2] = ["/", "/settings"];

/// What a window shows. Restored with the window when `restoreWindows` is on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WindowSession {
    pub route: String,
    pub document_id: Option<Uuid>,
}

impl Default for WindowSession {
    fn default() -> Self {
        Self { route: ROUTES[0].to_owned(), document_id: None }
    }
}

/// Fields to change. `documentId: null` clears the document; an absent field keeps it.
#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowSessionPatch {
    #[serde(default)]
    #[specta(optional)]
    pub route: Option<String>,
    #[serde(default, deserialize_with = "present")]
    #[specta(optional, type = Option<Uuid>)]
    #[allow(clippy::option_option, reason = "distinguishes an absent field from an explicit null")]
    pub document_id: Option<Option<Uuid>>,
}

#[allow(clippy::option_option, reason = "distinguishes an absent field from an explicit null")]
fn present<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Option<Uuid>>, D::Error> {
    Option::<Uuid>::deserialize(deserializer).map(Some)
}

impl WindowSession {
    pub fn apply(&mut self, patch: WindowSessionPatch) -> AppResult<()> {
        if let Some(route) = patch.route {
            if !ROUTES.contains(&route.as_str()) {
                return Err(AppError::invalid("Unknown application route."));
            }
            self.route = route;
        }
        if let Some(document_id) = patch.document_id {
            self.document_id = document_id;
        }
        Ok(())
    }
}

/// A window saved for the next launch.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedWindow {
    pub id: Uuid,
    #[serde(flatten)]
    pub session: WindowSession,
    #[serde(flatten)]
    pub placement: WindowState,
}

impl SavedWindow {
    /// Unknown routes restore to the workspace, as older sessions may reference removed pages.
    pub fn parse(data: &str) -> Option<Self> {
        let mut saved: Self = serde_json::from_str(data).ok()?;
        if !ROUTES.contains(&saved.session.route.as_str()) {
            ROUTES[0].clone_into(&mut saved.session.route);
        }
        Some(saved)
    }
}

#[allow(clippy::struct_excessive_bools, reason = "independent facts about one window's lifecycle")]
pub struct WindowRecord {
    pub id: Uuid,
    pub loaded: bool,
    pub subscribed: bool,
    pub session: WindowSession,
    pub dirty_sources: Vec<String>,
    pub close_allowed: bool,
    pub recording_shortcut: bool,
    pub placement: WindowState,
    pub interruptions: InterruptionCoordinator,
}

impl WindowRecord {
    pub fn ready(&self) -> bool {
        self.loaded && self.subscribed
    }
}

#[derive(Default)]
pub struct WindowRegistry {
    records: Vec<(String, WindowRecord)>,
    last_focused: Option<String>,
    focused: Option<String>,
}

impl WindowRegistry {
    pub fn add(&mut self, label: String, record: WindowRecord) {
        self.last_focused = Some(label.clone());
        self.records.push((label, record));
    }

    pub fn remove(&mut self, label: &str) -> Option<WindowRecord> {
        let index = self.records.iter().position(|(entry, _)| entry == label)?;
        if self.focused.as_deref() == Some(label) {
            self.focused = None;
        }
        Some(self.records.remove(index).1)
    }

    pub fn get(&self, label: &str) -> Option<&WindowRecord> {
        self.records.iter().find(|(entry, _)| entry == label).map(|(_, record)| record)
    }

    pub fn get_mut(&mut self, label: &str) -> Option<&mut WindowRecord> {
        self.records.iter_mut().find(|(entry, _)| entry == label).map(|(_, record)| record)
    }

    pub fn len(&self) -> usize {
        self.records.len()
    }

    pub fn is_empty(&self) -> bool {
        self.records.is_empty()
    }

    pub fn records(&self) -> impl Iterator<Item = (&str, &WindowRecord)> {
        self.records.iter().map(|(label, record)| (label.as_str(), record))
    }

    pub fn set_focused(&mut self, label: &str, focused: bool) {
        if focused {
            self.focused = Some(label.to_owned());
            self.last_focused = Some(label.to_owned());
        } else if self.focused.as_deref() == Some(label) {
            self.focused = None;
        }
    }

    pub fn any_focused(&self) -> bool {
        self.focused.is_some()
    }

    /// The focused window, else the last focused, else the newest.
    pub fn current(&self) -> Option<String> {
        [self.focused.as_ref(), self.last_focused.as_ref()]
            .into_iter()
            .flatten()
            .find(|label| self.get(label).is_some())
            .cloned()
            .or_else(|| self.records.last().map(|(label, _)| label.clone()))
    }

    pub fn is_ready(&self, label: &str) -> bool {
        self.get(label).is_some_and(WindowRecord::ready)
    }

    pub fn dirty_sources(&self) -> Vec<String> {
        self.records.iter().flat_map(|(_, record)| record.dirty_sources.iter().cloned()).collect()
    }

    pub fn recording(&self) -> bool {
        self.records.iter().any(|(_, record)| record.recording_shortcut)
    }

    pub fn snapshot(&self) -> Vec<SavedWindow> {
        self.records
            .iter()
            .map(|(_, record)| SavedWindow {
                id: record.id,
                session: record.session.clone(),
                placement: record.placement,
            })
            .collect()
    }
}

/// The placement for new windows, written 250 ms after the last move or resize.
pub struct PlacementStore {
    store: JsonStore,
    pending: Mutex<Option<WindowState>>,
    generation: AtomicU64,
}

impl PlacementStore {
    pub fn new(profile: &std::path::Path) -> Self {
        Self {
            store: JsonStore::new(profile, "window-state"),
            pending: Mutex::new(None),
            generation: AtomicU64::new(0),
        }
    }

    pub fn load(&self) -> Option<WindowState> {
        let value = self.store.read().ok().flatten()?;
        serde_json::from_value(value.get("windowState").cloned().unwrap_or(Value::Null)).ok()
    }

    pub fn save<R: Runtime>(&self, app: &AppHandle<R>, state: WindowState) {
        *self.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Some(state);
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(250)).await;
            let store = &app.state::<crate::state::AppState>().placement;
            if store.generation.load(Ordering::SeqCst) == generation {
                let _ = store.flush();
            }
        });
    }

    pub fn flush(&self) -> AppResult<()> {
        let pending = self.pending.lock().unwrap_or_else(std::sync::PoisonError::into_inner).take();
        let Some(state) = pending else { return Ok(()) };
        self.store
            .write(&serde_json::json!({ "schemaVersion": versions::WINDOW_STATE, "windowState": state }))
            .or_app(AppError::storage("Unable to save the window position."))
    }
}

pub fn label_for(id: Uuid) -> String {
    format!("{LABEL_PREFIX}{id}")
}

/// Work areas of every display in logical pixels.
pub fn displays<R: Runtime>(app: &AppHandle<R>) -> Vec<Rect> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let area = monitor.work_area();
            let scale = monitor.scale_factor();
            Rect {
                x: f64::from(area.position.x) / scale,
                y: f64::from(area.position.y) / scale,
                width: f64::from(area.size.width) / scale,
                height: f64::from(area.size.height) / scale,
            }
        })
        .collect()
}

/// The current normal (not maximized or minimized) placement, if the window reports one.
pub fn placement_of<R: Runtime>(window: &WebviewWindow<R>) -> Option<WindowState> {
    if window.is_minimized().unwrap_or(true) || window.is_maximized().unwrap_or(false) {
        return None;
    }
    let scale = window.scale_factor().ok()?;
    let position = window.outer_position().ok()?.to_logical::<f64>(scale);
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);
    Some(WindowState { x: position.x, y: position.y, width: size.width, height: size.height, is_maximized: false })
}

/// Build a window. It stays hidden until the page finishes loading.
pub fn build<R: Runtime>(
    app: &AppHandle<R>,
    id: Uuid,
    placement: Option<WindowState>,
    dark: bool,
) -> AppResult<(String, WebviewWindow<R>, WindowState)> {
    let placement = normalize(placement.or(Some(DEFAULT_WINDOW_STATE)), &displays(app));
    let label = label_for(id);
    let background =
        if dark { tauri::window::Color(24, 24, 24, 255) } else { tauri::window::Color(255, 255, 255, 255) };
    let builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title(PRODUCT_NAME)
        .inner_size(placement.width, placement.height)
        .position(placement.x, placement.y)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .maximized(placement.is_maximized)
        .visible(false)
        .background_color(background)
        .on_new_window(crate::navigation::new_window_handler(app.clone()));
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        // Tao's Y inset adds to the native title-bar height; it is not Electron's top offset.
        // This centers the controls at 23 logical pixels, matching the 46px shell toolbar.
        .traffic_light_position(tauri::LogicalPosition::new(16.0, 25.0));
    #[cfg(not(target_os = "macos"))]
    let builder = builder.decorations(false).shadow(true);
    let window = builder.build()?;
    Ok((label, window, placement))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record() -> WindowRecord {
        WindowRecord {
            id: Uuid::new_v4(),
            loaded: true,
            subscribed: true,
            session: WindowSession::default(),
            dirty_sources: Vec::new(),
            close_allowed: false,
            recording_shortcut: false,
            placement: DEFAULT_WINDOW_STATE,
            interruptions: InterruptionCoordinator::default(),
        }
    }

    #[test]
    fn current_prefers_the_focused_then_last_focused_window() {
        let mut registry = WindowRegistry::default();
        registry.add("a".into(), record());
        registry.add("b".into(), record());
        registry.set_focused("a", true);
        assert_eq!(registry.current().as_deref(), Some("a"));
        registry.set_focused("a", false);
        assert_eq!(registry.current().as_deref(), Some("a"));
        registry.remove("a");
        assert_eq!(registry.current().as_deref(), Some("b"));
    }

    #[test]
    fn session_patches_validate_routes_and_distinguish_null() {
        let mut session = WindowSession { route: "/".into(), document_id: Some(Uuid::new_v4()) };
        let keep: WindowSessionPatch = serde_json::from_str(r#"{"route":"/settings"}"#).unwrap();
        session.apply(keep).unwrap();
        assert!(session.document_id.is_some());
        let clear: WindowSessionPatch = serde_json::from_str(r#"{"documentId":null}"#).unwrap();
        session.apply(clear).unwrap();
        assert_eq!(session, WindowSession { route: "/settings".into(), document_id: None });
        let bad: WindowSessionPatch = serde_json::from_str(r#"{"route":"/admin"}"#).unwrap();
        assert!(session.apply(bad).is_err());
        assert!(serde_json::from_str::<WindowSessionPatch>(r#"{"other":1}"#).is_err());
    }

    #[test]
    fn saved_windows_round_trip_and_repair_routes() {
        let saved = SavedWindow {
            id: Uuid::new_v4(),
            session: WindowSession { route: "/removed".into(), document_id: None },
            placement: DEFAULT_WINDOW_STATE,
        };
        let parsed = SavedWindow::parse(&serde_json::to_string(&saved).unwrap()).unwrap();
        assert_eq!(parsed.session.route, "/");
        assert_eq!(parsed.placement, DEFAULT_WINDOW_STATE);
    }
}
