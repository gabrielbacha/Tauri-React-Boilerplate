//! State shared by commands, window events, and the run loop.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use tauri::{Runtime, WebviewWindow};
use uuid::Uuid;

use crate::database::Database;
use crate::deep_links::DeepLinkQueue;
use crate::error::{AppError, AppResult};
use crate::interruption::InterruptionCoordinator;
use crate::permissions::PermissionBroker;
use crate::preferences::PreferencesStore;
use crate::tasks::{CompletionTracker, TaskManager, TaskPersistence};
use crate::updater::Updater;
use crate::windows::{PlacementStore, SavedWindow, WindowRegistry};

pub struct AppState {
    pub profile: PathBuf,
    pub mac: bool,
    pub packaged: bool,
    pub preferences: PreferencesStore,
    pub permissions: PermissionBroker,
    pub database: Arc<Database>,
    pub tasks: Arc<TaskManager>,
    pub updater: Updater,
    pub placement: PlacementStore,
    pub windows: Mutex<WindowRegistry>,
    /// Quit and update-restart requests, which span every window.
    pub interruptions: Mutex<InterruptionCoordinator>,
    pub deep_links: Mutex<DeepLinkQueue>,
    pub completion: Mutex<CompletionTracker>,
    /// The last saved window session, kept for shutdown when every window has already closed.
    pub last_session: Mutex<Vec<SavedWindow>>,
    pub session_generation: AtomicU64,
    pub ready: AtomicBool,
    pub quitting: AtomicBool,
    pub shutting_down: AtomicBool,
    /// Set when the last macOS window closes, so the following exit request keeps the app running.
    pub closing_last_window: AtomicBool,
}

pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl AppState {
    pub fn windows(&self) -> MutexGuard<'_, WindowRegistry> {
        lock(&self.windows)
    }

    /// Commands answer only windows this process created. Capabilities already limit callers to them.
    pub fn caller<R: Runtime>(&self, window: &WebviewWindow<R>) -> AppResult<String> {
        let label = window.label().to_owned();
        if self.windows().get(&label).is_none() {
            return Err(AppError::invalid("Rejected a request from an unknown window."));
        }
        Ok(label)
    }

    pub fn is(&self, flag: &AtomicBool) -> bool {
        flag.load(Ordering::SeqCst)
    }
}

/// Jobs persist in SQLite beside documents.
pub struct DatabaseJobs(pub Arc<Database>);

impl TaskPersistence for DatabaseJobs {
    fn load_jobs(&self) -> AppResult<Vec<String>> {
        self.0.load_jobs()
    }

    fn save_jobs(&self, jobs: &[(Uuid, String)]) -> AppResult<()> {
        self.0.save_jobs(jobs)
    }
}
