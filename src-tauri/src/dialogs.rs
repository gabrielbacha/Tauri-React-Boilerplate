//! Async wrappers around native dialogs. File paths from these dialogs stay in Rust.

use std::path::PathBuf;

use tauri::{AppHandle, Runtime, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult};
use tokio::sync::oneshot;

pub struct Message<'a> {
    pub title: &'a str,
    pub message: &'a str,
    pub kind: MessageDialogKind,
    pub buttons: MessageDialogButtons,
}

pub async fn ask<R: Runtime>(
    app: &AppHandle<R>,
    parent: Option<&WebviewWindow<R>>,
    message: Message<'_>,
) -> MessageDialogResult {
    let (sender, receiver) = oneshot::channel();
    let mut builder =
        app.dialog().message(message.message).title(message.title).kind(message.kind).buttons(message.buttons);
    if let Some(window) = parent {
        builder = builder.parent(window);
    }
    builder.show_with_result(move |result| {
        let _ = sender.send(result);
    });
    receiver.await.unwrap_or(MessageDialogResult::Cancel)
}

pub fn error<R: Runtime>(app: &AppHandle<R>, title: &str, message: &str) {
    app.dialog().message(message).title(title).kind(MessageDialogKind::Error).blocking_show();
}

pub async fn pick_file<R: Runtime>(
    app: &AppHandle<R>,
    parent: &WebviewWindow<R>,
    title: &str,
    filter: Option<(&str, &[&str])>,
) -> Option<PathBuf> {
    let (sender, receiver) = oneshot::channel();
    let mut builder = app.dialog().file().set_title(title).set_parent(parent);
    if let Some((name, extensions)) = filter {
        builder = builder.add_filter(name, extensions);
    }
    builder.pick_file(move |path| {
        let _ = sender.send(path.and_then(|path| path.into_path().ok()));
    });
    receiver.await.ok().flatten()
}

pub async fn save_file<R: Runtime>(
    app: &AppHandle<R>,
    parent: &WebviewWindow<R>,
    title: &str,
    file_name: &str,
    filter: (&str, &[&str]),
) -> Option<PathBuf> {
    let (sender, receiver) = oneshot::channel();
    app.dialog()
        .file()
        .set_title(title)
        .set_parent(parent)
        .set_file_name(file_name)
        .add_filter(filter.0, filter.1)
        .save_file(move |path| {
            let _ = sender.send(path.and_then(|path| path.into_path().ok()));
        });
    receiver.await.ok().flatten()
}
