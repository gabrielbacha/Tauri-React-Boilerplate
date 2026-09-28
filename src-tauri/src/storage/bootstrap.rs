//! Runs before any store opens. A failure here stops startup and keeps every existing file.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::versions;

pub struct ProfileOptions<'a> {
    /// The platform application-data directory, for example `~/Library/Application Support`.
    pub app_data: &'a Path,
    pub app_id: &'a str,
    pub development: bool,
    /// A test profile. Honoured only in development builds.
    pub override_path: Option<PathBuf>,
}

/// Resolve `<appData>/<appId>[.development]`, create it, and prove it is writable with a real write.
pub fn initialize_profile(options: &ProfileOptions<'_>) -> io::Result<PathBuf> {
    let profile = if let (Some(path), true) = (&options.override_path, options.development) {
        path.clone()
    } else {
        let suffix = if options.development { ".development" } else { "" };
        options.app_data.join(format!("{}{suffix}", options.app_id))
    };
    fs::create_dir_all(&profile)?;
    // A real write detects read-only mounts and exhausted storage before stores open.
    let probe = tempfile::Builder::new().prefix(".write-check-").tempdir_in(&profile)?;
    fs::write(probe.path().join("probe"), "ok")?;
    probe.close()?;
    Ok(profile)
}

#[derive(Debug, thiserror::Error)]
pub enum PrepareError {
    #[error("{0}.json requires a newer application version.")]
    NewerVersion(String),
    #[error("Unable to read {0}.json: {1}")]
    Io(String, io::Error),
}

/// Refuse settings written by a newer version. Move unreadable settings aside and never delete them.
pub fn prepare_settings(profile: &Path) -> Result<Vec<PathBuf>, PrepareError> {
    let mut recovered = Vec::new();
    for (name, supported) in versions::ALL {
        let file = profile.join(format!("{name}.json"));
        let source = match fs::read_to_string(&file) {
            Ok(source) => source,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) if error.kind() == io::ErrorKind::InvalidData => String::new(),
            Err(error) => return Err(PrepareError::Io(name.to_owned(), error)),
        };
        let record = serde_json::from_str::<Value>(&source).ok().filter(Value::is_object);
        if let Some(version) = record.as_ref().and_then(|value| value.get("schemaVersion")).and_then(Value::as_u64)
            && version > u64::from(supported)
        {
            return Err(PrepareError::NewerVersion(name.to_owned()));
        }
        let invalid = match &record {
            None => true,
            Some(value) if name == "permissions" => !valid_permissions(value),
            Some(_) => false,
        };
        if invalid {
            let destination = profile.join(format!(
                "{name}.json.corrupt-{}-{}",
                chrono::Utc::now().timestamp_millis(),
                std::process::id()
            ));
            // The rename must succeed before a replacement may be created.
            fs::rename(&file, &destination).map_err(|error| PrepareError::Io(name.to_owned(), error))?;
            log::warn!("Recovered {name}; original settings preserved beside the store.");
            recovered.push(destination);
        }
    }
    Ok(recovered)
}

fn valid_permissions(value: &Value) -> bool {
    value.get("decisions").and_then(Value::as_object).is_some_and(|decisions| {
        decisions.iter().all(|(capability, decision)| {
            matches!(capability.as_str(), "notifications" | "camera" | "microphone")
                && matches!(decision.as_str(), Some("always" | "denied"))
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(app_data: &Path) -> ProfileOptions<'_> {
        ProfileOptions { app_data, app_id: "com.example.app", development: false, override_path: None }
    }

    #[test]
    fn creates_separate_development_and_release_profiles() {
        let root = tempfile::tempdir().unwrap();
        let release = initialize_profile(&options(root.path())).unwrap();
        let development = initialize_profile(&ProfileOptions { development: true, ..options(root.path()) }).unwrap();
        assert_eq!(release, root.path().join("com.example.app"));
        assert_eq!(development, root.path().join("com.example.app.development"));
        assert_eq!(fs::read_dir(&release).unwrap().count(), 0, "the write probe is removed");
    }

    #[test]
    fn ignores_the_override_in_release_builds() {
        let root = tempfile::tempdir().unwrap();
        let override_path = Some(root.path().join("test-profile"));
        let release =
            initialize_profile(&ProfileOptions { override_path: override_path.clone(), ..options(root.path()) });
        assert_eq!(release.unwrap(), root.path().join("com.example.app"));
        let development =
            initialize_profile(&ProfileOptions { override_path, development: true, ..options(root.path()) });
        assert_eq!(development.unwrap(), root.path().join("test-profile"));
    }

    #[test]
    fn refuses_newer_settings() {
        let profile = tempfile::tempdir().unwrap();
        fs::write(profile.path().join("preferences.json"), r#"{"schemaVersion":99}"#).unwrap();
        assert!(matches!(prepare_settings(profile.path()), Err(PrepareError::NewerVersion(_))));
        assert!(profile.path().join("preferences.json").exists());
    }

    #[test]
    fn preserves_corrupt_settings_beside_the_store() {
        let profile = tempfile::tempdir().unwrap();
        fs::write(profile.path().join("preferences.json"), "{not json").unwrap();
        fs::write(profile.path().join("permissions.json"), r#"{"decisions":{"camera":"sometimes"}}"#).unwrap();
        fs::write(profile.path().join("window-state.json"), r#"{"windowState":{}}"#).unwrap();
        let recovered = prepare_settings(profile.path()).unwrap();
        assert_eq!(recovered.len(), 2);
        for file in &recovered {
            assert!(file.file_name().unwrap().to_string_lossy().contains(".json.corrupt-"));
        }
        assert_eq!(fs::read_to_string(&recovered[0]).unwrap(), "{not json");
        assert!(!profile.path().join("preferences.json").exists());
        assert!(profile.path().join("window-state.json").exists());
    }
}
