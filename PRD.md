# PRD — DiskLens (working title)

A **WinDirStat × DaisyDisk** hybrid for macOS. Rust-powered scanning, a beautiful synchronized treemap + tree, and sort/filter/keyboard UX that makes disk archaeology fast and addictive.

**Stack:** Tauri 2 + Rust backend, React 19 + TypeScript + Tailwind v4 + shadcn/ui, Zustand, d3-hierarchy, `@tanstack/react-virtual`, `@tanstack/react-table`.

**Target:** macOS 13+ (arm64 primary, x64 secondary). Windows/Linux possible later (Tauri makes this cheap — no code changes to UI).

---

## 1. Why

You already built this three times:

- **Electron** (`macdirstat/`) — worked, but slow scanning (pure Node `fs`), no real treemap, and tree-view only.
- **Swift native** (`macdirstat-swift/`) — fast, type-safe, great concurrency (actor-based), but no treemap and closed ecosystem.
- **Tauri/Rust** (`WINDIRSTAT/`) — best architecture (treemap + tree, synced selection, virtualized), but single-threaded DFS scan, no persistence, no file-type coloring, no search.

**This build combines the best of all three.** Tauri's cross-platform reach + UI flexibility, Swift's parallelism discipline, Electron's UX polish — and fixes the gaps in each.

### Lessons carried over

| From | Keep |
| --- | --- |
| Electron attempt | Throttled progress (100 items / 150ms), context menu (Reveal/Copy/Trash), color tiers for usage bars, sort by name/size/count bidirectional |
| Swift attempt | Bounded concurrency limiter, FileManager prefetch of resource keys, pause/resume actor pattern, logical vs on-disk size toggle (deferred), FDA guidance UI, bundle-as-file treatment (.app/.pkg) |
| Tauri attempt | d3-hierarchy squarified treemap, synced selection tree↔treemap, virtualized tree rows, issues list for permission errors, Tauri progress events |

### Lessons avoided

- **No pure single-threaded DFS** (Tauri attempt was too slow on large trees).
- **No Node.js `fs`** (Electron attempt was CPU-bound in JS).
- **No "tree view only"** (unbalanced UX — treemap is the hook).
- **No "full rescan only"** — add incremental rescan of a subtree.

---

## 2. Product Principles

1. **Snappy above all.** First pixel on screen in <200ms after launch. First scan results visible in <1s for home directory. No UI freezes ever.
2. **Streaming, not blocking.** Results populate progressively — user sees the biggest folders appear first, before the scan finishes.
3. **Two views, one truth.** Treemap (spatial intuition) + tree table (precision). Hover/click/keyboard-select stays synced across both.
4. **Keyboard-first.** Power users should never touch the mouse. Every action has a shortcut.
5. **Distinctive, not AI-slop.** Opinionated typography, real color palette, depth via gradients — not generic shadcn defaults.
6. **Safe by default.** Destructive actions (delete, trash) require confirmation and are reversible where possible.

---

## 3. Core Features

### 3.1 Scanning Engine (Rust)

**Requirements:**
- Parallel directory traversal using `rayon` or `tokio` with **bounded concurrency** (default: `num_cpus - 1`, user-configurable 1–16).
- Use `jwalk` (preferred) or `walkdir` for fast recursive traversal with parallel walking.
- **Streaming results** — as each directory completes, emit a `scan::partial` event with its aggregated subtree so the UI updates incrementally.
- **Pause / Resume / Cancel** via `AtomicBool` + `parking_lot::Condvar` (keep from Tauri attempt).
- **Progress throttling:** coalesce events to max 10/sec (~100ms) with `currentPath`, `filesScanned`, `dirsScanned`, `bytesProcessed`.
- **Size modes (toggle):**
  - *Logical* (`metadata.len()`) — default, matches Finder.
  - *On-disk* (`metadata.blocks() × 512`) — actual blocks used (APFS compression, sparse files).
- **Symlinks:** listed but not followed; zero-size leaf node. Setting to skip entirely.
- **Bundles:** `.app`, `.pkg`, `.framework`, `.bundle` treated as **single files** by default (user toggle).
- **Errors:** permission denials, unreadable dirs, I/O errors collected in `issues[]` with path + reason. Never halt scan.
- **Hidden files:** included by default, toggle in preferences.
- **Incremental rescan:** right-click any folder → "Rescan this folder" — only that subtree gets re-walked and spliced into the tree.
- **Live watch mode (FSEvents):** after a scan completes, subscribe to FSEvents on the root. File create/delete/resize events patch the tree + treemap in real time, no rescan. Toggle on/off; auto-off above a size threshold to avoid thrash.
- **Volume picker start screen:** before a scan is chosen, show a grid of mounted volumes (internal SSD, externals, network shares) with per-volume free / used ring, icon, and "Scan this volume" CTA — DaisyDisk-style.
- **Hidden / purgeable space accounting:** on macOS, query `APFSContainer` + `volumeAvailableCapacityForImportantUsageKey` to surface APFS snapshots, Time Machine local snapshots, and purgeable space as a distinct top-level rect labeled *"System / Purgeable (N GB)"*. Clicking it opens a drawer explaining + linking to *System Settings → Storage*.

**Data model (Rust → TS):**
```rust
struct DirNode {
  name: String,
  path: String,          // absolute
  size_logical: u64,
  size_on_disk: u64,
  file_count: u64,       // descendant count
  dir_count: u64,
  modified_ms: i64,
  kind: NodeKind,        // Dir | File | Symlink | Bundle
  extension: Option<String>,
  children: Vec<DirNode>,
}
```

**Performance targets:**
| Scenario | Target |
| --- | --- |
| Home dir (~500k files, SSD) | < 15s to full result, first results visible < 500ms |
| 1M files | < 60s |
| Memory during 1M-file scan | < 400 MB |
| UI frame rate during scan | ≥ 55fps (never drops below 30) |

### 3.2 Visualizations

Three synchronized view modes (tab-switch in the main pane, or `Cmd+1/2/3`). All three share selection, filters, and the detail panel.

#### 3.2.a Treemap (WinDirStat-style, cushioned)

- **Algorithm:** squarified treemap via `d3-hierarchy`. Recomputed on zoom or filter.
- **Render:** Canvas2D (not SVG) for performance with >5k rects. Offscreen canvas for hit-testing.
- **Cushion shading (the iconic WinDirStat look):** each rect is rendered with a soft "pillow" gradient — diagonal light from top-left, shadow at bottom-right — so nested hierarchy is visible *inside* a single rect without subdividing. Implemented via a per-rect radial/linear gradient pass on the canvas, with shading intensity proportional to node depth. Toggleable (flat vs cushion) in preferences.
- **Coloring modes (toggleable):**
  1. **By file type** (default) — color palette by extension group:
     - Code (`.ts`, `.py`, `.rs`, `.go`, `.java`…) — **cyan**
     - Media video (`.mp4`, `.mov`, `.mkv`…) — **magenta**
     - Media audio (`.mp3`, `.flac`, `.wav`…) — **amber**
     - Images (`.jpg`, `.png`, `.heic`, `.raw`…) — **violet**
     - Documents (`.pdf`, `.docx`, `.md`…) — **emerald**
     - Archives (`.zip`, `.tar`, `.dmg`…) — **slate**
     - Binaries / apps (`.app`, `.exe`, `.dmg`) — **rose**
     - System / cache — **neutral**
     - Other — **muted gray**
  2. **By size heat** — green → yellow → red gradient by relative size.
  3. **By age** — recent (bright) → old (dim), based on `modified`.
- **Interaction:**
  - Hover → tooltip with name, size, file count, full path; highlight corresponding tree row.
  - Click → select (highlight in tree + detail panel).
  - Double-click → zoom in (drill into that directory; breadcrumb updates).
  - Shift+click → multi-select for bulk actions.
  - Right-click → context menu (Reveal in Finder, Copy Path, Move to Trash, Rescan).
- **Zoom out:** breadcrumb click, `Cmd+[`, or "Escape to parent".
- **Labels:** show filename only if rect ≥ 64×24 px; otherwise hover-only. Truncate with ellipsis, show extension even when truncated.
- **Transitions:** 200ms ease-out on zoom; staggered fade-in for new rects as scan streams.
- **Select parent / Select in tree:** two buttons above the treemap — "↑ Parent folder" (zoom out one level) and "Reveal in tree" (scrolls the tree table to the selected rect's row and highlights it). Mirrors WinDirStat's "Select parent" / "Select directory of treemap item."

#### 3.2.b Sunburst (DaisyDisk-style, radial)

- **Algorithm:** `d3-hierarchy` partition layout, rendered as concentric rings via Canvas2D arcs. Root at center, deeper levels outward. Max 6 visible rings; deeper levels accessed by drilling in.
- **Interaction:**
  - Hover a segment → a label "flies" to the center of the ring with name, size, % of parent (DaisyDisk's signature animation).
  - Click → silky zoom into that segment: it expands to fill the ring, becoming the new root; siblings fade, children fan out. ~350ms ease.
  - Scroll wheel / pinch → zoom out one ring level.
  - Arrow keys → scrub through siblings; up/down traverses ring levels.
- **Coloring:** same file-type palette as treemap; inherits color mode toggle. Saturation dims with ring depth for visual hierarchy.
- **Gaps:** 1° angular gap between siblings to keep boundaries readable; no gap for segments <2° (merged into "Other" slice that's clickable to expand).
- **When to use:** better for "what's eating space at the top level" at a glance; users often prefer it aesthetically. Treemap wins for dense deep hierarchies.

#### 3.2.c File-type Legend Panel (WinDirStat "Extension List")

- Right-side collapsible panel (or bottom strip, user-configurable) listing every extension found in the current scope.
- Columns: **color swatch**, **extension** (`.mp4`, `.txt`…), **total size**, **file count**, **% of scope**.
- Sortable by size / count / extension; search filter at top.
- **Click an extension** → all matching rects in the treemap/sunburst light up; all others dim to ~20% opacity. Toggle off by clicking again or pressing `Esc`.
- **Shift-click** multiple extensions → union highlight.
- **Right-click an extension** → "Select all of this type" (adds to multi-select for bulk actions), "Filter out this type," "Add to Collector."
- Scopes follow the current zoom level (treemap/sunburst root), not the entire scan — so drilling into a folder rebuilds the legend for that subtree.

### 3.3 Tree Table (WinDirStat-style, precise)

- **Virtualization:** `@tanstack/react-virtual` (keep from Tauri attempt). 32px row height.
- **Columns (all sortable, bidirectional, click header to toggle):**
  1. **Name** (with fold/unfold chevron, icon by type, indent by depth)
  2. **Size** — human-readable (1.2 GB), right-aligned, monospace
  3. **% of parent** — inline proportional bar (colored by % tier) + number
  4. **% of root** — inline proportional bar
  5. **Files** — descendant file count (this is the "sort by files" the user specifically asked for)
  6. **Folders** — descendant folder count
  7. **Modified** — relative time ("3d ago"), tooltip with exact date
  8. **Type** — extension / "Folder" / "Bundle"
- **Column management:** drag to reorder, right-click header to show/hide, persisted in config.
- **Expand/collapse:**
  - Click chevron or press Right/Left arrow.
  - `Opt+click` to expand/collapse all descendants.
  - Root auto-expanded after scan; top 3 largest children also auto-expanded.
- **Proportional bars:** 6-tier color scale from Electron attempt (red/orange/yellow/green/blue/purple) — drives "hot spots jump out."
- **Multi-select:** Shift for range, Cmd/Ctrl for toggle; footer shows combined size.

### 3.4 Synced Selection

- Selection lives in a single Zustand store (`selectedPath: string | null`, `multiSelect: Set<string>`).
- Clicking in treemap / sunburst / legend / tree all update the same selection.
- Tree scrolls to the selected row + expands ancestors; treemap scrolls+flashes the matching rect; sunburst rotates the relevant segment to the top.
- Keyboard arrow nav in any view updates the others in real time.

### 3.5 Filters & Search

- **Top bar search** (`Cmd+F`) — fuzzy match on name, live filter both tree and treemap.
- **Filter chips:**
  - Size threshold (>100MB, >1GB, custom).
  - File type group (toggle each).
  - Modified window (last 7d, 30d, 1y, older, custom range).
  - Hidden files (show/hide).
- **"Show only largest N"** — quickly reduce clutter to top 20/50/100 items.
- All filters operate on rendered view; data is not re-scanned.

### 3.6 Actions (Context Menu + Keyboard)

Per-node actions:
| Action | Shortcut | Confirm? |
| --- | --- | --- |
| Reveal in Finder | `Cmd+R` | no |
| Open | `Cmd+O` or `Enter` | no |
| Copy Path | `Cmd+Shift+C` | no |
| Copy Name | `Cmd+C` | no |
| Move to Trash | `Cmd+Delete` | yes (single confirm) |
| Delete Permanently | `Cmd+Shift+Delete` | yes (double confirm, typed name) |
| Compress to ZIP | `Cmd+Shift+K` | no |
| Rescan this folder | `Cmd+Shift+R` | no |
| Quick Look preview | `Space` | no |
| Show info | `Cmd+I` | no |

Bulk actions available for multi-select.

### 3.7 Navigation

- **Breadcrumb bar** (persistent, top) — click any segment to jump/scope.
- **Back/Forward** (`Cmd+[` / `Cmd+]`) — nav history across zoom levels & rescans.
- **Recent scans sidebar** — left rail with list of recently scanned roots, last scan time, total size. Click to reopen (cached) or rescan.
- **Favorites / Pinned roots** — Home, Desktop, Downloads, /Applications, custom.

### 3.8 Detail Panel (right rail)

Shown when a node is selected:
- Icon (Finder icon for files, generic for folders).
- Name, full path (copyable).
- **Size** — both logical and on-disk side-by-side, with compression ratio if different.
- File count, folder count.
- Created / modified / last opened timestamps.
- Owner & permissions (macOS).
- Extension + UTType.
- **Quick Look thumbnail** (embedded `NSQuickLook` via Tauri command) for files.
- Action buttons mirroring context menu.

### 3.9 Summary / Stats Bar (bottom)

- Root path, total size (logical + on-disk), total files, total folders, scan duration, last scanned.
- Pause/Resume/Cancel controls if scanning.
- Issues count chip — click to open a drawer listing all permission/IO errors.

### 3.10 Persistence

- **SQLite** via `tauri-plugin-sql` or `rusqlite`:
  - Scan history (root, timestamp, total size, snapshot id).
  - Optional tree snapshots (compressed JSON or custom binary) for instant-reopen without rescan.
  - **Scan diff:** select any two snapshots of the same root → produces a unified tree where each node is tagged `new`, `grown`, `shrunk`, `unchanged`, `deleted`. Renders in a dedicated diff view: treemap tints green/red by delta, tree column "Δ Size" becomes primary sort. Answers "what blew up since last week?"
- **Preferences** (settings.json via `tauri-plugin-store`):
  - Concurrency, size mode, bundle-as-file, hidden files, color mode, column order/visibility, theme.
- **Window state** — size, position, sidebar widths.

### 3.11 Permissions / Full Disk Access

- On first launch, onboarding screen explains FDA.
- "Open System Settings" button deep-links to Full Disk Access pane.
- If scan hits permission denials, surface a non-blocking banner: *"N folders skipped. Grant Full Disk Access to scan everything."*
- Never silently fail — always show issues count.

### 3.12 Collector Tray (DaisyDisk's killer pattern)

Rather than delete files one-by-one, users curate a "to delete" pile and purge atomically.

- **Persistent tray docked at bottom of the window** (collapsible). Shows count + running total size of collected items, and a big **"Delete N items · 4.2 GB"** button.
- **Add to collector:**
  - Drag any rect (treemap/sunburst) or tree row into the tray.
  - Right-click → "Add to Collector" (`Cmd+K`).
  - Multi-select + `Cmd+K` to batch-add.
- **Tray contents** are a scrollable list with name, path, size, thumbnail, and a per-item remove button.
- **Review step:** clicking "Delete" opens a confirmation sheet summarizing what will be moved to Trash (default) or deleted permanently (if Shift is held). Sheet shows total reclaimed + breakdown by type.
- **Undo:** after Trash operation, a toast offers 10-second undo (Tauri command restores paths from Trash via NSWorkspace).
- **Persistence:** tray contents survive across sessions (stored in sqlite) so users can collect over multiple sessions before committing.
- **Safety guard:** tray refuses to add system-critical paths (`/System`, `/Library/LaunchDaemons`, the app itself) and warns on `~/Library/...` adds.

### 3.13 Cleanup Presets & Custom Commands

One-click "I know what this is" chips for common macOS developer / user junk.

**Built-in presets** (each chip shows current size before running):
- **Xcode DerivedData** — `~/Library/Developer/Xcode/DerivedData`
- **Xcode Archives** — `~/Library/Developer/Xcode/Archives`
- **iOS Simulators (unused)** — `xcrun simctl delete unavailable`
- **Homebrew cache** — `brew cleanup -s --prune=all`
- **npm / pnpm / yarn stores** — global caches
- **Docker images / volumes** — via `docker system df` check, `docker system prune` optional
- **node_modules sweep** — scans for all `node_modules` folders ≥100 MB; shows list with per-project last-modified date so user can nuke abandoned projects only.
- **.DS_Store / Thumbs.db sweep** — recursive delete.
- **iOS device backups** — `~/Library/Application Support/MobileSync/Backup`
- **Mail Downloads** — attachments cached outside the `.mbox`.
- **Safari / Chrome / Firefox caches.**
- **System / app caches** — `~/Library/Caches/*` with opt-in per bundle.
- **Log files** — `~/Library/Logs`, `/private/var/log` (root-required, skipped if no perms).
- **Old downloads** — `~/Downloads` files >90 days old (opens filter view, doesn't auto-delete).

**Preset UX:**
- Each preset is a card with icon, name, "**Scan size**" button (computes first), then "**Review**" button (opens Collector prefilled) → user confirms delete. No preset ever deletes without confirmation.
- Presets run as scoped scans — fast, don't require re-walking the whole disk.

**Custom commands (power users):**
- User-definable "cleanup rules" in Settings — name, glob pattern, optional shell command.
- Bind to right-click menu for folders matching the pattern (e.g. "Clean `node_modules`" appears when right-clicking any folder containing one).
- Sandboxed execution: commands run under user's shell with confirmation; outputs captured and shown in a drawer. Never `sudo` without explicit user flag.

### 3.14 Disk Hygiene (opt-in second pass)

After a scan completes, user can trigger additional analyses that iterate the existing tree (no re-scan):

- **Duplicate finder**
  - Two-phase: (1) group files by size; (2) hash (xxHash3) the groups with ≥2 members. Progress bar, cancellable.
  - UI: list of duplicate sets sorted by *wasted space* (size × (copies − 1)). Expand a set to see all paths; pick which to keep.
  - "Auto-select older / shorter-path / non-canonical" helpers.
  - Send selected losers to the Collector Tray.
- **Old / cold files** — filter: "files not opened in 6+ months AND >100 MB." Renders as a treemap filter overlay + tree rows.
- **Empty folders** — list all folders with 0 bytes of content (ignoring `.DS_Store`). One-click "Add all to Collector."
- **Large files** — top 100 largest files across the scan, flat list, sortable.
- **Recently grown** — if scan history exists, files/folders whose size increased most since last scan.

### 3.15 Multi-Drive / Multi-Root Scans

- Launch multiple scans in parallel — one per mounted volume or arbitrary folder.
- Left sidebar "Recent scans" becomes tabbed by root; switch instantly between active/past scans without losing state.
- Memory-bounded: if system RAM is tight, least-recently-viewed scan's tree is dehydrated to sqlite and rehydrated on switch.

### 3.16 Export, CLI, and Menubar

- **Export:**
  - Treemap / sunburst → PNG (2×/3× retina) or SVG for sharing / docs.
  - Scan data → CSV (flat list) or JSON (tree).
  - Diff report → Markdown ("Storage changes since 2026-04-10").
- **Menubar companion** (optional, toggleable):
  - Live free-space indicator in the macOS menu bar.
  - Dropdown shows: last scan root + size, delta since previous scan, top 3 largest folders, "Open DiskLens" / "Scan now."
  - Uses cached snapshot so it's instant; rescans on demand.
- **CLI companion** (`disklens`):
  - Ships alongside the `.app` via an "Install command line tools" action.
  - `disklens scan ~/Downloads --json` → emits the tree JSON (same schema as export).
  - `disklens scan ~ --top 20` → prints the 20 largest items, ranked.
  - `disklens diff snapshot-a.json snapshot-b.json` → prints delta report.
  - Useful for scripting, cron, CI checks ("fail build if repo >2 GB").

---

## 4. UX / UI Design

### 4.1 Look & feel

- **Typography:** Variable font with character — **Geist** or **JetBrains Mono** for numbers/paths, **Instrument Sans** or **Satoshi** for UI. Not Inter/Roboto/system defaults.
- **Palette:** commit to a real identity. Draft:
  - Base: deep blue-black (`#0A0E1A`) → gradient to soft indigo (`#141A2E`)
  - Surface: glassy near-white with subtle blue tint in light mode
  - Accents: electric cyan (`#00E5FF`) for primary actions, amber (`#FFB547`) for warnings, coral (`#FF5C7A`) for destructive
- **Depth:** subtle radial gradients behind the treemap, soft shadows on cards, backdrop-blur on sidebars.
- **Motion:** snappy (120–200ms) cubic-bezier(0.2, 0.8, 0.2, 1). No bounce. Respect `prefers-reduced-motion`.
- **Icons:** `lucide-react` uniformly; custom file-type glyphs for common extensions.

### 4.2 Layout (default)

```
┌────────────────────────────────────────────────────────────────┐
│  [≡] DiskLens    ⌘F Search       ⏸  ⏹  ↻    [theme] [settings] │
├──────┬─────────────────────────────────────────┬───────────────┤
│Recent│  Breadcrumb: /Users/gabriel > Movies    │ Detail Panel  │
│Scans │ ┌─────────────────────────────────────┐ │               │
│      │ │                                     │ │  [thumb]      │
│~/    │ │        TREEMAP (canvas)             │ │  name.mp4     │
│/Apps │ │                                     │ │  8.4 GB       │
│/Movi │ │                                     │ │  on-disk 7.9  │
│      │ └─────────────────────────────────────┘ │  modified 3d  │
│      │ ┌─────────────────────────────────────┐ │  [actions]    │
│Filte │ │  Tree Table (virtualized)           │ │               │
│rs    │ │   ▸ Name    Size  %  Files  Mod     │ │               │
│[code]│ │                                     │ │               │
│[vid] │ │                                     │ │               │
│[img] │ │                                     │ │               │
├──────┴─────────────────────────────────────────┴───────────────┤
│  /Users/gabriel · 487,213 files · 312 GB · scan 12.4s · ⚠ 3    │
└────────────────────────────────────────────────────────────────┘
```

Resizable splitters between all panels. Sidebar collapsible (`Cmd+\`). Detail panel collapsible (`Cmd+/`).

### 4.3 Empty / loading states

- **Empty (no scan yet):** Large drop zone — "Drag a folder here, or ⌘O to select. Quick picks: Home · Downloads · Applications."
- **Scanning (first 500ms):** Skeleton shimmer on treemap area + tree. Progress ring in center with live path.
- **Signature scan animation:** a small custom looping animation in the progress area (WinDirStat shipped a Pac-Man; we ship something distinctive — e.g. an abstract folder-icon that "inhales" dots, or a minimalist radial sonar pulse tinted with the current color palette). Non-essential but memorable; one of the app's visual hooks.
- **Scanning (streaming):** Treemap rects appear as folders complete. Tree populates top-down. Do not block interaction.
- **Error state:** Friendly copy, action to retry or open Full Disk Access.

### 4.4 Onboarding (first launch)

Three-step wizard:
1. What DiskLens does (short, with mini-animation of a treemap building).
2. Grant Full Disk Access (explanation + "Open System Settings" deep link).
3. Pick a folder to start (Home recommended).

Skippable; "Don't show again" tick.

---

## 5. Performance Nuances (the "super snappy" details)

### 5.1 Scan pipeline
1. **Cold-start trick:** spawn the scanner in a Rust thread immediately on window creation, ready to accept a path the moment user picks one.
2. **Parallel walk:** `jwalk::WalkDirGeneric` with `.parallelism(RayonNewPool(n))`.
3. **Prefetch metadata in the same syscall** where possible (FileManager-style key prefetch on macOS via `getattrlistbulk` if we drop to FFI for the hot path — optional stretch).
4. **Stream, don't batch:** as each top-level directory's subtree completes, emit a `scan::partial` event with the subtree. UI slots it into place — user sees biggest folders *before* scan finishes.
5. **Throttle IPC:** coalesce progress events to ~10/sec. Heavy payloads (subtrees) sent as they complete, not batched every 100ms.
6. **Budget traversal:** if ctrl-pressed, prioritize breadth over depth so the treemap fills in at low detail first, then refines.

### 5.2 Rendering
1. **Canvas treemap, not SVG** — measured 10× faster for >3k rects.
2. **Single requestAnimationFrame draw loop** with dirty-rect invalidation.
3. **Virtualized tree rows** — only render visible.
4. **Memoize** d3 layout per (root, size-mode, filter) tuple.
5. **Lazy detail panel** — don't compute thumbnail / QuickLook until node is selected.
6. **Web workers** for search indexing (fuzzy match across 500k names shouldn't block main thread).

### 5.3 Memory
1. Children stored as `Vec<DirNode>` sorted descending by size on Rust side — avoids expensive re-sorts.
2. Tree snapshot compressed before persistence (MessagePack or `zstd`).
3. Detail panel tears down on deselect.

### 5.4 Responsiveness guarantees
- **No synchronous IPC > 16ms** — split up commands.
- **Input-latency budget:** click → visual ack in < 50ms.
- **React Compiler** enabled (already an option with React 19) — automatic memoization.

---

## 6. Accessibility

- Full keyboard navigation; visible focus rings on all focusable elements.
- Treemap keyboard-traversable: arrow keys move between siblings; Enter zooms in; Escape zooms out.
- VoiceOver labels on all interactive elements.
- Respect `prefers-reduced-motion`, `prefers-color-scheme`.
- Min 4.5:1 contrast for text in both themes.
- Configurable text size (S / M / L).

---

## 7. Technical Architecture

### 7.1 Frontend (React/TS)
```
src/
  app/                   # route-level (if multi-window later)
  components/
    treemap/             # canvas renderer + hit testing
    tree/                # virtualized table
    detail-panel/
    sidebar/
    onboarding/
    common/              # shadcn wrappers
  hooks/
    use-scan.ts          # scan lifecycle + events
    use-selection.ts
    use-filters.ts
  stores/
    scan-store.ts        # Zustand: status, progress, root, tree data
    ui-store.ts          # selection, filters, view prefs
    settings-store.ts
  lib/
    tauri/               # typed wrappers around invoke
    format.ts            # bytes, dates
    colors.ts            # file-type → color
    file-types.ts        # extension → group
```

### 7.2 Backend (Rust)
```
src-tauri/src/
  main.rs
  lib.rs
  scan/
    mod.rs               # public API: start, pause, resume, cancel
    walker.rs            # jwalk integration + bounded parallelism
    node.rs              # DirNode + serde
    progress.rs          # event coalescing
    errors.rs
  actions/
    reveal.rs            # open in Finder
    trash.rs             # NSWorkspace trash
    compress.rs
  persistence/
    history.rs           # sqlite schema
    snapshots.rs
  platform/
    macos.rs             # FDA checks, QuickLook
```

### 7.3 Tauri commands (Rust → JS)
- `scan_start(path, options) -> scan_id`
- `scan_pause(scan_id) / scan_resume / scan_cancel`
- `scan_list_recent() -> Vec<ScanSummary>`
- `scan_open_snapshot(id) -> DirNode`
- `node_reveal(path)`
- `node_trash(paths)` / `node_delete(paths)`
- `node_compress(paths, dest)`
- `node_quicklook(path) -> thumbnail base64`
- `permissions_status() -> { fda: bool }`

### 7.4 Events (Rust → JS)
- `scan::progress` — throttled; `{ scanId, files, dirs, bytes, currentPath }`
- `scan::partial` — streamed subtree deltas
- `scan::completed` — final root node
- `scan::error` — fatal
- `scan::issue` — non-fatal per-path issues

---

## 8. Milestones

### M0 — Foundation (1–2 days)
- Wire existing Tauri shell with shadcn theme, layout shell, router.
- Settings + theme toggle working.

### M1 — Scanner MVP (3–4 days)
- Rust scanner with `jwalk`, bounded parallelism, progress events, issues list.
- Size mode toggle (logical/on-disk).
- Streaming `scan::partial` events.
- Basic tree table (non-virtualized) to prove data flow.

### M2 — Treemap + Tree Sync (3–4 days)
- Canvas treemap with squarified layout.
- Virtualized tree table with all columns including "Files" and "Folders" sort.
- Synced selection, breadcrumb, zoom in/out.

### M3 — UX Polish (3–4 days)
- Context menus, keyboard shortcuts, filters, search.
- Color modes (by type, by size, by age).
- Detail panel with QuickLook thumbnails.
- Onboarding + FDA flow.
- **File-type legend panel** with click-to-highlight.
- **Cushion shading** on treemap.

### M4 — Sunburst + Collector (3 days)
- Sunburst view with silky zoom transitions.
- Collector tray with drag-to-add, batch trash, undo toast.
- Volume picker start screen, hidden/purgeable space accounting.

### M5 — Cleanup & Hygiene (3–4 days)
- Built-in macOS cleanup presets (Xcode, Homebrew, npm, Docker, node_modules sweep, caches).
- Duplicate finder (size-bucket + xxHash3).
- Old/cold files, empty folders, largest files filters.
- Custom cleanup commands UI.

### M6 — Persistence & Diff (2–3 days)
- SQLite history + recent scans sidebar.
- Snapshot save/reopen.
- Scan diff view.
- FSEvents live watch mode.
- Performance audit against targets.

### M7 — Exports & Companions (2 days)
- PNG/SVG/CSV/JSON/Markdown exports.
- Menubar widget.
- CLI companion with install action.

### M8 — Distribution (1–2 days)
- Icon, Info.plist polish, notarization, DMG.
- Auto-update (`tauri-plugin-updater`).

---

## 9. Out of Scope (v1)

- Cloud / remote scanning (SMB, SSH).
- Windows / Linux packaging (architecture supports it; ship later).
- Multi-user / team snapshot sharing.
- Sync / cloud backup of snapshots.
- AI-driven "what should I delete?" suggestions (tempting but risky — v2).

---

## 10. Success Criteria

- Scan home directory in **< 15s** on M1/M2 Mac.
- UI never drops below **30fps** during scan.
- **"Sort by Files"** column is a first-class feature and works on virtualized tree without lag on 500k rows.
- First-time user can scan, spot a big folder, and trash it in **< 60 seconds**.
- Looks distinctive enough that a stranger says "what app is that?" — not "oh, another dir stat."
