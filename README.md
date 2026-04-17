# Tauri Starter

Opinionated Tauri 2 + React 19 starter. Drop in your app logic and ship.

## Stack

- **Tauri 2** — desktop shell, Rust backend
- **React 19** + **TypeScript** (strict)
- **Vite 7** — dev server & bundler
- **TanStack Router** — type-safe routing (code-based, no codegen)
- **TanStack Query** — server state & caching
- **Zustand** — global client state (with localStorage persistence)
- **shadcn/ui** + **Tailwind CSS v4** — components & styling
- **react-hook-form** + **zod** — forms & validation
- **Bun** — package manager & runtime

## Getting started

```bash
bun install
bun run tauri dev
```

Frontend only: `bun run dev` (then open http://localhost:1420).

## Scripts

| Command              | What it does                           |
| -------------------- | -------------------------------------- |
| `bun run dev`        | Vite dev server                        |
| `bun run build`      | Type-check + production build          |
| `bun run tauri dev`  | Run the Tauri desktop app in dev       |
| `bun run tauri build`| Produce platform installers            |
| `bun run typecheck`  | `tsc --noEmit`                         |
| `bun run lint`       | ESLint                                 |
| `bun run format`     | Prettier                               |

## Project layout

```
src/
├── main.tsx              # entry point: Providers + RouterProvider
├── app/
│   ├── router.tsx        # route tree (code-based TanStack Router)
│   ├── root-layout.tsx   # shell: sidebar + header + <Outlet>
│   └── pages/            # route components
│       ├── home.tsx
│       ├── dashboard.tsx
│       └── settings.tsx
├── components/
│   ├── providers.tsx     # Error boundary, Query, Theme, Tooltip, Toaster
│   ├── error-boundary.tsx
│   ├── theme-provider.tsx
│   ├── theme-toggle.tsx
│   ├── debug-panel.tsx   # dev-only, Cmd/Ctrl+D
│   ├── external-link-guard.tsx
│   └── ui/               # shadcn/ui primitives
├── lib/
│   ├── env.ts            # zod-validated env vars
│   ├── query-client.ts   # TanStack Query client
│   ├── tauri.ts          # trackedInvoke / trackedEmit
│   └── debug-events.ts
├── stores/
│   └── app-store.ts      # Zustand example (persisted)
└── index.css             # theme tokens, fonts, background

src-tauri/
├── src/lib.rs            # plugin registration, commands
├── capabilities/         # permission manifests per window
└── tauri.conf.json       # app metadata, bundle config
```

## Adapting this starter

Before writing any feature code, update these identity fields:

1. `package.json` → `name`
2. `src-tauri/Cargo.toml` → `name`, `description`, `authors`, `lib.name`
3. `src-tauri/src/main.rs` → match the new `lib.name`
4. `src-tauri/tauri.conf.json` → `productName`, `identifier`, `windows[0].title`
5. `index.html` → `<title>`
6. `src/components/app-sidebar.tsx` → brand label (currently "Tauri Starter")
7. Replace icons in `src-tauri/icons/` (use `bun run tauri icon <path-to-1024.png>`)

## Tauri plugins pre-wired

| Plugin              | Rust crate                       | Frontend API                          |
| ------------------- | -------------------------------- | ------------------------------------- |
| opener              | `tauri-plugin-opener`            | `@tauri-apps/plugin-opener`           |
| log                 | `tauri-plugin-log`               | `@tauri-apps/plugin-log`              |
| dialog              | `tauri-plugin-dialog`            | `@tauri-apps/plugin-dialog`           |
| notification        | `tauri-plugin-notification`      | `@tauri-apps/plugin-notification`     |
| clipboard-manager   | `tauri-plugin-clipboard-manager` | `@tauri-apps/plugin-clipboard-manager`|
| os                  | `tauri-plugin-os`                | `@tauri-apps/plugin-os`               |
| store               | `tauri-plugin-store`             | `@tauri-apps/plugin-store`            |
| process (desktop)   | `tauri-plugin-process`           | `@tauri-apps/plugin-process`          |
| updater (desktop)   | `tauri-plugin-updater`           | `@tauri-apps/plugin-updater`          |

Add or remove plugins in `src-tauri/src/lib.rs` and grant permissions in
`src-tauri/capabilities/default.json`. See live examples on `/settings`.

## Calling Rust from the frontend

```tsx
import { trackedInvoke } from "@/lib/tauri"

const message = await trackedInvoke<string>("greet", { name: "world" })
```

Define new commands in `src-tauri/src/lib.rs` and register them in
`invoke_handler!`. `trackedInvoke` logs every call to the dev-only debug panel.

## Environment variables

Public vars must be `VITE_`-prefixed. Add them to the schema in
`src/lib/env.ts` for compile-time safety — invalid env throws at startup
instead of becoming a silent `undefined`. Copy `.env.example` → `.env.local`.

## Theming

- Light/dark/system with `next-themes`-style context in `theme-provider.tsx`
- Toggle via the header dropdown or press `D`
- Palette lives in `src/index.css` as OKLCH CSS vars — edit `--primary`,
  `--background`, etc. to rebrand. Default is warm stone + amber.
- Fonts: Geist (UI) + JetBrains Mono (code). Swap via `@fontsource-variable/*`.

## Debug panel

Dev-only. Press `Cmd/Ctrl+D` to toggle. Shows window/app/theme diagnostics,
invoke call log with timing, runtime events, console capture, and error
tracking. Dockable to left/right/bottom (persisted in sessionStorage).

## Updater

Stub config in `tauri.conf.json` points at `https://example.com/...` with a
placeholder pubkey. Generate a signing key (`bun run tauri signer generate`),
wire a release server, and fill in both fields before shipping auto-updates.

## Notes

- No router codegen — route tree is declared in `src/app/router.tsx`
- No `Inter`/`Roboto`/system defaults; Geist is the default UI font
- `body { overflow: hidden }` + a `[data-ui-scroll-container]` root makes the
  shell feel native (no rubber-band, no page-level scroll)
- External links (`http`, `https`, `mailto`, `tel`) are intercepted by a custom
  Rust plugin and opened in the system browser, not the webview
