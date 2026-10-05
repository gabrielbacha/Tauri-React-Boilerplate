# Manual QA before a release

Automated checks cover logic, the bridge, a clean launch on every platform, and interface flows on Linux. Check these by hand on each platform you ship, with a signed build and a fresh profile.

## Every platform

- [ ] First launch opens one window with the correct name, icon, and theme.
- [ ] Import text and Export text show native dialogs; export overwrites only after confirmation.
- [ ] Choose file to hash shows progress; cancel, retry, and copy digest work; a notification appears when the app is not focused.
- [ ] Edit a document, then close the window and quit: each asks first; Cancel keeps the draft.
- [ ] New Window, then edit and save the same document in both: the second window reports the conflict.
- [ ] Settings → Keyboard shortcuts: record a new binding; it works, and conflicts or reserved keys are rejected.
- [ ] `<protocol>://open/settings` opens Settings, whether the app is running or closed.
- [ ] Settings → Permissions: allow and deny camera and microphone; Test shows the system prompt once and stops the device.
- [ ] Restore previous windows: with it on, quit and reopen restores windows and documents; with it off, one window opens.
- [ ] Check for updates against a published release installs and restarts.
- [ ] On an update installation failure, a native error explains that saved data is preserved and the app must be reopened; the process exits with a failure status and does not restart automatically.

## macOS

- [ ] The app opens without a Gatekeeper warning (signed and notarized).
- [ ] The menu bar shows the app, File, Edit, View, Window, and Help menus, with the saved shortcuts.
- [ ] Closing the last window keeps the app in the Dock; clicking the Dock icon opens the workspace.
- [ ] Traffic lights align with the sidebar controls; the title bar drags the window.

## Windows and Linux

- [ ] The custom minimize, maximize, and close buttons work; double-clicking the title area maximizes.
- [ ] Shortcuts work without a native menu (Ctrl+K, Ctrl+N, Ctrl+, …).
- [ ] Closing the last window runs the quit flow.
- [ ] Windows: SmartScreen accepts the signed installer. Linux: the AppImage starts on the oldest distribution you support.

## Record distribution evidence

Record the app version, operating system/version, architecture, signing status, workflow run URL, and date beside each completed checklist. For the update test, record both the installed version and the newer version, verify the installed app retains saved documents and preferences after restart, and confirm an invalid update signature is refused. Repeat on every platform you ship. Keep unfinished checks visible; unit tests and debug startup checks do not substitute for a signed installation or update.
