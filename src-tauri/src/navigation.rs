//! The webview may only show the bundled application. External links open in the system browser.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime};
use tauri_plugin_opener::OpenerExt;
use url::Url;

#[derive(Debug, PartialEq, Eq)]
pub enum Navigation {
    Allow,
    OpenExternally,
    Block,
}

/// Decide what to do with a navigation. `dev_url` is set only in debug builds.
pub fn classify(url: &Url, dev_url: Option<&Url>) -> Navigation {
    if is_app_origin(url) || dev_url.is_some_and(|dev| same_origin(url, dev)) {
        return Navigation::Allow;
    }
    if is_external(url) {
        return Navigation::OpenExternally;
    }
    Navigation::Block
}

/// `tauri://localhost` on macOS and Linux, `http(s)://tauri.localhost` on Windows.
fn is_app_origin(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost") && url.port().is_none(),
        "http" | "https" => url.host_str() == Some("tauri.localhost") && url.port().is_none(),
        _ => false,
    }
}

fn same_origin(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme() && a.host_str() == b.host_str() && a.port_or_known_default() == b.port_or_known_default()
}

/// Only HTTPS without credentials and `mailto:` leave the app.
pub fn is_external(url: &Url) -> bool {
    match url.scheme() {
        "https" => url.username().is_empty() && url.password().is_none() && url.host_str().is_some(),
        "mailto" => true,
        _ => false,
    }
}

fn dev_url<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<Url> {
    if cfg!(debug_assertions) { app.config().build.dev_url.clone() } else { None }
}

/// Apply the policy to every webview in the application.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("navigation-guard")
        .on_navigation(|webview, url| {
            let app = webview.app_handle();
            match classify(url, dev_url(app).as_ref()) {
                Navigation::Allow => true,
                Navigation::OpenExternally => {
                    open_externally(app, url);
                    false
                }
                Navigation::Block => {
                    log::warn!("Blocked navigation to a {} URL", url.scheme());
                    false
                }
            }
        })
        .build()
}

/// New windows are never created from web content. HTTPS and mail links go to the system handler.
pub fn new_window_handler<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> impl Fn(Url, tauri::webview::NewWindowFeatures) -> tauri::webview::NewWindowResponse<R> + Send + 'static {
    move |url, _features| {
        if is_external(&url) {
            open_externally(&app, &url);
        } else {
            log::warn!("Blocked a new window for a {} URL", url.scheme());
        }
        tauri::webview::NewWindowResponse::Deny
    }
}

fn open_externally<R: Runtime>(app: &tauri::AppHandle<R>, url: &Url) {
    if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
        log::error!("Unable to open an external link: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    #[test]
    fn allows_only_the_bundled_origin() {
        assert_eq!(classify(&url("tauri://localhost/settings"), None), Navigation::Allow);
        assert_eq!(classify(&url("http://tauri.localhost/"), None), Navigation::Allow);
        assert_eq!(classify(&url("http://tauri.localhost:8080/"), None), Navigation::Block);
        assert_eq!(classify(&url("http://localhost:1420/"), None), Navigation::Block);
    }

    #[test]
    fn allows_the_exact_dev_server_in_debug_builds() {
        let dev = url("http://localhost:1420");
        assert_eq!(classify(&url("http://localhost:1420/settings"), Some(&dev)), Navigation::Allow);
        assert_eq!(classify(&url("http://localhost:1421/"), Some(&dev)), Navigation::Block);
    }

    #[test]
    fn opens_https_and_mail_externally() {
        assert_eq!(classify(&url("https://example.com/docs"), None), Navigation::OpenExternally);
        assert_eq!(classify(&url("mailto:someone@example.com"), None), Navigation::OpenExternally);
    }

    #[test]
    fn blocks_everything_else() {
        for value in [
            "http://example.com/",
            "https://user:secret@example.com/",
            "file:///etc/passwd",
            "data:text/html,<script>alert(1)</script>",
            "javascript:alert(1)",
            "tel:+1555",
        ] {
            assert_eq!(classify(&url(value), None), Navigation::Block, "{value}");
        }
    }
}
