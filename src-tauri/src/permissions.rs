//! Permission decisions: denied by default, granted per session or remembered, reset in Settings.
//!
//! The system webview owns camera and microphone prompts on each platform (`WKWebView`, `WebView2`,
//! `WebKitGTK`). The app keeps its own decision model so the interface can ask first and explain the choice.

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

use crate::error::{AppError, AppResult, ResultExt};
use crate::storage::json_store::JsonStore;
use crate::storage::versions;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum PermissionCapability {
    Notifications,
    Camera,
    Microphone,
}

pub const CAPABILITIES: [PermissionCapability; 3] =
    [PermissionCapability::Notifications, PermissionCapability::Camera, PermissionCapability::Microphone];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum PermissionDecision {
    Prompt,
    Session,
    Always,
    Denied,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStatus {
    pub capability: PermissionCapability,
    pub decision: PermissionDecision,
}

/// The answer from the permission prompt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptAnswer {
    Session,
    Always,
    Deny,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PermissionData {
    schema_version: u32,
    decisions: BTreeMap<PermissionCapability, PermissionDecision>,
}

/// Keep only remembered decisions (`always` or `denied`) for known capabilities.
fn migrate(value: Option<&Value>) -> PermissionData {
    let decisions = value
        .and_then(|value| value.get("decisions"))
        .and_then(Value::as_object)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|(capability, decision)| {
                    let capability = serde_json::from_value(Value::String(capability.clone())).ok()?;
                    let decision = serde_json::from_value(decision.clone()).ok()?;
                    matches!(decision, PermissionDecision::Always | PermissionDecision::Denied)
                        .then_some((capability, decision))
                })
                .collect()
        })
        .unwrap_or_default();
    PermissionData { schema_version: versions::PERMISSIONS, decisions }
}

pub struct PermissionBroker {
    store: JsonStore,
    state: Mutex<State>,
    /// One prompt at a time, so concurrent requests for a capability share the first answer.
    prompting: tokio::sync::Mutex<()>,
}

struct State {
    data: PermissionData,
    session: Vec<PermissionCapability>,
}

impl PermissionBroker {
    pub fn open(profile: &Path) -> AppResult<Self> {
        let store = JsonStore::new(profile, "permissions");
        let raw = store.read().or_app(AppError::storage("Unable to read permissions."))?;
        let data = migrate(raw.as_ref());
        if raw.as_ref() != serde_json::to_value(&data).ok().as_ref() {
            store.write(&data).or_app(AppError::storage("Unable to save permissions."))?;
        }
        Ok(Self {
            store,
            state: Mutex::new(State { data, session: Vec::new() }),
            prompting: tokio::sync::Mutex::new(()),
        })
    }

    pub fn list(&self) -> Vec<PermissionStatus> {
        let state = self.lock();
        CAPABILITIES
            .iter()
            .map(|capability| PermissionStatus {
                capability: *capability,
                decision: if state.session.contains(capability) {
                    PermissionDecision::Session
                } else {
                    state.data.decisions.get(capability).copied().unwrap_or(PermissionDecision::Prompt)
                },
            })
            .collect()
    }

    pub fn status(&self, capability: PermissionCapability) -> PermissionStatus {
        self.list()
            .into_iter()
            .find(|status| status.capability == capability)
            .unwrap_or(PermissionStatus { capability, decision: PermissionDecision::Prompt })
    }

    pub fn is_granted(&self, capability: PermissionCapability) -> bool {
        matches!(self.status(capability).decision, PermissionDecision::Session | PermissionDecision::Always)
    }

    /// Ask once when undecided. Concurrent requests wait for the same prompt.
    pub async fn request<F, Fut>(&self, capability: PermissionCapability, prompt: F) -> AppResult<PermissionStatus>
    where
        F: FnOnce(PermissionCapability) -> Fut,
        Fut: Future<Output = PromptAnswer>,
    {
        let _prompting = self.prompting.lock().await;
        let existing = self.status(capability);
        if existing.decision != PermissionDecision::Prompt {
            return Ok(existing);
        }
        match prompt(capability).await {
            PromptAnswer::Session => self.lock().session.push(capability),
            PromptAnswer::Always => self.remember(capability, PermissionDecision::Always)?,
            PromptAnswer::Deny => self.remember(capability, PermissionDecision::Denied)?,
        }
        Ok(self.status(capability))
    }

    pub fn reset(&self, capability: Option<PermissionCapability>) -> AppResult<Vec<PermissionStatus>> {
        {
            let mut state = self.lock();
            let mut data = state.data.clone();
            match capability {
                Some(capability) => {
                    data.decisions.remove(&capability);
                }
                None => data.decisions.clear(),
            }
            self.store.write(&data).or_app(AppError::storage("Unable to save permissions."))?;
            state.data = data;
            match capability {
                Some(capability) => state.session.retain(|entry| *entry != capability),
                None => state.session.clear(),
            }
        }
        Ok(self.list())
    }

    fn remember(&self, capability: PermissionCapability, decision: PermissionDecision) -> AppResult<()> {
        let mut state = self.lock();
        let mut data = state.data.clone();
        data.decisions.insert(capability, decision);
        self.store.write(&data).or_app(AppError::storage("Unable to save permissions."))?;
        state.data = data;
        Ok(())
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn migration_keeps_only_remembered_known_decisions() {
        let data =
            migrate(Some(&json!({ "decisions": { "camera": "always", "microphone": "session", "gps": "denied" } })));
        assert_eq!(data.decisions, BTreeMap::from([(PermissionCapability::Camera, PermissionDecision::Always)]));
    }

    #[tokio::test]
    async fn prompts_once_and_remembers_choices() {
        let profile = tempfile::tempdir().unwrap();
        let broker = PermissionBroker::open(profile.path()).unwrap();
        let status = broker.request(PermissionCapability::Camera, |_| async { PromptAnswer::Always }).await.unwrap();
        assert_eq!(status.decision, PermissionDecision::Always);
        let again =
            broker.request(PermissionCapability::Camera, |_| async { panic!("already decided") }).await.unwrap();
        assert_eq!(again.decision, PermissionDecision::Always);
        assert!(PermissionBroker::open(profile.path()).unwrap().is_granted(PermissionCapability::Camera));
    }

    #[tokio::test]
    async fn session_grants_are_not_persisted() {
        let profile = tempfile::tempdir().unwrap();
        let broker = PermissionBroker::open(profile.path()).unwrap();
        broker.request(PermissionCapability::Notifications, |_| async { PromptAnswer::Session }).await.unwrap();
        assert!(broker.is_granted(PermissionCapability::Notifications));
        assert!(!PermissionBroker::open(profile.path()).unwrap().is_granted(PermissionCapability::Notifications));
    }

    #[tokio::test]
    async fn reset_clears_one_or_all_decisions() {
        let profile = tempfile::tempdir().unwrap();
        let broker = PermissionBroker::open(profile.path()).unwrap();
        broker.request(PermissionCapability::Camera, |_| async { PromptAnswer::Deny }).await.unwrap();
        broker.request(PermissionCapability::Microphone, |_| async { PromptAnswer::Session }).await.unwrap();
        broker.reset(Some(PermissionCapability::Camera)).unwrap();
        assert_eq!(broker.status(PermissionCapability::Camera).decision, PermissionDecision::Prompt);
        assert_eq!(broker.status(PermissionCapability::Microphone).decision, PermissionDecision::Session);
        broker.reset(None).unwrap();
        assert!(broker.list().iter().all(|status| status.decision == PermissionDecision::Prompt));
    }
}
