//! Automatic updates. Updates download in the background and install only through the quit flow.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Runtime};
use tauri_specta::Event;

use crate::error::{AppError, AppResult};
use crate::events::UpdateStateChanged;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum UpdateState {
    Idle,
    Checking,
    Downloading {
        #[serde(default)]
        percent: Option<f64>,
        #[serde(default)]
        version: Option<String>,
    },
    Ready {
        version: String,
    },
    Error {
        message: String,
    },
}

impl UpdateState {
    pub fn status(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Checking => "checking",
            Self::Downloading { .. } => "downloading",
            Self::Ready { .. } => "ready",
            Self::Error { .. } => "error",
        }
    }
}

#[cfg(desktop)]
type Downloaded = (tauri_plugin_updater::Update, Vec<u8>);
#[cfg(not(desktop))]
type Downloaded = ();

pub struct Updater {
    state: Mutex<UpdateState>,
    downloaded: Mutex<Option<Downloaded>>,
}

impl Default for Updater {
    fn default() -> Self {
        Self { state: Mutex::new(UpdateState::Idle), downloaded: Mutex::new(None) }
    }
}

/// Release builds with an updater public key can update. Development builds never do.
pub fn configured<R: Runtime>(app: &AppHandle<R>) -> bool {
    !cfg!(debug_assertions)
        && app
            .config()
            .plugins
            .0
            .get("updater")
            .and_then(|updater| updater.get("pubkey"))
            .and_then(serde_json::Value::as_str)
            .is_some_and(|key| !key.trim().is_empty())
}

impl Updater {
    pub fn state(&self) -> UpdateState {
        self.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner).clone()
    }

    fn set<R: Runtime>(&self, app: &AppHandle<R>, next: UpdateState) -> UpdateState {
        *self.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = next.clone();
        if let Err(error) = UpdateStateChanged(next.clone()).emit(app) {
            log::error!("Unable to send update state: {error}");
        }
        next
    }

    /// Check, then download any update. A manual check reports errors; an automatic check stays quiet.
    #[cfg(desktop)]
    pub async fn check<R: Runtime>(&self, app: &AppHandle<R>, manual: bool) -> UpdateState {
        use tauri_plugin_updater::UpdaterExt;

        if !configured(app) {
            return if manual {
                self.set(app, UpdateState::Error { message: "Updates are not configured for this build.".into() })
            } else {
                self.state()
            };
        }
        if matches!(self.state(), UpdateState::Checking | UpdateState::Downloading { .. } | UpdateState::Ready { .. }) {
            return self.state();
        }
        self.set(app, UpdateState::Checking);
        let update = match app.updater() {
            Ok(updater) => updater.check().await,
            Err(error) => Err(error),
        };
        let update = match update {
            Ok(Some(update)) => update,
            Ok(None) => return self.set(app, UpdateState::Idle),
            Err(error) => {
                log::error!("Update check failed: {error}");
                let next = if manual {
                    UpdateState::Error { message: "Unable to check for updates.".into() }
                } else {
                    UpdateState::Idle
                };
                return self.set(app, next);
            }
        };
        let version = update.version.clone();
        self.set(app, UpdateState::Downloading { percent: None, version: Some(version.clone()) });
        let mut received = 0_u64;
        let progress_app = app.clone();
        let download = update
            .download(
                |chunk, total| {
                    received += chunk as u64;
                    #[allow(clippy::cast_precision_loss)]
                    let percent = total.filter(|total| *total > 0).map(|total| received as f64 / total as f64 * 100.0);
                    let _ = UpdateStateChanged(UpdateState::Downloading { percent, version: None }).emit(&progress_app);
                },
                || {},
            )
            .await;
        match download {
            Ok(bytes) => {
                *self.downloaded.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Some((update, bytes));
                self.set(app, UpdateState::Ready { version })
            }
            Err(error) => {
                log::error!("Update download failed: {error}");
                self.set(app, UpdateState::Error { message: "The update download failed.".into() })
            }
        }
    }

    #[cfg(not(desktop))]
    pub async fn check<R: Runtime>(&self, _app: &AppHandle<R>, _manual: bool) -> UpdateState {
        self.state()
    }

    pub fn is_ready(&self) -> bool {
        matches!(self.state(), UpdateState::Ready { .. })
    }

    /// Install the downloaded update. The caller restarts the application afterwards.
    #[cfg(desktop)]
    pub fn install(&self) -> AppResult<()> {
        let downloaded = self.downloaded.lock().unwrap_or_else(std::sync::PoisonError::into_inner).take();
        let (update, bytes) = downloaded.ok_or_else(|| AppError::invalid("No downloaded update is ready."))?;
        update.install(bytes).map_err(|error| {
            log::error!("Update install failed: {error}");
            AppError::unavailable("The update could not be installed.")
        })
    }

    #[cfg(not(desktop))]
    pub fn install(&self) -> AppResult<()> {
        Err(AppError::unavailable("Updates are not supported on this platform."))
    }
}
