# Security model

The webview is untrusted. It runs only the bundled interface and reaches the system through typed Rust commands. It has no Node.js, no global Tauri object (`withGlobalTauri: false`), and no file-system, shell, process, updater, dialog, or clipboard plugin access.

## Commands and capabilities

Every app command is denied unless `src-tauri/permissions/app-commands.toml` lists its `allow-*` permission and `src-tauri/capabilities/desktop.json` grants that set. The capability applies only to windows labelled `window-*`, which only Rust creates. Each command also checks that the calling window is one it registered.

When you add a command:

1. Define it in Rust with explicit input types. Serde rejects unknown fields; validate limits and formats in the command.
2. Add it to `ipc::builder` and its permission to `app-commands.toml`. `pnpm run bindings:check` fails if the two disagree.
3. Return the minimum data the interface needs. Keep paths, credentials, and raw errors in Rust; `AppError` messages are written for people.
4. Call the plugin from Rust. Do not grant a plugin permission to the webview to save a step.

The webview keeps only these grants: event listening, window drag, minimize, maximize, and close (close still runs the unsaved-work check in Rust), webview zoom, OS platform information, logging, and opening `https:` and `mailto:` links.

## Content and navigation

- The CSP allows only bundled scripts and the IPC endpoints. `freezePrototype` is on.
- Navigation away from the bundled origin is blocked in Rust. HTTPS links without credentials and `mailto:` links open in the system handler. Every other scheme (`file:`, `data:`, `javascript:`, plain `http:`) is blocked. In debug builds only the exact development-server origin is also allowed.
- Web content can never open a new window.
- Development builds add a debug-panel capability at runtime. Release builds do not contain it.

## Data

- Deep links become a closed set of intents: `<protocol>://open/home`, `/settings`, and `/tasks/<uuid>`. Credentials, ports, queries, and fragments are rejected. Raw link text never reaches navigation or task input.
- Background tasks are named commands, not a generic executor. The file-hash example keeps the path in Rust and returns only the file name, size, progress, and digest.
- File paths come only from native dialogs in Rust. Text import reads at most 40 KB of strict UTF-8; export writes atomically with owner-only permissions.
- Diagnostics are sanitized: versions, update state, protocol registration, and webview state only.

## Permissions

Notifications, camera, and microphone decisions are denied by default. The app asks with a native prompt and stores `always` or `denied`; session grants stay in memory. Settings resets them. The system webview (WKWebView, WebView2, WebKitGTK) still owns the operating-system prompt for camera and microphone; an app reset does not change OS permissions.

## Updates and signing

The updater verifies a minisign signature on every update against the public key in `tauri.conf.json`, so the feed is authenticated even without OS code signing. Only builds signed with `TAURI_SIGNING_PRIVATE_KEY` produce updater archives; other builds ship installers only and need no updater key. Validate installer releases with `verify-config.mjs --strict`; add `--updates` to require both updater keys. Sign and notarize macOS builds and sign Windows builds anyway, so Gatekeeper and SmartScreen accept the first install. Keep the updater private key out of the repository; `pnpm run setup --updater-key` refuses a path inside it.

## Reporting

Report vulnerabilities privately to the repository owner. Do not open a public issue.
