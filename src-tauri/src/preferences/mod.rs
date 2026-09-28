//! Application preferences. Rust validates and stores them; windows receive `PreferencesChanged`.

pub mod migrations;

use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

use crate::commands_registry::{ShortcutOverrides, validate_shortcuts};
use crate::error::{AppError, AppResult, ResultExt};
use crate::storage::json_store::JsonStore;
use crate::storage::versions;

pub const ZOOM_LEVELS: [f64; 6] = [0.8, 0.9, 1.0, 1.1, 1.25, 1.5];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum MotionPreference {
    System,
    Reduced,
    Full,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    pub shortcuts: ShortcutOverrides,
    pub zoom: f64,
    pub motion: MotionPreference,
    pub theme: ThemeMode,
    pub sidebar_collapsed: bool,
    pub check_for_updates_automatically: bool,
    pub restore_windows: bool,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            shortcuts: ShortcutOverrides::new(),
            zoom: 1.0,
            motion: MotionPreference::System,
            theme: ThemeMode::System,
            sidebar_collapsed: false,
            check_for_updates_automatically: true,
            restore_windows: false,
        }
    }
}

/// Fields to change. Shortcuts change through the dedicated shortcut commands.
#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreferencesPatch {
    #[specta(optional)]
    pub zoom: Option<f64>,
    #[specta(optional)]
    pub motion: Option<MotionPreference>,
    #[specta(optional)]
    pub theme: Option<ThemeMode>,
    #[specta(optional)]
    pub sidebar_collapsed: Option<bool>,
    #[specta(optional)]
    pub check_for_updates_automatically: Option<bool>,
    #[specta(optional)]
    pub restore_windows: Option<bool>,
}

/// Interface settings that older frontends kept in `localStorage`.
#[derive(Debug, Clone, Deserialize, Type)]
pub struct LegacyInterfacePreferences {
    pub zoom: f64,
    pub motion: MotionPreference,
}

pub fn valid_zoom(zoom: f64) -> bool {
    ZOOM_LEVELS.iter().any(|level| (level - zoom).abs() < f64::EPSILON)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPreferences {
    schema_version: u32,
    interface_migrated: bool,
    preferences: AppPreferences,
}

pub struct PreferencesStore {
    store: JsonStore,
    mac: bool,
    packaged: bool,
    current: Mutex<StoredPreferences>,
}

impl PreferencesStore {
    /// Load, migrate, and repair stored preferences. Invalid shortcut sets are cleared, not fatal.
    pub fn open(profile: &Path, mac: bool, packaged: bool) -> AppResult<Self> {
        let store = JsonStore::new(profile, "preferences");
        let raw = store.read().or_app(AppError::storage("Unable to read preferences."))?;
        let mut stored = load(raw.as_ref());
        let original = stored.clone();
        if let Ok(shortcuts) = validate_shortcuts(&stored.preferences.shortcuts, mac, packaged) {
            stored.preferences.shortcuts = shortcuts;
        } else {
            stored.preferences.shortcuts = ShortcutOverrides::new();
        }
        if stored != original || raw.as_ref() != serde_json::to_value(&stored).ok().as_ref() {
            store.write(&stored).or_app(AppError::storage("Unable to save preferences."))?;
        }
        Ok(Self { store, mac, packaged, current: Mutex::new(stored) })
    }

    pub fn get(&self) -> AppPreferences {
        self.lock().preferences.clone()
    }

    pub fn update(&self, patch: PreferencesPatch) -> AppResult<AppPreferences> {
        if patch.zoom.is_some_and(|zoom| !valid_zoom(zoom)) {
            return Err(AppError::invalid("Choose a supported zoom level."));
        }
        self.write(|stored| {
            let preferences = &mut stored.preferences;
            if let Some(zoom) = patch.zoom {
                preferences.zoom = zoom;
            }
            if let Some(motion) = patch.motion {
                preferences.motion = motion;
            }
            if let Some(theme) = patch.theme {
                preferences.theme = theme;
            }
            if let Some(collapsed) = patch.sidebar_collapsed {
                preferences.sidebar_collapsed = collapsed;
            }
            if let Some(automatic) = patch.check_for_updates_automatically {
                preferences.check_for_updates_automatically = automatic;
            }
            if let Some(restore) = patch.restore_windows {
                preferences.restore_windows = restore;
            }
            Ok(())
        })
    }

    pub fn set_shortcuts(&self, shortcuts: &ShortcutOverrides) -> AppResult<AppPreferences> {
        let validated = validate_shortcuts(shortcuts, self.mac, self.packaged)?;
        self.write(|stored| {
            stored.preferences.shortcuts = validated;
            Ok(())
        })
    }

    pub fn reset(&self) -> AppResult<AppPreferences> {
        self.write(|stored| {
            stored.preferences = AppPreferences::default();
            stored.interface_migrated = true;
            Ok(())
        })
    }

    /// Import interface settings from `localStorage` once. Later calls return the current preferences.
    pub fn migrate_interface(&self, legacy: LegacyInterfacePreferences) -> AppResult<AppPreferences> {
        if self.lock().interface_migrated {
            return Ok(self.get());
        }
        if !valid_zoom(legacy.zoom) {
            return Err(AppError::invalid("Choose a supported zoom level."));
        }
        self.write(|stored| {
            stored.preferences.zoom = legacy.zoom;
            stored.preferences.motion = legacy.motion;
            stored.interface_migrated = true;
            Ok(())
        })
    }

    /// Apply a change and persist it. Memory changes only after the file write succeeds.
    fn write(&self, change: impl FnOnce(&mut StoredPreferences) -> AppResult<()>) -> AppResult<AppPreferences> {
        let mut current = self.lock();
        let mut next = current.clone();
        change(&mut next)?;
        self.store.write(&next).or_app(AppError::storage("Unable to save preferences."))?;
        *current = next;
        Ok(current.preferences.clone())
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, StoredPreferences> {
        self.current.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

fn load(raw: Option<&Value>) -> StoredPreferences {
    let Some(raw) = raw else {
        return StoredPreferences {
            schema_version: versions::PREFERENCES,
            interface_migrated: false,
            preferences: AppPreferences::default(),
        };
    };
    let interface_migrated = raw.get("interfaceMigrated").and_then(Value::as_bool).unwrap_or(false);
    let current = raw.get("schemaVersion").and_then(Value::as_u64) == Some(u64::from(versions::PREFERENCES));
    let preferences = raw.get("preferences").map(migrations::with_known_shortcuts).and_then(|candidate| {
        if current { serde_json::from_value::<AppPreferences>(candidate).ok().filter(is_valid) } else { None }
    });
    StoredPreferences {
        schema_version: versions::PREFERENCES,
        interface_migrated,
        preferences: preferences.unwrap_or_else(|| migrations::migrate(raw.get("preferences"))),
    }
}

fn is_valid(preferences: &AppPreferences) -> bool {
    valid_zoom(preferences.zoom)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::commands_registry::CommandId;

    fn open(profile: &Path) -> PreferencesStore {
        PreferencesStore::open(profile, true, true).unwrap()
    }

    #[test]
    fn creates_defaults_on_first_launch() {
        let profile = tempfile::tempdir().unwrap();
        assert_eq!(open(profile.path()).get(), AppPreferences::default());
        let saved: Value =
            serde_json::from_slice(&std::fs::read(profile.path().join("preferences.json")).unwrap()).unwrap();
        assert_eq!(saved["schemaVersion"], json!(versions::PREFERENCES));
    }

    #[test]
    fn persists_updates_and_rejects_invalid_zoom() {
        let profile = tempfile::tempdir().unwrap();
        let store = open(profile.path());
        store.update(PreferencesPatch { theme: Some(ThemeMode::Dark), ..Default::default() }).unwrap();
        assert!(store.update(PreferencesPatch { zoom: Some(1.3), ..Default::default() }).is_err());
        assert_eq!(open(profile.path()).get().theme, ThemeMode::Dark);
    }

    #[test]
    fn clears_invalid_saved_shortcuts_without_losing_other_preferences() {
        let profile = tempfile::tempdir().unwrap();
        std::fs::write(
            profile.path().join("preferences.json"),
            json!({
                "schemaVersion": versions::PREFERENCES,
                "interfaceMigrated": true,
                "preferences": {
                    "shortcuts": { "about": "Mod+K", "removedCommand": "Mod+P" },
                    "zoom": 1.25, "motion": "full", "theme": "light",
                    "sidebarCollapsed": true, "checkForUpdatesAutomatically": false, "restoreWindows": true
                }
            })
            .to_string(),
        )
        .unwrap();
        let preferences = open(profile.path()).get();
        assert!(preferences.shortcuts.is_empty(), "conflict with the command palette clears overrides");
        assert!((preferences.zoom - 1.25).abs() < f64::EPSILON);
        assert!(preferences.restore_windows);
    }

    #[test]
    fn validates_shortcut_changes() {
        let profile = tempfile::tempdir().unwrap();
        let store = open(profile.path());
        let conflict = ShortcutOverrides::from([(CommandId::About, Some("Mod+K".into()))]);
        assert!(store.set_shortcuts(&conflict).is_err());
        let valid = ShortcutOverrides::from([(CommandId::About, Some("cmd+shift+a".into()))]);
        assert_eq!(store.set_shortcuts(&valid).unwrap().shortcuts[&CommandId::About].as_deref(), Some("Mod+Shift+A"));
    }

    #[test]
    fn migrates_interface_preferences_once() {
        let profile = tempfile::tempdir().unwrap();
        let store = open(profile.path());
        let legacy = LegacyInterfacePreferences { zoom: 1.1, motion: MotionPreference::Reduced };
        assert_eq!(store.migrate_interface(legacy.clone()).unwrap().motion, MotionPreference::Reduced);
        store.update(PreferencesPatch { motion: Some(MotionPreference::Full), ..Default::default() }).unwrap();
        assert_eq!(store.migrate_interface(legacy).unwrap().motion, MotionPreference::Full);
    }
}
