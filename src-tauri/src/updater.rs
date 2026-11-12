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

struct UpdateInner {
    state: UpdateState,
    downloaded: Option<Downloaded>,
}
pub struct Updater {
    inner: Mutex<UpdateInner>,
    operation: tokio::sync::Mutex<()>,
}
impl Default for Updater {
    fn default() -> Self {
        Self {
            inner: Mutex::new(UpdateInner { state: UpdateState::Idle, downloaded: None }),
            operation: tokio::sync::Mutex::new(()),
        }
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
        self.inner.lock().unwrap_or_else(std::sync::PoisonError::into_inner).state.clone()
    }

    fn set<R: Runtime>(&self, app: &AppHandle<R>, next: UpdateState) -> UpdateState {
        let next = self.commit_state(next);
        if let Err(error) = UpdateStateChanged(next.clone()).emit(app) {
            log::error!("Unable to send update state: {error}");
        }
        next
    }

    fn commit_state(&self, next: UpdateState) -> UpdateState {
        let mut inner = self.inner.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if matches!(inner.state, UpdateState::Ready { .. }) && !matches!(next, UpdateState::Ready { .. }) {
            return inner.state.clone();
        }
        inner.state = next.clone();
        next
    }

    /// Check, then download any update. A manual check reports errors; an automatic check stays quiet.
    #[cfg(desktop)]
    pub async fn check<R: Runtime>(&self, app: &AppHandle<R>, manual: bool) -> UpdateState {
        self.shared_operation(|| self.perform_check(app, manual)).await
    }
    async fn shared_operation<F, Fut>(&self, action: F) -> UpdateState
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = UpdateState>,
    {
        let Ok(_operation) = self.operation.try_lock() else {
            let _joined = self.operation.lock().await;
            return self.state();
        };
        action().await
    }
    #[cfg(desktop)]
    async fn perform_check<R: Runtime>(&self, app: &AppHandle<R>, manual: bool) -> UpdateState {
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
                    received = received.saturating_add(u64::try_from(chunk).unwrap_or(u64::MAX));
                    #[allow(clippy::cast_precision_loss)]
                    let percent = total
                        .filter(|total| *total > 0)
                        .map(|total| (received as f64 / total as f64 * 100.0).clamp(0.0, 100.0));
                    self.set(&progress_app, UpdateState::Downloading { percent, version: Some(version.clone()) });
                },
                || {},
            )
            .await;
        match download {
            Ok(bytes) => {
                {
                    let mut inner = self.inner.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
                    inner.downloaded = Some((update, bytes));
                    inner.state = UpdateState::Ready { version: version.clone() };
                }
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
        let inner = self.inner.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        matches!(inner.state, UpdateState::Ready { .. }) && inner.downloaded.is_some()
    }

    /// Install the downloaded update. The caller restarts the application afterwards.
    #[cfg(desktop)]
    pub fn install(&self) -> AppResult<()> {
        let downloaded = self.inner.lock().unwrap_or_else(std::sync::PoisonError::into_inner).downloaded.take();
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    #[test]
    fn retained_progress_keeps_version_and_ready_cannot_be_replaced_by_a_late_error() {
        let updater = Updater::default();
        let progress = UpdateState::Downloading { version: Some("2.0".into()), percent: Some(35.0) };
        updater.commit_state(progress.clone());
        assert_eq!(updater.state(), progress);
        let ready = UpdateState::Ready { version: "2.0".into() };
        updater.commit_state(ready.clone());
        updater.commit_state(UpdateState::Error { message: "late".into() });
        assert_eq!(updater.state(), ready);
    }
    #[tokio::test]
    async fn simultaneous_checks_join_the_same_operation_even_when_no_update_is_found() {
        let updater = Updater::default();
        let count = AtomicUsize::new(0);
        let first = updater.shared_operation(|| async {
            count.fetch_add(1, Ordering::SeqCst);
            tokio::task::yield_now().await;
            UpdateState::Idle
        });
        let second = updater.shared_operation(|| async {
            count.fetch_add(1, Ordering::SeqCst);
            UpdateState::Idle
        });
        let (a, b) = tokio::join!(first, second);
        assert_eq!(a, UpdateState::Idle);
        assert_eq!(b, UpdateState::Idle);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }
    #[tokio::test]
    async fn overlapping_checks_share_check_and_download_and_a_new_window_reads_latest_progress() {
        let updater = Updater::default();
        let checks = AtomicUsize::new(0);
        let downloads = AtomicUsize::new(0);
        let progress_reached = tokio::sync::Notify::new();
        let release_download = tokio::sync::Notify::new();
        let first = updater.shared_operation(|| async {
            checks.fetch_add(1, Ordering::SeqCst);
            updater.commit_state(UpdateState::Checking);
            downloads.fetch_add(1, Ordering::SeqCst);
            updater
                .commit_state(UpdateState::Downloading { percent: Some(35.0), version: Some("generated-2.0".into()) });
            progress_reached.notify_one();
            release_download.notified().await;
            updater.commit_state(UpdateState::Ready { version: "generated-2.0".into() })
        });
        let second = updater.shared_operation(|| async {
            checks.fetch_add(1, Ordering::SeqCst);
            downloads.fetch_add(1, Ordering::SeqCst);
            UpdateState::Error { message: "a second operation must not start".into() }
        });
        let opened_window = async {
            progress_reached.notified().await;
            assert_eq!(
                updater.state(),
                UpdateState::Downloading { percent: Some(35.0), version: Some("generated-2.0".into()) }
            );
            release_download.notify_one();
        };
        let (first, second, ()) = tokio::join!(first, second, opened_window);
        assert_eq!(first, UpdateState::Ready { version: "generated-2.0".into() });
        assert_eq!(second, first);
        assert_eq!(checks.load(Ordering::SeqCst), 1);
        assert_eq!(downloads.load(Ordering::SeqCst), 1);
        updater.commit_state(UpdateState::Error { message: "late generated failure".into() });
        assert_eq!(updater.state(), first);
    }
}
