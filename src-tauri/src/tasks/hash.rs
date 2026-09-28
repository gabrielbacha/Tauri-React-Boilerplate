//! The showcase task: SHA-256 of a user-chosen file, verified unchanged before and after reading.

use std::fs::{self, File};
use std::io::Read;
use std::path::PathBuf;
use std::time::{Duration, Instant, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

use super::{FileHashResult, ProgressReporter, RunOutcome};

const CHUNK_SIZE: usize = 1024 * 1024;
const REPORT_INTERVAL: Duration = Duration::from_millis(100);

/// A file chosen in a native dialog. Persisted with the job; never sent to the webview.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSource {
    pub path: PathBuf,
    pub file_name: String,
    pub size: u64,
    #[serde(default)]
    pub modified: Option<(u64, u32)>,
    #[serde(default)]
    pub dev: Option<u64>,
    #[serde(default)]
    pub ino: Option<u64>,
}

impl FileSource {
    pub fn from_path(path: PathBuf) -> std::io::Result<Self> {
        let metadata = fs::metadata(&path)?;
        if !metadata.is_file() {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "not a file"));
        }
        let file_name = path.file_name().map_or_else(|| "file".to_owned(), |name| name.to_string_lossy().into_owned());
        let (dev, ino) = identity(&metadata);
        Ok(Self { size: metadata.len(), modified: modified(&metadata), dev, ino, file_name, path })
    }

    fn verify(&self) -> bool {
        let Ok(current) = fs::metadata(&self.path) else {
            return false;
        };
        let (dev, ino) = identity(&current);
        current.is_file()
            && current.len() == self.size
            && (self.modified.is_none() || modified(&current) == self.modified)
            && (self.dev.is_none() || dev == self.dev)
            && (self.ino.is_none() || ino == self.ino)
    }
}

fn modified(metadata: &fs::Metadata) -> Option<(u64, u32)> {
    let since = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    Some((since.as_secs(), since.subsec_nanos()))
}

#[cfg(unix)]
fn identity(metadata: &fs::Metadata) -> (Option<u64>, Option<u64>) {
    use std::os::unix::fs::MetadataExt;
    (Some(metadata.dev()), Some(metadata.ino()))
}

#[cfg(not(unix))]
fn identity(_metadata: &fs::Metadata) -> (Option<u64>, Option<u64>) {
    (None, None)
}

/// Hash on a blocking thread, checking for cancellation between 1 MiB chunks.
pub async fn hash_file(source: FileSource, cancel: CancellationToken, report: ProgressReporter) -> RunOutcome {
    tauri::async_runtime::spawn_blocking(move || hash_blocking(&source, &cancel, &report))
        .await
        .unwrap_or(RunOutcome::Failed)
}

fn hash_blocking(source: &FileSource, cancel: &CancellationToken, report: &ProgressReporter) -> RunOutcome {
    if cancel.is_cancelled() {
        return RunOutcome::Cancelled;
    }
    if !source.verify() {
        return RunOutcome::Failed;
    }
    let Ok(mut file) = File::open(&source.path) else {
        return RunOutcome::Failed;
    };
    let mut hasher = Sha256::new();
    let mut buffer = vec![0; CHUNK_SIZE];
    let mut read = 0_u64;
    let mut last_report: Option<Instant> = None;
    if source.size == 0 {
        report(1.0, "Hashing empty file…".into());
    }
    loop {
        if cancel.is_cancelled() {
            return RunOutcome::Cancelled;
        }
        let count = match file.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => count,
            Err(_) => return RunOutcome::Failed,
        };
        hasher.update(&buffer[..count]);
        read += count as u64;
        if last_report.is_none_or(|at| at.elapsed() >= REPORT_INTERVAL) || read == source.size {
            last_report = Some(Instant::now());
            #[allow(clippy::cast_precision_loss)]
            report(
                if source.size == 0 { 1.0 } else { read as f64 / source.size as f64 },
                "Calculating SHA-256…".into(),
            );
        }
    }
    if !source.verify() {
        return RunOutcome::Failed;
    }
    if cancel.is_cancelled() {
        return RunOutcome::Cancelled;
    }
    RunOutcome::Completed(FileHashResult {
        file_name: source.file_name.clone(),
        size: source.size,
        sha256: hex::encode(hasher.finalize()),
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    fn source(content: &[u8]) -> (tempfile::TempDir, FileSource) {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("input.bin");
        fs::write(&path, content).unwrap();
        let source = FileSource::from_path(path).unwrap();
        (directory, source)
    }

    #[tokio::test]
    async fn hashes_files() {
        let (_directory, source) = source(b"abc");
        let RunOutcome::Completed(result) = hash_file(source, CancellationToken::new(), Arc::new(|_, _| {})).await
        else {
            panic!("the file hashes")
        };
        assert_eq!(result.sha256, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(result.size, 3);
    }

    #[tokio::test]
    async fn fails_when_the_file_changed() {
        let (_directory, source) = source(b"abc");
        fs::write(&source.path, b"abcd").unwrap();
        assert!(matches!(hash_file(source, CancellationToken::new(), Arc::new(|_, _| {})).await, RunOutcome::Failed));
    }

    #[tokio::test]
    async fn stops_when_cancelled() {
        let (_directory, source) = source(b"abc");
        let cancel = CancellationToken::new();
        cancel.cancel();
        assert!(matches!(hash_file(source, cancel, Arc::new(|_, _| {})).await, RunOutcome::Cancelled));
    }
}
