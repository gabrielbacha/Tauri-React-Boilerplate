//! Deep links become a closed set of intents. Raw link content never reaches navigation or task input.

use std::collections::VecDeque;

use serde::{Deserialize, Serialize};
use specta::Type;
use url::Url;
use uuid::Uuid;

const MAX_QUEUED_INTENTS: usize = 10;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "route", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum DeepLinkIntent {
    Home,
    Settings,
    Task { task_id: Uuid },
}

/// Accept only `<protocol>://open/{home,settings,tasks/<uuid>}` with no credentials, port, query, or fragment.
pub fn parse(value: &str, protocol: &str) -> Option<DeepLinkIntent> {
    let url = Url::parse(value).ok()?;
    if url.scheme() != protocol
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.host_str() != Some("open")
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    let parts: Vec<&str> = url.path().split('/').filter(|part| !part.is_empty()).collect();
    match parts.as_slice() {
        ["home"] => Some(DeepLinkIntent::Home),
        ["settings"] => Some(DeepLinkIntent::Settings),
        ["tasks", id] => {
            let task_id = Uuid::try_parse(id).ok()?;
            // Hyphenated lowercase or uppercase only, versions 1–5, RFC 4122 variant.
            let valid = id.len() == 36
                && matches!(task_id.get_version_num(), 1..=5)
                && task_id.get_variant() == uuid::Variant::RFC4122;
            valid.then_some(DeepLinkIntent::Task { task_id })
        }
        _ => None,
    }
}

/// Find the first link for `protocol` in process arguments, as Windows and Linux pass them.
pub fn extract<S: AsRef<str>>(argv: &[S], protocol: &str) -> Option<DeepLinkIntent> {
    let prefix = format!("{protocol}://");
    argv.iter()
        .map(|argument| unquote(argument.as_ref()))
        .find(|argument| argument.starts_with(&prefix))
        .and_then(|candidate| parse(candidate, protocol))
}

fn unquote(argument: &str) -> &str {
    for quote in ['"', '\''] {
        if argument.len() >= 2 && argument.starts_with(quote) && argument.ends_with(quote) {
            return &argument[1..argument.len() - 1];
        }
    }
    argument
}

/// Holds intents until a window is ready. Drops consecutive duplicates and keeps the newest ten.
#[derive(Debug, Default)]
pub struct DeepLinkQueue {
    items: VecDeque<DeepLinkIntent>,
}

impl DeepLinkQueue {
    pub fn push(&mut self, intent: DeepLinkIntent) {
        if self.items.back() == Some(&intent) {
            return;
        }
        if self.items.len() == MAX_QUEUED_INTENTS {
            self.items.pop_front();
        }
        self.items.push_back(intent);
    }

    pub fn drain(&mut self) -> Vec<DeepLinkIntent> {
        self.items.drain(..).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TASK: &str = "3f2c1b8e-7d6a-4c5b-9e8f-1a2b3c4d5e6f";

    #[test]
    fn parses_the_supported_routes() {
        assert_eq!(parse("tauri-app://open/home", "tauri-app"), Some(DeepLinkIntent::Home));
        assert_eq!(parse("tauri-app://open/settings/", "tauri-app"), Some(DeepLinkIntent::Settings));
        assert_eq!(
            parse(&format!("tauri-app://open/tasks/{}", TASK.to_uppercase()), "tauri-app"),
            Some(DeepLinkIntent::Task { task_id: Uuid::parse_str(TASK).unwrap() })
        );
    }

    #[test]
    fn rejects_everything_else() {
        for value in [
            "other://open/home",
            "tauri-app://user@open/home",
            "tauri-app://open:1/home",
            "tauri-app://evil/home",
            "tauri-app://open/home?next=x",
            "tauri-app://open/home#x",
            "tauri-app://open/tasks/not-a-uuid",
            "tauri-app://open/tasks/3f2c1b8e7d6a4c5b9e8f1a2b3c4d5e6f",
            "tauri-app://open/tasks",
            "not a url",
        ] {
            assert_eq!(parse(value, "tauri-app"), None, "{value}");
        }
    }

    #[test]
    fn extracts_quoted_arguments() {
        let argv = ["/app", "--flag", "\"tauri-app://open/settings\""];
        assert_eq!(extract(&argv, "tauri-app"), Some(DeepLinkIntent::Settings));
        assert_eq!(extract(&["/app"], "tauri-app"), None);
    }

    #[test]
    fn queue_deduplicates_and_caps() {
        let mut queue = DeepLinkQueue::default();
        queue.push(DeepLinkIntent::Home);
        queue.push(DeepLinkIntent::Home);
        assert_eq!(queue.drain(), vec![DeepLinkIntent::Home]);
        for index in 0..12 {
            queue.push(if index % 2 == 0 { DeepLinkIntent::Home } else { DeepLinkIntent::Settings });
        }
        let drained = queue.drain();
        assert_eq!(drained.len(), 10);
        assert_eq!(drained.last(), Some(&DeepLinkIntent::Settings));
        assert!(queue.drain().is_empty());
    }

    #[test]
    fn serializes_like_the_frontend_union() {
        let json = serde_json::to_value(DeepLinkIntent::Task { task_id: Uuid::parse_str(TASK).unwrap() }).unwrap();
        assert_eq!(json, serde_json::json!({ "route": "task", "taskId": TASK }));
    }
}
