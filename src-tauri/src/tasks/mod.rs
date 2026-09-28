//! A bounded background queue: 2 running, 10 queued, 20 finished tasks kept.
//!
//! Jobs persist on every state change. Interrupted jobs restart on the next launch up to three attempts.
//! When storage fails, scheduling stops and callers see the last committed snapshot.

pub mod hash;

use std::collections::HashSet;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex, Weak};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::async_runtime::JoinHandle;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use self::hash::FileSource;
use crate::app_config::now_iso;
use crate::error::{AppError, AppResult};

const MAX_CONCURRENT: usize = 2;
const MAX_QUEUED: usize = 10;
const MAX_TERMINAL: usize = 20;
const MAX_ATTEMPTS: u32 = 3;
const INPUT_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
}

impl TaskStatus {
    pub fn is_active(self) -> bool {
        matches!(self, Self::Queued | Self::Running)
    }

    pub fn is_terminal(self) -> bool {
        !self.is_active()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum TaskKind {
    #[serde(rename = "file-hash")]
    FileHash,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileHashResult {
    pub file_name: String,
    #[specta(type = f64)]
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundTask {
    pub id: Uuid,
    pub kind: TaskKind,
    pub title: String,
    pub status: TaskStatus,
    pub progress: f64,
    pub message: String,
    pub can_cancel: bool,
    pub can_retry: bool,
    pub created_at: String,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub result: Option<FileHashResult>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedJob {
    pub snapshot: BackgroundTask,
    pub source: FileSource,
    pub attempts: u32,
    pub input_version: u32,
}

pub enum RunOutcome {
    Completed(FileHashResult),
    Cancelled,
    Failed,
}

pub type ProgressReporter = Arc<dyn Fn(f64, String) + Send + Sync>;
pub type RunFuture = Pin<Box<dyn Future<Output = RunOutcome> + Send>>;
pub type Runner = Arc<dyn Fn(FileSource, CancellationToken, ProgressReporter) -> RunFuture + Send + Sync>;
pub type Listener = Arc<dyn Fn(Vec<BackgroundTask>) + Send + Sync>;

pub trait TaskPersistence: Send + Sync {
    fn load_jobs(&self) -> AppResult<Vec<String>>;
    fn save_jobs(&self, jobs: &[(Uuid, String)]) -> AppResult<()>;
}

struct InternalTask {
    job: PersistedJob,
    cancel: Option<CancellationToken>,
    handle: Option<JoinHandle<()>>,
}

#[derive(Default)]
struct Inner {
    tasks: Vec<InternalTask>,
    stopping: bool,
    storage_error: Option<AppError>,
    committed: Vec<PersistedJob>,
}

pub struct TaskManager {
    inner: Mutex<Inner>,
    runner: Runner,
    persistence: Option<Arc<dyn TaskPersistence>>,
    listener: Mutex<Option<Listener>>,
    this: Weak<Self>,
}

pub fn default_runner() -> Runner {
    Arc::new(|source, cancel, report| Box::pin(hash::hash_file(source, cancel, report)))
}

fn storage_unavailable() -> AppError {
    AppError::storage("Task storage is unavailable. Scheduling stopped; restart after resolving the storage problem.")
}

impl TaskManager {
    /// Load persisted jobs and prepare recovery. Call [`TaskManager::start`] to begin work.
    pub fn new(runner: Runner, persistence: Option<Arc<dyn TaskPersistence>>) -> AppResult<Arc<Self>> {
        let mut tasks = Vec::new();
        for row in persistence.as_ref().map(|store| store.load_jobs()).transpose()?.unwrap_or_default() {
            let Ok(mut job) = serde_json::from_str::<PersistedJob>(&row) else {
                log::warn!("Skipped an unreadable background job.");
                continue;
            };
            if job.input_version != INPUT_VERSION {
                continue;
            }
            if matches!(job.snapshot.status, TaskStatus::Running | TaskStatus::Interrupted) {
                let recover = job.attempts < MAX_ATTEMPTS;
                job.snapshot = BackgroundTask {
                    status: if recover { TaskStatus::Queued } else { TaskStatus::Interrupted },
                    progress: 0.0,
                    message: if recover {
                        "Restarting interrupted work…"
                    } else {
                        "Interrupted. Retry manually to continue."
                    }
                    .into(),
                    can_cancel: recover,
                    can_retry: !recover,
                    finished_at: if recover { None } else { Some(now_iso()) },
                    ..job.snapshot
                };
            }
            tasks.push(InternalTask { job, cancel: None, handle: None });
        }
        let manager = Arc::new_cyclic(|this| Self {
            inner: Mutex::new(Inner { tasks, ..Inner::default() }),
            runner,
            persistence,
            listener: Mutex::new(None),
            this: this.clone(),
        });
        {
            let mut inner = manager.lock();
            prune(&mut inner);
            manager.persist(&mut inner)?;
        }
        Ok(manager)
    }

    pub fn set_listener(&self, listener: Listener) {
        *self.listener.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Some(listener);
    }

    /// Start queued work. Listeners are notified after the lock is released.
    pub fn start(&self) {
        let mut inner = self.lock();
        if self.schedule(&mut inner) {
            let tasks = snapshots(&inner);
            drop(inner);
            self.notify(tasks);
        }
    }

    pub fn list(&self) -> Vec<BackgroundTask> {
        snapshots(&self.lock())
    }

    pub fn active_count(&self) -> u32 {
        u32::try_from(self.list().iter().filter(|task| task.status.is_active()).count()).unwrap_or(u32::MAX)
    }

    pub fn start_file_hash(&self, source: FileSource) -> AppResult<BackgroundTask> {
        let mut inner = self.lock();
        if inner.stopping {
            return Err(AppError::unavailable("Application is shutting down."));
        }
        if inner.tasks.iter().filter(|task| task.job.snapshot.status == TaskStatus::Queued).count() >= MAX_QUEUED {
            return Err(AppError::invalid("The background-task queue is full."));
        }
        let snapshot = BackgroundTask {
            id: Uuid::new_v4(),
            kind: TaskKind::FileHash,
            title: format!("Hash {}", source.file_name),
            status: TaskStatus::Queued,
            progress: 0.0,
            message: "Waiting to start…".into(),
            can_cancel: true,
            can_retry: false,
            created_at: now_iso(),
            started_at: None,
            finished_at: None,
            result: None,
        };
        inner.tasks.push(InternalTask {
            job: PersistedJob { snapshot: snapshot.clone(), source, attempts: 0, input_version: INPUT_VERSION },
            cancel: None,
            handle: None,
        });
        self.emit(inner, true)?;
        self.start();
        Ok(snapshot)
    }

    pub fn cancel(&self, id: Uuid) -> AppResult<()> {
        let mut inner = self.lock();
        let task = require(&mut inner, id)?;
        match task.job.snapshot.status {
            TaskStatus::Queued => {
                finish(task, TaskStatus::Cancelled, "Cancelled before starting.");
                prune(&mut inner);
                self.emit(inner, true)?;
                self.start();
            }
            TaskStatus::Running => {
                // Commit explicit cancellation before aborting so a crash cannot resurrect it.
                task.job.snapshot = BackgroundTask {
                    status: TaskStatus::Cancelled,
                    can_cancel: false,
                    can_retry: true,
                    finished_at: Some(now_iso()),
                    ..task.job.snapshot.clone()
                };
                let cancel = task.cancel.clone();
                self.emit(inner, true)?;
                if let Some(cancel) = cancel {
                    cancel.cancel();
                }
            }
            _ => {}
        }
        Ok(())
    }

    pub fn retry(&self, id: Uuid) -> AppResult<BackgroundTask> {
        let source = {
            let mut inner = self.lock();
            let task = require(&mut inner, id)?;
            if task.cancel.is_some() {
                return Err(AppError::invalid("Wait for cancellation to finish before retrying."));
            }
            if !task.job.snapshot.can_retry {
                return Err(AppError::invalid("Only failed or cancelled tasks can be retried."));
            }
            task.job.source.clone()
        };
        self.start_file_hash(source)
    }

    pub fn dismiss(&self, id: Uuid) -> AppResult<()> {
        let mut inner = self.lock();
        let task = require(&mut inner, id)?;
        if task.cancel.is_some() || !task.job.snapshot.status.is_terminal() {
            return Err(AppError::invalid("Active tasks cannot be dismissed."));
        }
        inner.tasks.retain(|task| task.job.snapshot.id != id);
        self.emit(inner, true)
    }

    pub fn clear_completed(&self) -> AppResult<()> {
        let mut inner = self.lock();
        if let Some(error) = &inner.storage_error {
            return Err(error.clone());
        }
        inner.tasks.retain(|task| task.job.snapshot.status != TaskStatus::Completed);
        self.emit(inner, true)
    }

    pub fn find(&self, id: Uuid) -> Option<BackgroundTask> {
        self.list().into_iter().find(|task| task.id == id)
    }

    /// Stop scheduling, cancel running work, and wait for every runner to finish.
    pub async fn stop(&self) {
        let handles: Vec<JoinHandle<()>> = {
            let mut inner = self.lock();
            inner.stopping = true;
            inner
                .tasks
                .iter_mut()
                .filter_map(|task| {
                    if let Some(cancel) = &task.cancel {
                        cancel.cancel();
                    }
                    task.handle.take()
                })
                .collect()
        };
        for handle in handles {
            let _ = handle.await;
        }
    }

    /// Persist the stopped state. After a storage failure, only the last committed jobs are written.
    pub fn save_stopped(&self) -> AppResult<()> {
        let mut inner = self.lock();
        if !inner.stopping {
            return Err(AppError::internal("Stop tasks before saving shutdown state."));
        }
        if inner.storage_error.is_some() {
            // Never commit a failed enqueue or cancel as a side effect of retrying shutdown.
            inner.tasks = inner
                .committed
                .clone()
                .into_iter()
                .map(|mut job| {
                    if job.snapshot.status == TaskStatus::Running {
                        job.snapshot = BackgroundTask {
                            status: TaskStatus::Interrupted,
                            can_cancel: false,
                            can_retry: true,
                            finished_at: Some(now_iso()),
                            message: "Interrupted; recovery will run next launch.".into(),
                            ..job.snapshot
                        };
                    }
                    InternalTask { job, cancel: None, handle: None }
                })
                .collect();
            inner.storage_error = None;
        }
        self.persist(&mut inner)
    }

    /// Resume after a cancelled shutdown.
    pub fn resume_after_shutdown(&self) {
        let mut inner = self.lock();
        if inner.storage_error.is_some() {
            return;
        }
        for task in &mut inner.tasks {
            if task.job.snapshot.status == TaskStatus::Interrupted && task.job.attempts < MAX_ATTEMPTS {
                task.job.snapshot = BackgroundTask {
                    status: TaskStatus::Queued,
                    progress: 0.0,
                    can_cancel: true,
                    can_retry: false,
                    finished_at: None,
                    message: "Resuming interrupted work…".into(),
                    ..task.job.snapshot.clone()
                };
            }
        }
        inner.stopping = false;
        if self.emit(inner, true).is_ok() {
            self.start();
        }
    }

    fn schedule(&self, inner: &mut Inner) -> bool {
        if inner.stopping {
            return false;
        }
        let running = inner.tasks.iter().filter(|task| task.cancel.is_some()).count();
        let available = MAX_CONCURRENT.saturating_sub(running);
        let queued: Vec<Uuid> = inner
            .tasks
            .iter()
            .filter(|task| task.job.snapshot.status == TaskStatus::Queued)
            .take(available)
            .map(|task| task.job.snapshot.id)
            .collect();
        let started = !queued.is_empty();
        for id in queued {
            self.run(inner, id);
        }
        started
    }

    fn run(&self, inner: &mut Inner, id: Uuid) {
        let Some(this) = self.this.upgrade() else {
            return;
        };
        let Some(task) = inner.tasks.iter_mut().find(|task| task.job.snapshot.id == id) else {
            return;
        };
        let cancel = CancellationToken::new();
        task.cancel = Some(cancel.clone());
        task.job.attempts += 1;
        task.job.snapshot = BackgroundTask {
            status: TaskStatus::Running,
            message: "Reading file…".into(),
            started_at: Some(now_iso()),
            ..task.job.snapshot.clone()
        };
        let source = task.job.source.clone();
        if self.persist(inner).is_err() {
            return;
        }
        let weak = self.this.clone();
        let report: ProgressReporter = Arc::new(move |progress, message| {
            if let Some(manager) = weak.upgrade() {
                manager.report(id, progress, message);
            }
        });
        let execution = (self.runner)(source, cancel.clone(), report);
        let handle = tauri::async_runtime::spawn(async move {
            let outcome = execution.await;
            this.complete(id, &cancel, outcome);
        });
        if let Some(task) = inner.tasks.iter_mut().find(|task| task.job.snapshot.id == id)
            && task.cancel.is_some()
        {
            task.handle = Some(handle);
        }
    }

    fn report(&self, id: Uuid, progress: f64, message: String) {
        let mut inner = self.lock();
        let Some(task) = inner.tasks.iter_mut().find(|task| task.job.snapshot.id == id) else {
            return;
        };
        if task.job.snapshot.status != TaskStatus::Running {
            return;
        }
        task.job.snapshot.progress = progress.clamp(0.0, 1.0);
        task.job.snapshot.message = message;
        let _ = self.emit(inner, false);
    }

    fn complete(&self, id: Uuid, cancel: &CancellationToken, outcome: RunOutcome) {
        let mut inner = self.lock();
        let stopping = inner.stopping;
        let Some(task) = inner.tasks.iter_mut().find(|task| task.job.snapshot.id == id) else {
            return;
        };
        match outcome {
            RunOutcome::Completed(result) if !cancel.is_cancelled() => {
                task.job.snapshot.result = Some(result);
                task.job.snapshot.progress = 1.0;
                finish(task, TaskStatus::Completed, "SHA-256 complete.");
            }
            _ if cancel.is_cancelled() => {
                let explicit = task.job.snapshot.status == TaskStatus::Cancelled;
                let status = if stopping && !explicit { TaskStatus::Interrupted } else { TaskStatus::Cancelled };
                let message =
                    if stopping { "Interrupted by shutdown; recovery will run next launch." } else { "Cancelled." };
                finish(task, status, message);
            }
            _ => finish(
                task,
                TaskStatus::Failed,
                "Unable to hash: source missing, changed, or unreadable. Choose the file again.",
            ),
        }
        prune(&mut inner);
        if self.emit(inner, true).is_ok() {
            self.start();
        } else {
            log::error!("Task persistence failed; scheduling stopped");
        }
    }

    /// Persist when asked, then notify the listener with the current list.
    fn emit(&self, mut inner: std::sync::MutexGuard<'_, Inner>, persist: bool) -> AppResult<()> {
        if persist {
            self.persist(&mut inner)?;
        }
        let tasks = snapshots(&inner);
        drop(inner);
        self.notify(tasks);
        Ok(())
    }

    fn notify(&self, tasks: Vec<BackgroundTask>) {
        let listener = self.listener.lock().unwrap_or_else(std::sync::PoisonError::into_inner).clone();
        if let Some(listener) = listener {
            listener(tasks);
        }
    }

    fn persist(&self, inner: &mut Inner) -> AppResult<()> {
        if let Some(error) = &inner.storage_error {
            return Err(error.clone());
        }
        let jobs: Vec<PersistedJob> = inner.tasks.iter().map(|task| task.job.clone()).collect();
        let rows: Result<Vec<(Uuid, String)>, _> =
            jobs.iter().map(|job| serde_json::to_string(job).map(|data| (job.snapshot.id, data))).collect();
        let saved = match (rows, &self.persistence) {
            (Ok(rows), Some(store)) => store.save_jobs(&rows),
            (Ok(_), None) => Ok(()),
            (Err(error), _) => Err(AppError::internal(error.to_string())),
        };
        if saved.is_err() {
            let error = storage_unavailable();
            inner.storage_error = Some(error.clone());
            inner.stopping = true;
            for task in &inner.tasks {
                if let Some(cancel) = &task.cancel {
                    cancel.cancel();
                }
            }
            return Err(error);
        }
        inner.committed = jobs;
        Ok(())
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

fn snapshots(inner: &Inner) -> Vec<BackgroundTask> {
    let mut tasks: Vec<BackgroundTask> = if inner.storage_error.is_some() {
        inner.committed.iter().map(|job| job.snapshot.clone()).collect()
    } else {
        inner.tasks.iter().map(|task| task.job.snapshot.clone()).collect()
    };
    tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    tasks
}

fn require(inner: &mut Inner, id: Uuid) -> AppResult<&mut InternalTask> {
    if let Some(error) = &inner.storage_error {
        return Err(error.clone());
    }
    inner
        .tasks
        .iter_mut()
        .find(|task| task.job.snapshot.id == id)
        .ok_or_else(|| AppError::not_found("Background task not found."))
}

fn finish(task: &mut InternalTask, status: TaskStatus, message: &str) {
    task.cancel = None;
    task.handle = None;
    task.job.snapshot = BackgroundTask {
        status,
        message: message.into(),
        can_cancel: false,
        can_retry: status != TaskStatus::Completed,
        finished_at: Some(now_iso()),
        ..task.job.snapshot.clone()
    };
}

fn prune(inner: &mut Inner) {
    let mut terminal: Vec<(String, Uuid)> = inner
        .tasks
        .iter()
        .filter(|task| task.job.snapshot.status.is_terminal() && task.cancel.is_none())
        .map(|task| (task.job.snapshot.finished_at.clone().unwrap_or_default(), task.job.snapshot.id))
        .collect();
    if terminal.len() <= MAX_TERMINAL {
        return;
    }
    terminal.sort();
    let remove: HashSet<Uuid> = terminal[..terminal.len() - MAX_TERMINAL].iter().map(|(_, id)| *id).collect();
    inner.tasks.retain(|task| !remove.contains(&task.job.snapshot.id));
}

/// Tracks completed tasks so a notification is shown once, even for work finished while focused.
#[derive(Default)]
pub struct CompletionTracker {
    completed: HashSet<Uuid>,
}

impl CompletionTracker {
    pub fn update(&mut self, tasks: &[BackgroundTask]) -> Vec<BackgroundTask> {
        let completed: Vec<&BackgroundTask> =
            tasks.iter().filter(|task| task.status == TaskStatus::Completed).collect();
        let fresh =
            completed.iter().filter(|task| !self.completed.contains(&task.id)).map(|task| (*task).clone()).collect();
        self.completed = completed.iter().map(|task| task.id).collect();
        fresh
    }
}

#[cfg(test)]
mod tests;
