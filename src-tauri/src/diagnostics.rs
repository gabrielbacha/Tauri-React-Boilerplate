//! A sanitized snapshot for support requests: no paths, logs, URLs, or document content.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Runtime};

use crate::app_config::{DESCRIPTION, PRODUCT_NAME, PROTOCOL};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub description: String,
    pub name: String,
    pub version: String,
    /// Node-style platform names (`darwin`, `win32`, `linux`) for parity with web tooling.
    pub platform: String,
    pub arch: String,
    pub packaged: bool,
    pub protocol: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeVersions {
    pub tauri: String,
    pub webview: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum WebviewHealth {
    Healthy,
    Loading,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsSnapshot {
    pub app: AppInfo,
    pub versions: RuntimeVersions,
    pub update_status: String,
    pub protocol_registered: bool,
    pub webview_health: WebviewHealth,
}

pub fn platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    }
}

pub fn arch() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        "x86" => "ia32",
        other => other,
    }
}

pub fn app_info<R: Runtime>(app: &AppHandle<R>) -> AppInfo {
    AppInfo {
        description: DESCRIPTION.to_owned(),
        name: PRODUCT_NAME.to_owned(),
        version: app.package_info().version.to_string(),
        platform: platform().to_owned(),
        arch: arch().to_owned(),
        packaged: !cfg!(debug_assertions),
        protocol: PROTOCOL.to_owned(),
    }
}

/// Whether the operating system sends `<protocol>://` links to this app.
pub fn protocol_registered<R: Runtime>(app: &AppHandle<R>) -> bool {
    #[cfg(desktop)]
    {
        use tauri_plugin_deep_link::DeepLinkExt;
        // macOS registers schemes from Info.plist at install time and cannot be queried here.
        app.deep_link().is_registered(PROTOCOL).unwrap_or(cfg!(target_os = "macos") && !cfg!(debug_assertions))
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        false
    }
}

pub fn snapshot<R: Runtime>(app: &AppHandle<R>, update_status: &str, loaded: bool) -> DiagnosticsSnapshot {
    DiagnosticsSnapshot {
        app: app_info(app),
        versions: RuntimeVersions {
            tauri: tauri::VERSION.to_owned(),
            webview: tauri::webview_version().unwrap_or_else(|_| "unknown".to_owned()),
        },
        update_status: update_status.to_owned(),
        protocol_registered: protocol_registered(app),
        webview_health: if loaded { WebviewHealth::Healthy } else { WebviewHealth::Loading },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_node_style_platform_names() {
        assert!(["darwin", "win32", "linux"].contains(&platform()));
        assert!(["arm64", "x64"].contains(&arch()));
    }
}
