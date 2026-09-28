use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::Path;

use uuid::Uuid;

/// Write a file so readers see either the old or the new content, never a partial file.
///
/// The temporary file is created exclusively with owner-only permissions, flushed to disk,
/// renamed over the target, and the directory entry is synced. The temporary file is always removed.
pub fn write(path: &Path, content: &[u8]) -> io::Result<()> {
    let directory = path.parent().ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "no parent directory"))?;
    let temporary = directory.join(format!(".write-{}.tmp", Uuid::new_v4()));
    let result = write_temporary(&temporary, content).and_then(|()| fs::rename(&temporary, path));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result?;
    sync_directory(directory);
    Ok(())
}

fn write_temporary(path: &Path, content: &[u8]) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(content)?;
    file.sync_all()
}

/// Persist the rename. Windows cannot open directories this way, and the rename is already durable there.
fn sync_directory(directory: &Path) {
    #[cfg(unix)]
    if let Ok(handle) = fs::File::open(directory) {
        let _ = handle.sync_all();
    }
    #[cfg(not(unix))]
    let _ = directory;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_content_and_leaves_no_temporary_files() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("notes.txt");
        fs::write(&target, "old").unwrap();
        write(&target, b"new").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "new");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn failed_write_keeps_the_original() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("occupied");
        // A non-empty directory cannot be replaced by a file rename.
        fs::create_dir(&target).unwrap();
        fs::write(target.join("keep"), "original").unwrap();
        assert!(write(&target, b"new").is_err());
        assert_eq!(fs::read_to_string(target.join("keep")).unwrap(), "original");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn creates_owner_only_files() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("private.json");
        write(&target, b"{}").unwrap();
        assert_eq!(fs::metadata(&target).unwrap().permissions().mode() & 0o777, 0o600);
    }
}
