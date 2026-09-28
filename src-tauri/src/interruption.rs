//! Confirm before quitting, restarting to update, or closing a window would interrupt work.
//!
//! The coordinator is a pure state machine. The caller delivers requests to a window or a native dialog.

use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

pub const MAX_DIRTY_SOURCES: usize = 20;
pub const MAX_SOURCE_LENGTH: usize = 80;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum InterruptionKind {
    Quit,
    InstallUpdate,
    CloseWindow,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct InterruptionRequest {
    pub id: Uuid,
    pub kind: InterruptionKind,
    pub dirty_sources: Vec<String>,
    pub active_task_count: u32,
}

pub type Proceed = Box<dyn FnOnce() + Send>;

#[derive(Debug, PartialEq, Eq)]
pub enum Delivery {
    Window(String, InterruptionRequest),
    Native(InterruptionRequest),
    Nothing,
}

pub enum RequestOutcome {
    /// Nothing is at risk: run the action now.
    Proceed(Proceed),
    Deliver(Delivery),
}

struct Pending {
    request: InterruptionRequest,
    proceed: Proceed,
}

#[derive(Default)]
pub struct InterruptionCoordinator {
    dirty_sources: Vec<String>,
    pending: Option<Pending>,
    native_request: Option<Uuid>,
    recipient: Option<String>,
}

/// Validate the dirty-state list a window reports.
pub fn validate_sources(sources: &[String]) -> bool {
    sources.len() <= MAX_DIRTY_SOURCES
        && sources.iter().all(|source| !source.is_empty() && source.chars().count() <= MAX_SOURCE_LENGTH)
}

impl InterruptionCoordinator {
    pub fn set_dirty_sources(&mut self, sources: Vec<String>) {
        self.dirty_sources = sources;
    }

    pub fn has_work(&self, active_tasks: u32) -> bool {
        !self.dirty_sources.is_empty() || active_tasks > 0
    }

    pub fn is_pending(&self) -> bool {
        self.pending.is_some()
    }

    /// Start a request. A second request while one is pending re-delivers the first.
    pub fn request(
        &mut self,
        kind: InterruptionKind,
        active_tasks: u32,
        proceed: Proceed,
        available: impl Fn(&str) -> bool,
        current: Option<String>,
    ) -> RequestOutcome {
        if self.pending.is_some() {
            return RequestOutcome::Deliver(self.deliver_pending(available, current));
        }
        if !self.has_work(active_tasks) {
            return RequestOutcome::Proceed(proceed);
        }
        let request = InterruptionRequest {
            id: Uuid::new_v4(),
            kind,
            dirty_sources: self.dirty_sources.clone(),
            active_task_count: active_tasks,
        };
        self.pending = Some(Pending { request, proceed });
        RequestOutcome::Deliver(self.deliver_pending(available, current))
    }

    /// Send the pending request to its recipient window, another ready window, or a native dialog.
    pub fn deliver_pending(&mut self, available: impl Fn(&str) -> bool, current: Option<String>) -> Delivery {
        let Some(pending) = &self.pending else {
            return Delivery::Nothing;
        };
        if self.native_request.is_some() {
            return Delivery::Nothing;
        }
        let target = self
            .recipient
            .clone()
            .filter(|label| available(label))
            .or_else(|| current.filter(|label| available(label)));
        if let Some(label) = target {
            self.recipient = Some(label.clone());
            return Delivery::Window(label, pending.request.clone());
        }
        self.native_request = Some(pending.request.id);
        Delivery::Native(pending.request.clone())
    }

    /// Resolve a request. Only the window that received it may answer. Returns the action to run.
    pub fn resolve(&mut self, id: Uuid, proceed: bool, sender: Option<&str>) -> Option<Proceed> {
        if sender.is_some() && sender != self.recipient.as_deref() {
            return None;
        }
        if self.pending.as_ref().is_none_or(|pending| pending.request.id != id) {
            return None;
        }
        let pending = self.pending.take()?;
        self.recipient = None;
        self.native_request = None;
        proceed.then_some(pending.proceed)
    }

    /// A native dialog closed without an answer (for example, it failed to open).
    pub fn native_finished(&mut self, id: Uuid) {
        if self.native_request == Some(id) {
            self.native_request = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::*;

    fn flag() -> (Arc<AtomicBool>, Proceed) {
        let ran = Arc::new(AtomicBool::new(false));
        let clone = ran.clone();
        (ran, Box::new(move || clone.store(true, Ordering::SeqCst)))
    }

    fn deliver(outcome: RequestOutcome) -> Delivery {
        match outcome {
            RequestOutcome::Deliver(delivery) => delivery,
            RequestOutcome::Proceed(_) => panic!("expected a delivery"),
        }
    }

    #[test]
    fn proceeds_immediately_without_work() {
        let mut coordinator = InterruptionCoordinator::default();
        let (ran, proceed) = flag();
        match coordinator.request(InterruptionKind::Quit, 0, proceed, |_| true, Some("main".into())) {
            RequestOutcome::Proceed(action) => action(),
            RequestOutcome::Deliver(_) => panic!("nothing is at risk"),
        }
        assert!(ran.load(Ordering::SeqCst));
    }

    #[test]
    fn asks_the_ready_window_and_accepts_only_its_answer() {
        let mut coordinator = InterruptionCoordinator::default();
        coordinator.set_dirty_sources(vec!["Draft".into()]);
        let (ran, proceed) = flag();
        let Delivery::Window(label, request) =
            deliver(coordinator.request(InterruptionKind::Quit, 2, proceed, |_| true, Some("a".into())))
        else {
            panic!("expected a window delivery")
        };
        assert_eq!((label.as_str(), request.active_task_count), ("a", 2));
        assert!(coordinator.resolve(request.id, true, Some("b")).is_none());
        coordinator.resolve(request.id, true, Some("a")).expect("recipient may answer")();
        assert!(ran.load(Ordering::SeqCst));
        assert!(!coordinator.is_pending());
    }

    #[test]
    fn falls_back_to_a_native_dialog_once() {
        let mut coordinator = InterruptionCoordinator::default();
        let (ran, proceed) = flag();
        let Delivery::Native(request) =
            deliver(coordinator.request(InterruptionKind::InstallUpdate, 1, proceed, |_| false, None))
        else {
            panic!("expected a native delivery")
        };
        assert_eq!(coordinator.deliver_pending(|_| false, None), Delivery::Nothing);
        assert!(coordinator.resolve(request.id, false, None).is_none());
        assert!(!ran.load(Ordering::SeqCst));
        assert!(!coordinator.is_pending());
    }

    #[test]
    fn repeated_requests_redeliver_the_first() {
        let mut coordinator = InterruptionCoordinator::default();
        coordinator.set_dirty_sources(vec!["Draft".into()]);
        let (_, first) = flag();
        let (_, second) = flag();
        let Delivery::Window(_, original) =
            deliver(coordinator.request(InterruptionKind::Quit, 0, first, |_| true, Some("a".into())))
        else {
            panic!()
        };
        let Delivery::Window(_, repeated) =
            deliver(coordinator.request(InterruptionKind::CloseWindow, 0, second, |_| true, Some("b".into())))
        else {
            panic!()
        };
        assert_eq!(original, repeated);
    }

    #[test]
    fn validates_dirty_sources() {
        assert!(validate_sources(&["Draft".into()]));
        assert!(!validate_sources(&[String::new()]));
        assert!(!validate_sources(&["x".repeat(81)]));
        assert!(!validate_sources(&vec!["x".into(); 21]));
    }
}
