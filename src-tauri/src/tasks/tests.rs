use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tokio::sync::oneshot;

use super::*;

/// A runner whose tasks finish only when the test releases them by file name.
#[derive(Default)]
struct Gate {
    senders: Mutex<HashMap<String, oneshot::Sender<RunOutcome>>>,
}

impl Gate {
    fn runner(self: &Arc<Self>) -> Runner {
        let gate = self.clone();
        Arc::new(move |source, cancel, _report| {
            let (sender, receiver) = oneshot::channel();
            gate.senders.lock().unwrap().insert(source.file_name, sender);
            Box::pin(async move {
                tokio::select! {
                    outcome = receiver => outcome.unwrap_or(RunOutcome::Failed),
                    () = cancel.cancelled() => RunOutcome::Cancelled,
                }
            })
        })
    }

    fn release(&self, name: &str, outcome: RunOutcome) {
        let sender = self.senders.lock().unwrap().remove(name).expect("task is running");
        let _ = sender.send(outcome);
    }

    fn running(&self) -> usize {
        self.senders.lock().unwrap().len()
    }
}

#[derive(Default)]
struct MemoryStore {
    rows: Mutex<Vec<(Uuid, String)>>,
    fail: AtomicBool,
}

impl TaskPersistence for MemoryStore {
    fn load_jobs(&self) -> AppResult<Vec<String>> {
        Ok(self.rows.lock().unwrap().iter().map(|(_, data)| data.clone()).collect())
    }

    fn save_jobs(&self, jobs: &[(Uuid, String)]) -> AppResult<()> {
        if self.fail.load(Ordering::SeqCst) {
            return Err(AppError::storage("disk full"));
        }
        *self.rows.lock().unwrap() = jobs.to_vec();
        Ok(())
    }
}

fn source(name: &str) -> FileSource {
    FileSource {
        path: PathBuf::from(format!("/tmp/{name}")),
        file_name: name.into(),
        size: 3,
        modified: None,
        dev: None,
        ino: None,
    }
}

fn result(name: &str) -> RunOutcome {
    RunOutcome::Completed(FileHashResult { file_name: name.into(), size: 3, sha256: "0".repeat(64) })
}

async fn eventually(condition: impl Fn() -> bool) {
    for _ in 0..200 {
        if condition() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    panic!("condition was not met");
}

fn status(manager: &TaskManager, id: Uuid) -> TaskStatus {
    manager.find(id).expect("task exists").status
}

fn manager(gate: &Arc<Gate>, store: &Arc<MemoryStore>) -> Arc<TaskManager> {
    let manager = TaskManager::new(gate.runner(), Some(store.clone() as Arc<dyn TaskPersistence>)).unwrap();
    manager.start();
    manager
}

#[tokio::test]
async fn runs_two_tasks_at_a_time() {
    let (gate, store) = (Arc::new(Gate::default()), Arc::new(MemoryStore::default()));
    let manager = manager(&gate, &store);
    let tasks: Vec<_> = ["a", "b", "c"].map(|name| manager.start_file_hash(source(name)).unwrap()).into();
    eventually(|| gate.running() == 2).await;
    assert_eq!(status(&manager, tasks[2].id), TaskStatus::Queued);
    gate.release("a", result("a"));
    eventually(|| status(&manager, tasks[0].id) == TaskStatus::Completed).await;
    eventually(|| status(&manager, tasks[2].id) == TaskStatus::Running).await;
    let completed = manager.find(tasks[0].id).unwrap();
    assert!(!completed.can_retry && completed.result.is_some());
}

#[tokio::test]
async fn cancels_queued_and_running_tasks() {
    let (gate, store) = (Arc::new(Gate::default()), Arc::new(MemoryStore::default()));
    let manager = manager(&gate, &store);
    let running = manager.start_file_hash(source("a")).unwrap();
    manager.start_file_hash(source("b")).unwrap();
    let queued = manager.start_file_hash(source("c")).unwrap();
    manager.cancel(queued.id).unwrap();
    assert_eq!(status(&manager, queued.id), TaskStatus::Cancelled);
    eventually(|| gate.running() == 2).await;
    manager.cancel(running.id).unwrap();
    assert_eq!(status(&manager, running.id), TaskStatus::Cancelled, "cancellation is committed before abort");
    eventually(|| manager.find(running.id).unwrap().message == "Cancelled.").await;
    let retried = manager.retry(running.id).unwrap();
    assert_ne!(retried.id, running.id);
    assert!(manager.dismiss(running.id).is_ok());
    assert!(manager.dismiss(retried.id).is_err(), "active tasks cannot be dismissed");
}

#[tokio::test]
async fn rejects_work_beyond_the_queue_limit() {
    let (gate, store) = (Arc::new(Gate::default()), Arc::new(MemoryStore::default()));
    let manager = manager(&gate, &store);
    for index in 0..(MAX_CONCURRENT + MAX_QUEUED) {
        manager.start_file_hash(source(&format!("file-{index}"))).unwrap();
    }
    eventually(|| gate.running() == MAX_CONCURRENT).await;
    assert!(manager.start_file_hash(source("overflow")).is_err());
}

#[tokio::test]
async fn failed_runs_can_be_retried() {
    let (gate, store) = (Arc::new(Gate::default()), Arc::new(MemoryStore::default()));
    let manager = manager(&gate, &store);
    let task = manager.start_file_hash(source("a")).unwrap();
    eventually(|| gate.running() == 1).await;
    gate.release("a", RunOutcome::Failed);
    eventually(|| status(&manager, task.id) == TaskStatus::Failed).await;
    assert!(manager.find(task.id).unwrap().can_retry);
}

#[tokio::test]
async fn recovers_interrupted_jobs_on_the_next_launch() {
    let (gate, store) = (Arc::new(Gate::default()), Arc::new(MemoryStore::default()));
    let first = manager(&gate, &store);
    let task = first.start_file_hash(source("a")).unwrap();
    eventually(|| gate.running() == 1).await;
    first.stop().await;
    first.save_stopped().unwrap();
    assert_eq!(status(&first, task.id), TaskStatus::Interrupted);

    let gate = Arc::new(Gate::default());
    let second = TaskManager::new(gate.runner(), Some(store.clone() as Arc<dyn TaskPersistence>)).unwrap();
    assert_eq!(status(&second, task.id), TaskStatus::Queued);
    second.start();
    eventually(|| gate.running() == 1).await;
}

#[tokio::test]
async fn stops_recovering_after_three_attempts() {
    let store = Arc::new(MemoryStore::default());
    let mut job = PersistedJob {
        snapshot: BackgroundTask {
            id: Uuid::new_v4(),
            kind: TaskKind::FileHash,
            title: "Hash a".into(),
            status: TaskStatus::Running,
            progress: 0.4,
            message: "Calculating".into(),
            can_cancel: true,
            can_retry: false,
            created_at: now_iso(),
            started_at: Some(now_iso()),
            finished_at: None,
            result: None,
        },
        source: source("a"),
        attempts: MAX_ATTEMPTS,
        input_version: INPUT_VERSION,
    };
    store.save_jobs(&[(job.snapshot.id, serde_json::to_string(&job).unwrap())]).unwrap();
    let manager =
        TaskManager::new(Arc::new(Gate::default()).runner(), Some(store.clone() as Arc<dyn TaskPersistence>)).unwrap();
    let recovered = manager.find(job.snapshot.id).unwrap();
    assert_eq!((recovered.status, recovered.can_retry), (TaskStatus::Interrupted, true));

    job.input_version = 99;
    store.save_jobs(&[(job.snapshot.id, serde_json::to_string(&job).unwrap())]).unwrap();
    let manager =
        TaskManager::new(Arc::new(Gate::default()).runner(), Some(store as Arc<dyn TaskPersistence>)).unwrap();
    assert!(manager.list().is_empty(), "unknown input versions are skipped");
}

#[tokio::test]
async fn freezes_on_storage_failure() {
    let (gate, store) = (Arc::new(Gate::default()), Arc::new(MemoryStore::default()));
    let manager = manager(&gate, &store);
    let committed = manager.start_file_hash(source("a")).unwrap();
    eventually(|| gate.running() == 1).await;
    store.fail.store(true, Ordering::SeqCst);
    assert!(manager.start_file_hash(source("b")).is_err());
    assert_eq!(manager.list().len(), 1, "only committed work is visible");
    assert!(manager.cancel(committed.id).is_err());

    store.fail.store(false, Ordering::SeqCst);
    manager.stop().await;
    manager.save_stopped().unwrap();
    let saved = TaskManager::new(Arc::new(Gate::default()).runner(), Some(store as Arc<dyn TaskPersistence>)).unwrap();
    assert_eq!(saved.list().len(), 1);
    assert_eq!(saved.list()[0].status, TaskStatus::Queued, "running work recovers on the next launch");
}

#[tokio::test]
async fn resumes_after_a_cancelled_shutdown() {
    let (gate, store) = (Arc::new(Gate::default()), Arc::new(MemoryStore::default()));
    let manager = manager(&gate, &store);
    let task = manager.start_file_hash(source("a")).unwrap();
    eventually(|| gate.running() == 1).await;
    manager.stop().await;
    assert_eq!(status(&manager, task.id), TaskStatus::Interrupted);
    manager.resume_after_shutdown();
    eventually(|| status(&manager, task.id) == TaskStatus::Running).await;
}

#[tokio::test]
async fn keeps_only_the_newest_finished_tasks() {
    let (gate, store) = (Arc::new(Gate::default()), Arc::new(MemoryStore::default()));
    let manager = manager(&gate, &store);
    for index in 0..(MAX_TERMINAL + 3) {
        let name = format!("file-{index}");
        let task = manager.start_file_hash(source(&name)).unwrap();
        eventually(|| gate.senders.lock().unwrap().contains_key(&name)).await;
        gate.release(&name, result(&name));
        eventually(|| manager.find(task.id).is_none_or(|task| task.status == TaskStatus::Completed)).await;
    }
    assert_eq!(manager.list().len(), MAX_TERMINAL);
}

#[test]
fn completion_tracker_announces_each_task_once() {
    let task = BackgroundTask {
        id: Uuid::new_v4(),
        kind: TaskKind::FileHash,
        title: "Hash".into(),
        status: TaskStatus::Completed,
        progress: 1.0,
        message: String::new(),
        can_cancel: false,
        can_retry: false,
        created_at: now_iso(),
        started_at: None,
        finished_at: None,
        result: None,
    };
    let mut tracker = CompletionTracker::default();
    assert_eq!(tracker.update(std::slice::from_ref(&task)).len(), 1);
    assert!(tracker.update(std::slice::from_ref(&task)).is_empty());
}
