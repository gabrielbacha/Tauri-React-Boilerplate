use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

use super::atomic;

/// A small JSON document in the profile directory, replaced atomically on every write.
#[derive(Debug, Clone)]
pub struct JsonStore {
    path: PathBuf,
}

impl JsonStore {
    pub fn new(profile: &Path, name: &str) -> Self {
        Self { path: profile.join(format!("{name}.json")) }
    }

    /// The stored document, or `None` when it does not exist or is not valid JSON.
    ///
    /// `prepare_settings` has already moved corrupt files aside at startup, so an unreadable file here
    /// means another process changed it; callers fall back to defaults.
    pub fn read(&self) -> io::Result<Option<Value>> {
        match fs::read_to_string(&self.path) {
            Ok(source) => Ok(serde_json::from_str(&source).ok()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub fn write<T: Serialize>(&self, value: &T) -> io::Result<()> {
        let mut content = serde_json::to_vec_pretty(value).map_err(io::Error::other)?;
        content.push(b'\n');
        atomic::write(&self.path, &content)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_documents() {
        let profile = tempfile::tempdir().unwrap();
        let store = JsonStore::new(profile.path(), "example");
        assert_eq!(store.read().unwrap(), None);
        store.write(&serde_json::json!({ "schemaVersion": 1 })).unwrap();
        assert_eq!(store.read().unwrap(), Some(serde_json::json!({ "schemaVersion": 1 })));
    }
}
