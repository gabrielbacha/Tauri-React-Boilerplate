use serde_json::{Map, Value};

use super::{AppPreferences, MotionPreference, ThemeMode, valid_zoom};
use crate::commands_registry::{COMMANDS, CommandId, ShortcutOverrides};

/// Drop obsolete shortcut keys without discarding unrelated saved preferences.
pub fn with_known_shortcuts(stored: &Value) -> Value {
    let mut stored = stored.clone();
    if let Some(shortcuts) = stored.get_mut("shortcuts").and_then(Value::as_object_mut) {
        shortcuts.retain(|id, _| is_known_command(id));
    }
    stored
}

fn is_known_command(id: &str) -> bool {
    serde_json::from_value::<CommandId>(Value::String(id.to_owned()))
        .is_ok_and(|command| COMMANDS.iter().any(|spec| spec.id == command))
}

/// Salvage each field from an older or damaged document. Anything unreadable takes its default.
pub fn migrate(stored: Option<&Value>) -> AppPreferences {
    let defaults = AppPreferences::default();
    let Some(legacy) = stored.and_then(Value::as_object) else {
        return defaults;
    };
    let field = |name: &str| legacy.get(name).cloned();
    AppPreferences {
        shortcuts: shortcuts(legacy),
        zoom: field("zoom").and_then(|value| value.as_f64()).filter(|zoom| valid_zoom(*zoom)).unwrap_or(defaults.zoom),
        motion: parse(legacy, "motion").unwrap_or(MotionPreference::System),
        theme: parse(legacy, "theme").unwrap_or(ThemeMode::System),
        sidebar_collapsed: field("sidebarCollapsed").and_then(|value| value.as_bool()).unwrap_or(false),
        check_for_updates_automatically: field("checkForUpdatesAutomatically")
            .and_then(|value| value.as_bool())
            .unwrap_or(defaults.check_for_updates_automatically),
        restore_windows: field("restoreWindows").and_then(|value| value.as_bool()).unwrap_or(false),
    }
}

fn parse<T: serde::de::DeserializeOwned>(legacy: &Map<String, Value>, name: &str) -> Option<T> {
    legacy.get(name).cloned().and_then(|value| serde_json::from_value(value).ok())
}

fn shortcuts(legacy: &Map<String, Value>) -> ShortcutOverrides {
    let Some(Value::Object(entries)) = legacy.get("shortcuts") else {
        return ShortcutOverrides::new();
    };
    let known: Map<String, Value> =
        entries.iter().filter(|(id, _)| is_known_command(id)).map(|(id, value)| (id.clone(), value.clone())).collect();
    serde_json::from_value(Value::Object(known)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn keeps_valid_fields_from_older_documents() {
        let migrated = migrate(Some(&json!({
            "theme": "dark",
            "zoom": 1.1,
            "shortcuts": { "about": "Mod+Shift+A", "obsolete": "Mod+P" },
            "sidebarCollapsed": "yes",
            "checkForUpdatesAutomatically": false
        })));
        assert_eq!(migrated.theme, ThemeMode::Dark);
        assert!((migrated.zoom - 1.1).abs() < f64::EPSILON);
        assert_eq!(migrated.shortcuts.len(), 1);
        assert!(!migrated.sidebar_collapsed);
        assert!(!migrated.check_for_updates_automatically);
    }

    #[test]
    fn replaces_invalid_fields_with_defaults() {
        let migrated = migrate(Some(&json!({ "theme": "sepia", "zoom": 7, "motion": 3, "shortcuts": [] })));
        assert_eq!(migrated, AppPreferences::default());
        assert_eq!(migrate(Some(&json!("broken"))), AppPreferences::default());
        assert_eq!(migrate(None), AppPreferences::default());
    }

    #[test]
    fn drops_unknown_shortcut_keys_only() {
        let value = with_known_shortcuts(&json!({ "theme": "dark", "shortcuts": { "about": null, "gone": "Mod+G" } }));
        assert_eq!(value, json!({ "theme": "dark", "shortcuts": { "about": null } }));
    }
}
