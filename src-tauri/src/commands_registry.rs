//! Workspace commands shared by the native menu, toolbar, command palette, and shortcut settings.
//!
//! Rust owns the registry. It is exported to TypeScript as `COMMAND_REGISTRY`, so labels and default
//! bindings cannot drift between the menu and the web interface.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::app_config::SHOWCASE;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CommandId {
    NewWindow,
    Workspace,
    Settings,
    Shortcuts,
    ToggleSidebar,
    ToggleDetails,
    CommandPalette,
    About,
    Share,
    ImportText,
    ExportText,
    SaveSession,
    HashFile,
    ZoomIn,
    ZoomOut,
    ZoomReset,
    CheckUpdates,
    CopyDiagnostics,
    OpenLogs,
    Reload,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
pub enum CommandGroup {
    Workspace,
    Application,
    Documents,
    Appearance,
    Development,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct CommandSpec {
    pub id: CommandId,
    pub label: &'static str,
    pub group: CommandGroup,
    pub binding: Option<&'static str>,
}

const fn spec(id: CommandId, label: &'static str, group: CommandGroup, binding: Option<&'static str>) -> CommandSpec {
    CommandSpec { id, label, group, binding }
}

/// Registry order is display order in menus and the command palette.
pub const COMMANDS: [CommandSpec; 20] = {
    use CommandGroup::{Appearance, Application, Development, Documents, Workspace};
    use CommandId as C;
    [
        spec(C::NewWindow, "New Window", Workspace, Some("Mod+N")),
        spec(C::Workspace, "Workspace", Workspace, Some("Mod+1")),
        spec(C::Settings, "Settings…", Workspace, Some("Mod+,")),
        spec(C::Shortcuts, "Keyboard shortcuts", Workspace, None),
        spec(C::ToggleSidebar, "Toggle sidebar", Workspace, None),
        spec(C::ToggleDetails, "Toggle details", Workspace, Some("Mod+J")),
        spec(C::CommandPalette, "Search commands…", Workspace, Some("Mod+K")),
        spec(C::About, "About", Application, None),
        spec(C::Share, "Share workspace", Application, None),
        spec(C::ImportText, "Import text…", Documents, Some("Mod+O")),
        spec(C::ExportText, "Export text…", Documents, Some("Mod+Shift+S")),
        spec(C::SaveSession, "Save document", Documents, Some("Mod+S")),
        spec(C::HashFile, "Choose file to hash", Documents, None),
        spec(C::ZoomIn, "Zoom in", Appearance, Some("Mod+Plus")),
        spec(C::ZoomOut, "Zoom out", Appearance, Some("Mod+-")),
        spec(C::ZoomReset, "Actual size", Appearance, Some("Mod+0")),
        spec(C::CheckUpdates, "Check for updates", Application, None),
        spec(C::CopyDiagnostics, "Copy diagnostics", Application, None),
        spec(C::OpenLogs, "Open logs", Application, None),
        spec(C::Reload, "Reload…", Development, Some("Mod+R")),
    ]
};

pub fn spec_of(id: CommandId) -> &'static CommandSpec {
    COMMANDS.iter().find(|spec| spec.id == id).unwrap_or(&COMMANDS[0])
}

pub type ShortcutOverrides = BTreeMap<CommandId, Option<String>>;

const SHOWCASE_COMMANDS: [CommandId; 5] =
    [CommandId::Share, CommandId::ImportText, CommandId::ExportText, CommandId::SaveSession, CommandId::HashFile];

pub fn command_available(id: CommandId, packaged: bool) -> bool {
    (id != CommandId::Reload || !packaged) && (SHOWCASE || !SHOWCASE_COMMANDS.contains(&id))
}

pub fn effective_binding(id: CommandId, overrides: &ShortcutOverrides) -> Option<String> {
    match overrides.get(&id) {
        Some(binding) => binding.clone(),
        None => spec_of(id).binding.map(str::to_owned),
    }
}

/// Convert a stored binding such as `Mod+Shift+S` to a native menu accelerator.
pub fn accelerator(binding: &str) -> String {
    binding
        .split('+')
        .map(|part| match part {
            "Mod" => "CmdOrCtrl",
            "Plus" => "=",
            other => other,
        })
        .collect::<Vec<_>>()
        .join("+")
}

/// Normalize user input to the stored form, for example `cmd+shift+s` → `Mod+Shift+S` on macOS.
pub fn normalize_binding(raw: &str, mac: bool) -> AppResult<String> {
    let mut parts: Vec<&str> = raw.split('+').map(str::trim).collect();
    let key_raw = parts.pop().unwrap_or_default();
    let mut modifiers = BTreeSet::new();
    for part in parts {
        let lower = part.to_lowercase();
        let modifier = match lower.as_str() {
            "mod" | "commandorcontrol" | "cmdorctrl" => "Mod",
            "command" | "cmd" | "meta" if mac => "Mod",
            "control" | "ctrl" => {
                if mac {
                    "Ctrl"
                } else {
                    "Mod"
                }
            }
            "alt" | "option" => "Alt",
            "shift" => "Shift",
            _ => return Err(AppError::invalid("Unsupported modifier.")),
        };
        modifiers.insert(modifier);
    }
    let shifted = shifted_key(key_raw);
    if shifted.is_some() {
        modifiers.insert("Shift");
    }
    let key = match shifted {
        Some(base) => base.to_owned(),
        None => key_alias(&key_raw.to_lowercase()).map_or_else(|| key_raw.to_uppercase(), str::to_owned),
    };
    if !is_supported_key(&key) {
        return Err(AppError::invalid("Use a letter, number, punctuation, arrow, or function key."));
    }
    if !is_function_key(&key) && !["Mod", "Ctrl", "Alt"].iter().any(|modifier| modifiers.contains(modifier)) {
        return Err(AppError::invalid("Add Command, Ctrl, or Alt to this shortcut."));
    }
    if key == "Plus" {
        modifiers.remove("Shift");
    }
    let mut result: Vec<&str> =
        ["Mod", "Ctrl", "Alt", "Shift"].into_iter().filter(|modifier| modifiers.contains(modifier)).collect();
    result.push(&key);
    Ok(result.join("+"))
}

fn shifted_key(key: &str) -> Option<&'static str> {
    Some(match key {
        "!" => "1",
        "@" => "2",
        "#" => "3",
        "$" => "4",
        "%" => "5",
        "^" => "6",
        "&" => "7",
        "*" => "8",
        "(" => "9",
        ")" => "0",
        "_" => "-",
        "?" => "/",
        ":" => ";",
        "\"" => "'",
        "<" => ",",
        ">" => ".",
        "{" => "[",
        "}" => "]",
        "|" => "\\",
        "~" => "`",
        _ => return None,
    })
}

fn key_alias(lower: &str) -> Option<&'static str> {
    Some(match lower {
        "plus" | "equal" | "=" => "Plus",
        "space" => "Space",
        "up" | "arrowup" => "Up",
        "down" | "arrowdown" => "Down",
        "left" | "arrowleft" => "Left",
        "right" | "arrowright" => "Right",
        _ => return None,
    })
}

fn is_function_key(key: &str) -> bool {
    key.strip_prefix('F').and_then(|number| number.parse::<u8>().ok()).is_some_and(|number| (1..=24).contains(&number))
        && !key[1..].starts_with('0')
}

fn is_supported_key(key: &str) -> bool {
    let mut chars = key.chars();
    let single = match (chars.next(), chars.next()) {
        (Some(ch), None) => ch.is_ascii_uppercase() || ch.is_ascii_digit() || ",./;[]'\\`-".contains(ch),
        _ => false,
    };
    single || is_function_key(key) || matches!(key, "Plus" | "Space" | "Up" | "Down" | "Left" | "Right")
}

const RESERVED: [&str; 27] = [
    "Mod+C",
    "Mod+V",
    "Mod+Shift+V",
    "Mod+Alt+Shift+V",
    "Mod+Shift+W",
    "Mod+Shift+I",
    "Alt+T",
    "Mod+X",
    "Mod+A",
    "Mod+Z",
    "Mod+Shift+Z",
    "Mod+Y",
    "Mod+Q",
    "Mod+W",
    "Mod+M",
    "Mod+H",
    "Mod+Alt+H",
    "Mod+Ctrl+F",
    "Alt+F4",
    "Alt+Space",
    "Alt+Tab",
    "Mod+Tab",
    "Mod+Space",
    "Mod+Alt+I",
    "Ctrl+Alt+DELETE",
    "F11",
    "F12",
];

/// Normalize overrides and reject reserved or conflicting bindings among available commands.
pub fn validate_shortcuts(overrides: &ShortcutOverrides, mac: bool, packaged: bool) -> AppResult<ShortcutOverrides> {
    let mut normalized = ShortcutOverrides::new();
    for (id, value) in overrides {
        let binding = value.as_deref().map(|raw| normalize_binding(raw, mac)).transpose()?;
        normalized.insert(*id, binding);
    }
    let mut seen: HashMap<String, CommandId> = HashMap::new();
    for spec in &COMMANDS {
        if !command_available(spec.id, packaged) {
            continue;
        }
        let Some(binding) = effective_binding(spec.id, &normalized) else {
            continue;
        };
        if RESERVED.contains(&binding.as_str()) {
            return Err(AppError::invalid("This shortcut is reserved for a system or editing action."));
        }
        if let Some(conflict) = seen.get(&binding) {
            return Err(AppError::invalid(format!(
                "Already assigned to {} and {}. Clear one binding first.",
                spec_of(*conflict).label,
                spec.label
            )));
        }
        seen.insert(binding, spec.id);
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_lists_every_command_once() {
        let ids: BTreeSet<CommandId> = COMMANDS.iter().map(|spec| spec.id).collect();
        assert_eq!(ids.len(), COMMANDS.len());
    }

    #[test]
    fn normalizes_platform_modifiers() {
        assert_eq!(normalize_binding("cmd+shift+s", true).unwrap(), "Mod+Shift+S");
        assert_eq!(normalize_binding("ctrl+shift+s", false).unwrap(), "Mod+Shift+S");
        assert_eq!(normalize_binding("ctrl+k", true).unwrap(), "Ctrl+K");
        assert_eq!(normalize_binding("Mod+=", true).unwrap(), "Mod+Plus");
        assert_eq!(normalize_binding("Mod+Shift+Plus", true).unwrap(), "Mod+Plus");
        assert_eq!(normalize_binding("Mod+?", true).unwrap(), "Mod+Shift+/");
        assert_eq!(normalize_binding("F5", false).unwrap(), "F5");
        assert_eq!(normalize_binding("alt+arrowup", false).unwrap(), "Alt+Up");
    }

    #[test]
    fn rejects_unsafe_bindings() {
        assert!(normalize_binding("Hyper+K", true).is_err());
        assert!(normalize_binding("Shift+K", true).is_err());
        assert!(normalize_binding("Mod+Enter", true).is_err());
        assert!(normalize_binding("F25", true).is_err());
        assert!(normalize_binding("F05", true).is_err());
    }

    #[test]
    fn rejects_reserved_and_conflicting_shortcuts() {
        let reserved = ShortcutOverrides::from([(CommandId::About, Some("Mod+Q".into()))]);
        assert!(validate_shortcuts(&reserved, true, true).is_err());
        let conflict = ShortcutOverrides::from([(CommandId::About, Some("Mod+K".into()))]);
        let error = validate_shortcuts(&conflict, true, true).unwrap_err();
        assert!(error.to_string().contains("Search commands…"));
        let cleared =
            ShortcutOverrides::from([(CommandId::CommandPalette, None), (CommandId::About, Some("cmd+k".into()))]);
        assert_eq!(validate_shortcuts(&cleared, true, true).unwrap()[&CommandId::About].as_deref(), Some("Mod+K"));
    }

    #[test]
    fn packaged_builds_do_not_reserve_the_reload_shortcut() {
        let overrides = ShortcutOverrides::from([(CommandId::About, Some("Mod+R".into()))]);
        assert!(validate_shortcuts(&overrides, true, false).is_err());
        assert!(validate_shortcuts(&overrides, true, true).is_ok());
    }

    #[test]
    fn converts_bindings_to_accelerators() {
        assert_eq!(accelerator("Mod+Shift+S"), "CmdOrCtrl+Shift+S");
        assert_eq!(accelerator("Mod+Plus"), "CmdOrCtrl+=");
        assert_eq!(accelerator("Ctrl+Alt+K"), "Ctrl+Alt+K");
    }
}
