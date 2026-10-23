# Tauri shell report (Brief 4)

storyForge now runs as a Tauri 2 desktop app on macOS: the window runs the TypeScript core, and a Rust side owns the disk. A universal `.app` and `.dmg` build locally, launch, stay up, and (checked with `lsof`) open no network sockets. Verified by typecheck, 1,109 TypeScript tests and 27 Rust tests, all passing. **What I could not verify:** I cannot see a window. The app was launched and left running for several seconds, but I did not see its page render, click a menu, use the folder picker, close it through the window, or watch FSEvents inside the running app. **Kenny's manual check (below) has not been done, and I have not recorded it as waived.** The branch `tauri-shell` is therefore not merged and not pushed.

## Size

| | End of Brief 3 (`cd2b493`) | End of Brief 4 |
|---|---|---|
| `src/` TypeScript, excluding tests | 12,159 lines | about 13,600 (adds `app/`, `backends/tauri/`, `diagnostic/`) |
| Rust (`src-tauri/`, including its tests) | none | about 2,450 lines |
| TypeScript test files / tests | 53 / 998 | 61 / 1,109 |
| Rust tests | none | 27 |
| Guard table rows | 216 | 234 (existing rows byte-identical; checked against `main`) |

## The window's permissions

`src-tauri/capabilities/main.json` grants the main window exactly these, and `test/tauriConfig.test.ts` fails if anything else appears (or if a command is declared but not granted, or granted but not registered):

- this app's 24 commands: `app_info`, `pick_project`, `open_recent`, `recent_projects`, `project_info`, `close_project`, `scan`, `stat`, `read_text`, `read_binary`, `read_outside`, `write_text`, `write_binary`, `create_file`, `create_folder`, `compare_write`, `rename`, `retire`, `machine_get`, `machine_set`, `watch_start`, `watch_stop`, `download_placeholder`, `quit_ready`
- `core:event:allow-listen`, `core:event:allow-unlisten`, `core:window:allow-destroy`

No `fs`, `shell`, `http`, `dialog`, `opener` or other plugin is a dependency (the test checks Cargo.toml and package.json). The content security policy allows only `'self'` and Tauri's own IPC. The folder picker is native Rust (`rfd`). The window can never send a path back: `open_recent` takes an index into Rust's own recent list.

## Rust commands

All file commands go through one dispatch (`storyforge_fs::api::dispatch`): `scan` (one call, with the text of markdown under storyForge's folders), `stat`, `read_text`, `read_binary`, `read_outside` (read-only, never `_backstage/` or `_sf-backup/`), `write_text`, `write_binary`, `create_file` (also backup and recovery creation), `create_folder`, `compare_write`, `rename` (also the Codex rename), `retire`, `download_placeholder`. Plus the app's own: the picker and recent list, `project_info`, `close_project`, machine settings (an allow-list: `window`, `recent`, `snapshots/<hash>`, `project-ui/<hash>`), the watcher, and `quit_ready`.

## Compare-then-write, and what remains

1. Guard and containment check; read the target and compare **bytes** with the text TypeScript expects (a file holding invalid UTF-8 is a conflict, never rewritten).
2. Write the new text to a temp file beside the target (permissions copied), sync it.
3. **macOS:** exchange temp and target atomically (`renamex_np`, `RENAME_SWAP`); read what was swapped out. If it is not what the caller expected, swap back (the outside version is on disk again) and report a conflict. If it is, check its size, modification time and inode again before removing it: if something wrote into it after it was verified, it is moved to `_sf-backup/recovery/_late-write/` instead of removed, and the call reports the path.
4. **Elsewhere, or a volume without the exchange:** Brief 3's stat check (device, inode, size, mtime before and after) and a plain rename.
5. Create-if-absent and rename use `RENAME_EXCL` (a hard link where unsupported). Tests prove an outside write between the check and the swap wins, a late write is kept, and no temp file is left.

**Remaining window:** an outside writer holding a file handle open across the few syscalls of the exchange could have bytes land in the swapped-out file between the last check and its removal. Narrower than Brief 3's, accepted in decision 24, backed by recovery files and the session backup.

## The watcher

Quiet period **300 ms**, ceiling **2 s** (`WATCH_QUIET`, `WATCH_MAX`, tested with a fake clock), so a sync burst is one batch. A Mac waking from sleep is detected by the wall clock outrunning the monotonic clock by 5 s, and sends a rescan, as does FSEvents' "must rescan". Batch order in `applyBatch`: capture evidence, drop echoes, existing changed files to the prose writer, index learns vanished/appeared files, one change set to the reconciler. (The brief lists the index update last; the reconciler reads the index, so it comes just before it.) A real FSEvents test feeds the batcher in `fs/tests/watcher_live.rs`.

## Closing

The window close button and Cmd+Q both raise `close-requested`. The window flushes within **5 s** (applies to open editors only); on timeout each unsaved session is written to a recovery file instead (tested: exact text). A link rewrite in progress always finishes first (tested); a backup not yet written is abandoned cleanly (tested: no zip, no temp file), except that the session backup is exempt because the final flush wants it. The snapshot is saved, then Rust is told it may close. A Rust watchdog closes the app after 15 s if the window never answers.

## Settings: the 13 fields of the plugin's `data.json`

| Plugin field | Now |
|---|---|
| `hideSeriesPane` | `project.md` `hide-series-pane` |
| `autoFocus` | `project.md` `auto-focus` |
| `layout` | `project.md` `layout` |
| `highlightActiveChapter` | `project.md` `highlight-active-chapter` |
| `automaticBackupEnabled` | `project.md` `automatic-backup` |
| `automaticBackupFrequency` | `project.md` `automatic-backup-frequency` |
| `codexFactSectionByType` | `project.md` `codex-fact-section-by-type` |
| `seriesNumberingStyle` | `project.md` `series-numbering-style` |
| `chapterNumberingStyle` | `project.md` `chapter-numbering-style` |
| `selectedNovel`, `selectedObject`, `collapsedCodexFolderIds` | machine settings, per project (`project-ui/<hash>`), starting from the plugin's values (ruled at H1) |
| `lastAutomaticBackupAt` | not stored: the newest zip's date in `_sf-backup/` |

`project.md` is created or changed only when a setting changes; its first creation also carries over the values in effect from `data.json` (which is never written to). Tested: format 0 with and without `data.json`, unknown keys and comments kept, invalid values ignored, a newer `format-version` read-only (also in Rust: no save, no `project.md`, no recovery file, no backup), a `project.md` that can't be read safely treated as unavailable, and opening twice byte-identical in both formats.

## Timings

Through the real Rust code (via the test bridge, which carries the reply over a pipe rather than Tauri's IPC; Tauri's IPC will differ), on synthetic projects (`npx tsx scripts/measure-scan.ts [chapters] [words]`):

| Project | node-fs open | Rust open | Scan reply |
|---|---|---|---|
| 300 chapters × 2,000 words, 300 Codex notes (3.5 MB of prose) | 219 ms | 276 ms | 615 entries, 4.2 MB of JSON |
| 2,000 chapters × 2,000 words, 300 Codex notes (23 MB of prose) | 978 ms | 1,695 ms | 2,353 entries, 24 MB of JSON |

No paging was needed. **Not measured:** Kenny's vault, and Tauri's own IPC.

## Dependencies

Listed with licences in `Code Attributions.md`. Direct: tauri 2.12 and tauri-build, tauri-plugin-single-instance, rfd, notify (CC0), serde, serde_json, unicode-normalization, base64, libc, objc2 and objc2-foundation (Rust); vite, @tauri-apps/cli, @tauri-apps/api (npm). 495 crates in the lock file. No dependency opened a network socket in the launched app.

## Hold points

- **H1:** eight questions, all ruled (decision 24), recorded in `docs/tauri-shell.md` §12.
- **Rust toolchain missing:** stopped, gave the steps, and installed `rustup` only after Kenny said "install it" (under `~/.cargo` and `~/.rustup`, no profile edits).
- **No guard-table row needed changing.** The Rust guard passed all 216 existing rows first time; new rows were added only.
- **No permission beyond the app's own commands, no macOS-only code outside `platform.rs`, no network request, no disk-format change beyond `project.md`** was needed.
- **A mistake of mine, corrected:** the design gave the window background as #272E33, which is Everforest *Hard*'s `bg0`; Soft Dark's `bg_dim` is #293136 (checked against sainnhe's `palette.md`). Fixed in the config, the first-frame HTML, the tests and the docs.
- **Decision 22 follow-ups** (commit 0): done, with one surprise: the "new novel file already exists" gate can't fire through the detection path, because a folder whose novel file exists counts as an existing book, not a renamed one; that old book is gated as "folder missing" instead and nothing is renamed or overwritten. The early check stays as a safeguard.

## Surprising

- Everything ran identically over the Rust backend on the first complete run: the whole core (open, save, back up, rename a Codex note) produces the same folder over node-fs and over Rust (zip bytes aside), and the Rust guard passed the shared table with no change.
- Tauri 2 needs every command declared in `build.rs` and granted by name; that made the permission test easy and exact.
- `rfd`'s folder picker is async and runs off Tauri's main thread without extra setup.
- A stub can't be told apart from a real hidden file except by name (`.Name.md.icloud`), so the watcher, the index and the scan all apply the same name rule.

## Not done

- **Kenny's check** (manual, on a copy of the vault): open the copy; read the summary, project text and settings sources; rename a chapter and a Codex note in Obsidian while the app is closed and reopen; edit the test chapter in the app and in Obsidian at once; take both backups; quit with unsaved text. **Pending; not waived.**
- **Found in Kenny's check, fixed:** Cmd+Q lost unsaved text. The predefined macOS Quit item ends the process without the window's save-first step. It is replaced by an app Quit item (Cmd+Q) that goes through the close request. Checked by hand on 2026-10-23: typed in a chapter, Cmd+Q, the text was on disk with a session backup, and the Rust log showed close requested then the window finished saving. **Not yet checked by hand:** the red window button and the Dock's Quit.
- The diagnostic window lengthens the chapter autosave to 30 s so the quit check can be done by hand; the core default stays 2 s.
- Seeing the window: layout, dialogs, menus, the real close flow, single-instance focusing, and the real watcher inside the bundle are untested by me.
- The real interface, the editor, notices (including the late-write recovery message), the real Tauri-IPC timing, signing beyond ad-hoc, notarisation, auto-update and macOS CI (Brief 5 and later).
