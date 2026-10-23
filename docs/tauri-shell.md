# The Tauri shell: design (Brief 4)

Status: **built.** §1 to §11 are the design as submitted at H1; §12 records Kenny's rulings (decision 24) and §13 everything that came out differently when it was built. Where §12 or §13 disagree with an earlier section, they win.

## 0. Prerequisites on this Mac

Xcode Command Line Tools are installed (`/Library/Developer/CommandLineTools`). **The Rust toolchain is not** (`rustc`, `cargo` and `rustup` are all missing), so nothing from commit 2 onward can be built yet. I have not installed anything. The steps, for you to run:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh     # accept the default install
source "$HOME/.cargo/env"
rustup target add aarch64-apple-darwin x86_64-apple-darwin          # for the universal build
```

Node is 24.18.0. The Tauri CLI comes from npm (`@tauri-apps/cli`), so it needs no separate install.

## 1. Shape

```
src-tauri/            Rust: guard, commands, watcher, platform module (+ tests)
src/backends/tauri/   TypeScript Backend that calls the commands
src/app/              start-up, life cycle (open, schedule, quit), settings
src/diagnostic/       the diagnostic window (Vite, no UI framework)
```

The core in `src/core/` does not change. The window's TypeScript runs the whole core (`openProject`, the prose writer, the reconciler) exactly as the tests do, over `TauriBackend` instead of `NodeFsBackend`. **Rust only ever does file-system work.** Every decision about prose, matching and settings stays in tested TypeScript.

## 2. Window permissions

`src-tauri/capabilities/main.json` grants the main window **only** the app's own commands (listed in §3) and the `core:window`/`core:event` permissions the window itself needs (closing, dragging, listening for watcher batches). **No** `fs`, `shell`, `http`, `opener` or `dialog` plugin is enabled for the window. The folder picker is opened by Rust (`rfd`-style native dialog invoked from a command or from the File menu), not exposed as a plugin: the window never learns about a path the user did not pick. `tauri.conf.json` sets a restrictive CSP (`default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' data:; style-src 'self'`), no remote scripts or fonts, and `withGlobalTauri` off. A test reads the capability and config files and fails if anything outside an allow-list appears.

## 3. Rust commands

All paths are project-relative with `/`; Rust resolves each against the fixed root and refuses any that escape it (`..`, absolute paths, symbolic links whose target leaves the root, checked on the real path of the nearest existing ancestor, as `NodeFsBackend.assertInside` does).

| Command | Purpose |
|---|---|
| `pick_project(kind)` | native folder picker (open / create); sets the root; returns the absolute path |
| `open_recent(index)` / `recent_projects()` | recent list (machine settings) |
| `scan()` | **one call** returning every non-hidden entry (path, kind, size, mtime, `placeholder` flag) and, for markdown under storyForge's eager folders, the text (decision 18). Hidden entries are returned too (the backend contract's `scan` includes them) but without text. |
| `stat(path)` | kind/size/mtime or null |
| `read_text(path)`, `read_binary(path)` | one file |
| `read_outside(path)` | read-only read of a file under the root but outside storyForge's folders (allow-listed use: `.obsidian/plugins/storyforge/data.json`, and link counting for Codex renames); refuses `_backstage/`, `_sf-backup/` |
| `write_text(path, text)`, `write_binary(path, bytes)` | atomic replace (temp, sync, rename); guard `write-file`/`write-binary` |
| `create_file(path, content)` | exclusive create (`RENAME_EXCL` on macOS); guard `create-file`, `backup-create`, `recovery-create` |
| `create_folder(path)` | `mkdir -p`; guard `create-folder` |
| `compare_write(op, path, expected, text)` | §4; `op` is `prose-write` or `link-rewrite`, so the guard sees the intent |
| `rename(op, from, to)` | exclusive; `op` is `rename` or `codex-rename` |
| `retire(path)` | into `.trash/`, never overwriting |
| `download_placeholder(path)` | macOS only: ask for the download, resolve when the real file exists or on timeout |
| `watch_start()` / `watch_stop()` | §6 |
| `machine_get(name)` / `machine_set(name, json)` | window state, recent list, snapshots (one allow-listed file per name, in the app data folder) |
| `quit_ready()` | called by the window when it has flushed; lets Rust close |

Everything is exposed to the window as typed wrappers in `src/backends/tauri/`; the window cannot name a path outside the root, an op the guard doesn't know, or a machine-settings file outside the allow-list.

### Transport of `scan`

IPC is JSON. A large manuscript could make the first scan tens of megabytes. Plan: one call, text of eager files included, measured at commit 4 against a synthetic 2,000-chapter project. If it is too slow, the same call pages its result (still bulk, never per-file). The scan's eager rule (which folders have text read) is duplicated in Rust; both implementations are checked against one list, `EAGER_ROOTS`, which I will put in the guard-spec folder as `scan-spec.json` so the two cannot drift.

### Hashing

**TypeScript only.** The index hashes in the window (`sha256Text`) from the text `scan` returns, as today. Rust never hashes, so no second implementation and no test vectors are needed.

## 4. Compare-then-write in Rust

1. Resolve and guard-check. Read the target; if its bytes differ from `expected` (UTF-8 bytes of the caller's last-known text), return `conflict` (nothing written).
2. Write the new text to a temp file beside the target (dot-prefixed, `.tmp`, exclusive create), `fsync` it.
3. **macOS:** `renamex_np(temp, target, RENAME_SWAP)` exchanges the two atomically. Then read the file now at the temp path (what was swapped out) and compare it with `expected`. Equal: unlink the temp file, return `written`. Different (an outside writer got in after step 1): swap back with a second `RENAME_SWAP`, unlink the temp file, return `conflict`; the outside version is on disk again.
4. **Elsewhere, or if `RENAME_SWAP` is unsupported** (non-APFS volumes): fall back to Brief 3's stat check (device, inode, size, mtime before and after the read) and a plain rename.
5. Create-if-absent: write a temp file, `renamex_np(RENAME_EXCL)`; `EEXIST` means someone else created it.

**Remaining window.** An outside writer that *writes in place* to the target between steps 1 and 3 and finishes before the swap is detected (step 3 compares the swapped-out file). One that is *still writing* through an already-open handle when the swap happens keeps writing into the swapped-out inode: after the swap-back its bytes are on the original file again (they land where the inode now lives), but bytes written between the comparison and the swap-back to the *swapped-out* inode could be lost if that inode is the temp file we unlink. This is the same family of risk as Brief 3's, narrower (an open handle across a few syscalls rather than a path-level race), and is backed by recovery files and the session backup. It is documented again in the report.

## 5. The Rust guard

`src-tauri/src/guard.rs` implements the same decision function as `src/core/backend/guard.ts` and is exercised by a Rust test that reads `test/guard-spec/guard.json` and checks every row (216 today, plus the new rows below). Path rules: backslash is a separator, `.`/empty segments dropped, `..` resolved or refused, NFC normalisation (`unicode-normalization` crate), case-insensitive comparison for protected-folder variants. Symbolic links are resolved at the command layer, not by the table; the new rows therefore carry a `symlink` field naming a link the test creates in a temp project (`links-out -> /tmp/x`), and the TypeScript guard test builds the same on disk through the node-fs backend. Rows for `project.md`: allow `write-file` and `frontmatter-edit` for `_backstage/storyforge/project.md` and nothing else new.

If a row cannot be passed in Rust, that is a hold, not a table edit.

## 6. The watcher

- **Rust:** the `notify` crate (FSEvents on macOS), recursive on the root, ignoring `_sf-backup/`, `.trash/` and hidden folders (except the one `data.json` path, which is read only at open, never watched). Events are collected and sent to the window as one batch: `{ paths: string[], rescan: boolean }`.
- **Settling time: 300 ms of quiet**, with a **2 s ceiling** so a long burst still flushes. These are timing constants (`WATCH_QUIET_MS`, `WATCH_MAX_MS`), named and tested with a fake clock, not classification rules.
- **`rescan: true`** when FSEvents reports it dropped events (`MustScanSubDirs`), the Mac wakes from sleep (Tauri/OS power event), or the watcher restarts.
- **The window applies a batch in the order of Brief 4 §3.4:** (1) capture evidence for vanished paths from the index; (2) drop echoes (disk text hash equals the index's); (3) pass existing changed files to `ProseWriter.onDiskChanged`; (4) give vanished/appeared paths plus evidence to `reconcileChanges`; (5) update the index. `rescan` runs `Project.open`-style rescan and `reconcileAtOpen`-style reconciliation against the *live* index instead of a snapshot.
- An iCloud stub (`.Name.md.icloud`) becoming its real file, or the reverse, is the same file changing state: the batch classifier maps a stub path to its real path first, so it is never a vanish/appear pair.
- The batch logic is a pure TypeScript module (`src/app/applyBatch.ts`) so it is tested without Tauri.

## 7. Settings

**`_backstage/storyforge/project.md`** (decision 23): YAML frontmatter edited with `editFrontmatter`. Keys use the dash-case of the other backstage files. The 13 fields of `StoryForgePluginSettings` in `plugin-harness-final`, and where each goes:

| Plugin field | Goes to | Note |
|---|---|---|
| `hideSeriesPane` | `project.md` `hide-series-pane` | interface preference |
| `autoFocus` | `project.md` `auto-focus` | which face opens |
| `layout` | `project.md` `layout` | panel layout |
| `highlightActiveChapter` | `project.md` `highlight-active-chapter` | |
| `selectedNovel` | **machine** (per project) | a position in the UI, not a preference (**question 3**) |
| `selectedObject` | **machine** (per project) | same |
| `collapsedCodexFolderIds` | **machine** (per project) | same |
| `automaticBackupEnabled` | `project.md` `automatic-backup` | |
| `automaticBackupFrequency` | `project.md` `automatic-backup-frequency` | `every-open` / `daily` / `weekly` |
| `lastAutomaticBackupAt` | **not stored** | derived from the newest zip's date in `_sf-backup/` |
| `codexFactSectionByType` | `project.md` `codex-fact-section-by-type` | map |
| `seriesNumberingStyle` | `project.md` `series-numbering-style` | |
| `chapterNumberingStyle` | `project.md` `chapter-numbering-style` | |

Plus `format-version: 1`. Rules: no file means format 0 with defaults, or values read once (via `read_outside`) from `.obsidian/plugins/storyforge/data.json`, never written to it; the file is created or edited only when a setting changes; unknown keys survive (minimal-diff editor); a higher `format-version` opens the project read-only (the Rust guard is told read-only at open and refuses every write; the app says why). A `settings` object records for each value its source (`project.md`, `data.json`, default) for the diagnostic window.

**Machine settings** in `~/Library/Application Support/io.github.kennyrn.storyforge/`: `window.json` (size, position), `recent.json`, `snapshots/<sha256 of absolute project path>.json` (the Brief 3 `NodeFsSnapshotStore` format, written by Rust through `machine_set`).

## 8. App life

- **Single instance** (`tauri-plugin-single-instance`): a second launch focuses the first window and, if given a folder, offers it as the next open.
- **Open** (picker or recent): `openProject` → watcher start → automatic backup if due (`isBackupDue`, newest zip's date as `lastBackupAt`). **Create** (empty folder): `createProject`, then open.
- **Open another project:** flush all, snapshot, stop the watcher, close, then open.
- **Schedule:** at open and every 30 minutes (a timer in the window), per `isBackupDue`.
- **Closing/quitting:** the close request is intercepted; the window runs `flushAll` (recovering what cannot be saved), saves the snapshot, calls `quit_ready`, and Rust closes. **Time limit: 5 s** (`CLOSE_LIMIT_MS`): if flushing has not finished, whatever is still dirty is written to recovery files directly (one recovery write per session, no saves) and the app closes. macOS logout/shutdown goes through the same close request (`RunEvent::ExitRequested`); the system may cut it short, which is why recovery is the fallback.
- **iCloud:** opening a placeholder calls `download_placeholder` (macOS: `NSFileManager startDownloadingUbiquitousItem` through a small `objc2` call in the platform module); the editor opens once the real file exists. Never in bulk.
- **Window:** `"theme": "Dark"`, background colour `#293136` (Everforest Soft Dark `bg_dim`) set on the window itself and on the HTML root before any script runs, so the first frame is not white. Menus: App, Edit (standard roles), Window, File (Open Project…, New Project…).

## 9. The diagnostic window

Exactly §3.8 of the brief: open/new/recent, reconciliation summary, the project as text, the settings with sources, a live watcher log, two backup buttons, one plain textarea that edits one chapter through `ProseWriter`, and scan/open timings. Plain DOM, one stylesheet using Everforest values via named purpose variables (decision "Portability"), no framework.

## 10. Dependencies, build, CI

New npm: `@tauri-apps/api`, `@tauri-apps/cli`, `vite`, `@tauri-apps/plugin-single-instance` is Rust-side only. New crates (licences recorded in `Code Attributions.md`): `tauri` (MIT/Apache-2.0), `tauri-build`, `tauri-plugin-single-instance`, `serde`/`serde_json` (MIT/Apache-2.0), `notify` (CC0-1.0), `unicode-normalization` (MIT/Apache-2.0), `libc` (MIT/Apache-2.0), `objc2` + `objc2-foundation` (MIT), `sha2` is *not* needed (hashing stays in TypeScript), `tempfile` (dev only, MIT/Apache-2.0), and a native-dialog crate for the picker (`rfd`, MIT) instead of the dialog plugin. Every crate is checked for network use (hold point); the app makes none.

Local build: `npm run app:build` → `tauri build --target universal-apple-darwin`, unsigned apart from the ad-hoc signature. CI (Linux) runs typecheck, the TypeScript tests and `cargo test` for everything that does not need macOS (the guard table, path rules, watcher batching with a fake clock, the capability allow-list test); `RENAME_SWAP` tests are `#[cfg(target_os = "macos")]` and run locally. Version `0.1.0`, tag `v0.1.0`. No macOS CI and no release workflow.

## 11. Questions for H1

1. **Bundle identifier.** `io.github.kennyrn.storyforge`, as proposed in the decisions log? It fixes where machine settings live.
2. **Constants.** Watcher quiet period 300 ms with a 2 s ceiling; closing limit 5 s; schedule check every 30 minutes. Agree, or change?
3. **`selectedNovel`, `selectedObject`, `collapsedCodexFolderIds`.** I put these on the machine (per project) because they are where you were, not how you work, and they would change on every click and cause sync conflicts in `project.md`. Decision 23 says interface preferences travel; do these count?
4. **Hashing stays in TypeScript only,** so Rust never hashes. OK?
5. **`scan` as one bulk call with text included,** paged only if measurements demand it. OK?
6. **Folder picker in Rust (`rfd`), not the dialog plugin,** so the window never holds a dialog capability. OK?
7. **Read-only mode** for a newer `format-version`: the guard is told at open and refuses everything; the app does not offer a way around it in v1. OK?
8. **Symlink rows** need a new optional `symlink` field in `guard.json` (a link created by the test harness before the check). This changes the table's *shape*, not any existing row. Acceptable under "pass the table unchanged"?

## 12. H1 rulings (decision 24)

All eight questions were ruled in favour of the proposals, with these additions, which override the sections above where they differ:

- **Bundle identifier** `io.github.kennyrn.storyforge`; it never changes after the first release.
- **Constants:** watcher batch after 300 ms of quiet, 2 s ceiling; schedule check every 30 minutes; closing waits at most 5 s, **and that limit applies only to flushing open editors**. Two operations have their own rules at close: **a link rewrite in progress always finishes first** (stopping halfway would leave links half-updated); **a backup in progress may be abandoned, but cleanly**: its temporary file is removed and no partial zip is ever left under a real backup name.
- **Hashing stays in TypeScript.** Rust compares bytes: TypeScript sends the text it expects to find along with the new text.
- **One bulk scan call including text,** paged only if measurements demand it. The report gives the scan's time and payload size.
- **Folder picker in Rust.** Rust holds the chosen folder itself; the window may be told the path for display but can never send a path back to be treated as the project folder.
- **Read-only for a newer format** means **no writes into the project folder at all**: no saves, no `project.md`, no recovery files, no backups. The snapshot (outside the project) may still be updated.
- **Guard table:** may gain an optional `symlink` field and new rows. Every existing row stays byte-identical; the field is documented beside the table; the TypeScript guard passes the new rows in the same commit as the Rust guard.
- **Swap residual risk accepted, with one more check:** before the swapped-out file is removed, its size and modification time are checked again; if either changed after verification, something wrote into it late, so it is moved into recovery instead of removed.
- **Removing the app's own temporary files** is allowed under the no-delete rule: they never held the author's writing.

## 13. As built: where it differs from §1 to §11

1. **A second Rust crate.** The disk side is `src-tauri/fs` (`storyforge-fs`: paths, the guard, containment, the operations, the batcher, machine settings, the format marker) with no Tauri dependency, so `cargo test -p storyforge-fs` runs on Linux CI. `src-tauri` itself is only the window glue (commands, menu, watcher thread, single instance, close handling).
2. **One dispatch for every command.** `storyforge_fs::api::dispatch` is the only implementation of the file commands. The Tauri commands are a macro over it, and a test binary, `sf-bridge`, runs the same dispatch behind a line-oriented JSON protocol. That is how the TypeScript backend contract suite runs against the real Rust code, not a copy of it.
3. **Backend interface.** `Backend` gained optional *intent* parameters (`writeText`, `createFile`, `rename`, `writeTextIfUnchanged`), so the Rust guard can check the same rule the TypeScript guard just did; `ScanEntry` gained optional `text` and `placeholder`, so the index is built from the one scan with no per-file read. node-fs ignores the extras.
4. **Containment is stricter than Brief 3's.** Both implementations walk the path component by component: an existing component that is a symbolic link leaving the root, dangling, or the final component itself is refused. `NodeFsBackend.assertInside` was rewritten to match; it is public so the table's symlink rows can run against it.
5. **Guard table.** Additions only (existing rows byte-identical, checked against `main`): 13 `symlink` rows, 5 `project.md` rows. The optional `symlink` field is documented in `test/guard-spec/README.md`. A new `test/guard-spec/scan-spec.json` holds the list of folders whose markdown the scan reads; Rust embeds it at compile time and a test checks the TypeScript list agrees.
6. **Rust opens a newer project read-only itself** (`Project::open_checked` reads just the `format-version` key of `project.md`), as well as the window checking, so no write is possible even if the window is wrong. `openProject` has a `readOnly` option that skips reconciliation and ensuring.
7. **Watcher.** `notify` (FSEvents). A stub (`.Name.md.icloud`) is watched and mapped to its real path. Sleep is detected by the wall clock outrunning the monotonic clock by 5 s or more, not by a macOS power notification (no extra platform code). **Batch order:** the brief lists "update the index" last; the reconciler reads the index, so vanished and appeared files are applied to the index *after* evidence is captured and *before* the reconciler runs.
8. **Closing.** `close-requested` is raised for the window's close button and for Cmd+Q / Dock Quit. A Rust watchdog closes the app after 15 s if the window never answers. The session backup is exempt from "abandon a backup on close", because the final flush wants it. The late-write recovery from the swap check is reported through `onLateWriteRecovery` (the diagnostic window logs it); the interface that tells the author is Brief 5's.
9. **Window colour.** The first-frame background is Everforest Soft Dark `bg_dim`, **#293136**. The H1 document said #272E33, which is the *Hard* variant's `bg0`; corrected after checking sainnhe's `palette.md`.
10. **Machine settings** also hold window size and position, restored only if the saved place is still on a screen.
11. **Binary data crosses the command boundary as base64** (backup zips, covers), about a third larger than raw bytes. Fine at manuscript sizes; revisit if a vault holds large media.
12. **iCloud download** asks macOS through `NSFileManager.startDownloadingUbiquitousItem` (the `objc2` crates, in the platform module), one file at a time, waiting up to 60 s.
