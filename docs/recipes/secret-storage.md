# Secret storage

Keep secrets (API tokens, refresh tokens) in the operating-system credential store, never in preferences, SQLite, or `localStorage`. The webview must never receive a secret; Rust uses it and returns only the result.

## Add the keyring

```bash
cargo add keyring --manifest-path src-tauri/Cargo.toml --features apple-native,windows-native,sync-secret-service
```

The store is Keychain on macOS, Credential Manager on Windows, and the Secret Service (GNOME Keyring or KWallet) on Linux.

## Wrap it in one module

```rust
// src-tauri/src/secrets.rs
use crate::app_config::APP_ID;
use crate::error::{AppError, AppResult};

fn entry(name: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(APP_ID, name).map_err(|_| AppError::unavailable("The credential store is unavailable."))
}

pub fn set(name: &str, secret: &str) -> AppResult<()> {
    entry(name)?.set_password(secret).map_err(|_| AppError::unavailable("Unable to save the credential."))
}

pub fn get(name: &str) -> AppResult<Option<String>> {
    match entry(name)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(AppError::unavailable("Unable to read the credential.")),
    }
}

pub fn delete(name: &str) -> AppResult<()> {
    match entry(name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(AppError::unavailable("Unable to remove the credential.")),
    }
}
```

## Rules

- Commands may accept a secret once (for example, a sign-in form) and store it; they never return it. Expose "is connected" booleans instead.
- Use a fixed set of names (an enum), not names from the webview.
- Never log a secret. `ResultExt::or_app` logs the underlying error, so map keyring errors before they carry secret material.
- Development and release builds share the service name `APP_ID`; add a `.development` suffix if you need them apart.
