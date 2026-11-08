# Windows (Brief 22): H1, the survey and proposals

Written 8 November 2026 on branch `windows`, from `v1.12.4`. **Nothing but this file has changed.** Evidence: the Windows job of CI run 42494990768 (v1.12.4, `windows-latest`), and a read of the Rust and TypeScript sources. Nothing here has been run on a real Windows machine; what only the runner or the friend can show is marked **unproved**.

## 0. The five findings that matter most

1. **The Windows run has been passing the safety suite vacuously.** The Rust bridge (`sf-bridge`) could not be built on the runner ("could not build the Rust bridge, the Tauri backend contract suite will be skipped"), so `contract.test.ts`, `tauri.test.ts` and the "over the Rust backend" blocks of `settings.test.ts` and `appLife.test.ts` were **skipped**, not passed. Cause: `test/helpers/rustBridge.ts` finds `cargo` only at three Mac paths or through `which`, joins `PATH` with `:`, and looks for `sf-bridge` with no `.exe`. **Until this is fixed, "the disk-safety suite passes on Windows" would prove nothing about the Rust disk code.** This is the first fix, and the Windows run should fail (not skip) when the bridge is missing.
2. **Every `npm test` failure on Windows (28 tests, 8 files) is the test setup, not the app** (§1). The app's own handling of CRLF held.
3. **`cargo test --workspace` has never run on Windows**: `tauri-build` stops at the missing `icons/icon.ico`. So the Rust suites are untested there. `cargo test -p storyforge-fs` (no Tauri) can run today and should be added as its own step.
4. **Windows has no atomic swap.** On the Mac, compare-then-write uses `renamex_np(RENAME_SWAP)`; elsewhere it falls back to `stat_checked_replace`, which leaves a small gap between the check and the rename, and `fs::rename` fails if another program holds the target open (§3). This is where the real work is.
5. **File renames use a hard link, then delete the old name** (`rename_unguarded`). On Windows the delete can fail while another program has the file open, which would leave **two names for one file** (§3.4).

## 1. CI's failures, traced

| Failure (Windows run) | Count | Cause | Fix |
|---|---|---|---|
| `expected 'x\r\n' to be 'x\n'` in `proseWriter`, `openProject`, `project` tests; fixtures read back with `\r\n` | 10 tests | **git's checkout.** Git for Windows converts line endings at checkout by default (`core.autocrlf=true`), so every committed LF fixture and every `\n` template written in a test lands with CRLF. The app then did the right thing and **kept the file's CRLF** on save. | `.gitattributes`: `* text=auto eol=lf` for text, `*.png *.jpg *.woff2 …` binary. Proposed. |
| `protectedAgreement`: tree and old line scan disagree on `test/fixtures/README.md` | 1 | Probably the same CRLF (not confirmed; check after `.gitattributes`). | Same `.gitattributes`. |
| `architecture.test.ts`: 14 failures, `'core\\proseWriter.ts'` | 14 | **Paths in the tests**, not the app: `path.relative` returns `\`, and the test compares it with `core/proseWriter.ts`. | Test helper `toPosix(path.relative(...))`. The core already works in `/` (`resolve_path` and `pathRules.ts` convert `\` at the edge). |
| `defaultRules`: `theme\purposes.css` vs `theme/purposes.css` | 1 | Same. | Same helper. |
| `releaseBuild`: `spawnSync npx ENOENT` | 1 | `execFileSync("npx", …)`: on Windows `npx` is `npx.cmd`, which cannot be spawned without a shell. | Run `node` on `node_modules/vite/bin/vite.js` (no shell, same on both systems). |
| `typingGuard`: "key-posting helper could not be built … `ApplicationServices` not found" | 1 | A **Mac-only helper's test** (`postkey.c`, `-framework`). | Skip on non-Mac, named in the test; it is a Mac script's test. |
| (silent) the four Rust-bridge suites | skipped, not failed | See finding 1. | See §3.5. |
| `cargo test --workspace`: `icons/icon.ico` not found | all | `tauri-build` needs it on Windows. | Make `icon.ico` from `storyForge.svg`/the 1024 px source (multi-size 16 to 256). |

**Counting the line endings you asked about:** of the 28 failing tests, 11 are git converting files at checkout (proseWriter 6, openProject 2, project 2, and probably protectedAgreement 1), 15 are path separators in the tests (architecture 14, defaultRules 1), 1 is `npx` and 1 is the Mac helper. **None comes from the app writing CRLF.** The app writes CRLF only into a file that already uses it.

**Path rule (proposed):** the core and the Rust crate keep working in `/`, converting only at the operating system's edge (already true: `resolve_path` turns `\` into `/`, rejects drive letters and rooted paths). The remaining `/`/`\` uses are in tests and scripts, which get one `toPosix` helper. Three places still assume Unix and need checking in the port: `rustBridge.ts` (`PATH` separator), `scripts/lib/*` (Mac only, left alone), and the display of the home folder (§5).

**Spawning commands by name:** only `releaseBuild.test.ts` (`npx`) and `rustBridge.ts` (`which`, `cargo`) run on CI. The `scripts/*-smoke.mjs` built-app drivers (`osascript`, `screencapture`, `pgrep`, `clang`) are Mac-only by design and stay so.

## 2. Line endings in the writing itself

**What the app does now** (decision 22): a chapter's body is held with `\n` in the editor; `parseChapterFile` records the file's first line ending (`eol`) and the save restores it, so a CRLF chapter stays CRLF. Mixed endings are made consistent in the file's **first** style on the first save, with a notice (`normalizedLineEndings`). Frontmatter edits (`frontmatter.ts`) detect the file's ending and splice in it; the Rust `write_text` keeps CRLF when the existing file has it. `compare_write` writes exactly the text it is given.

**On Windows with Notepad:** modern Notepad keeps a file's endings, but older Notepad, some editors and git can switch a file wholesale to CRLF. That is already handled: the file's style wins and is kept.

**Proposed rule (both platforms): never change a file's endings behind the author's back.** Three changes to make it true:
1. Keep keeping the first style, and for a **new** file use `\n` (the same on both systems; no `autocrlf`-like guess).
2. **Mixed endings: stop normalising silently.** Today the first save rewrites every line ending in the body to the first style and tells the author after. Proposed: a file with mixed endings is saved **in the endings it has** (line for line) where the changed span allows it; where it does not, keep today's normalising but make the notice say which style was used. This needs a ruling because it changes decision 22 and the notice. **Not changed without Kenny.**
3. A test that fails if any write path (prose, frontmatter, Codex rename, link rewrite, session files, `project.md`) changes the ending style of a file whose endings were uniform. The fuzzers already cover prose and links; the others need a case each.

## 3. The safety core on Windows

Read from `ops.rs`, `platform.rs`, `containment.rs`. **All of this is unproved until run on the runner.**

1. **Save by temporary file and rename** (`write_atomic`, `create_excl`, `compare_write`): `fs::rename` on Windows replaces the target (Rust uses a replace-existing move, and on current Windows a POSIX-style rename where the file system allows). It **fails with "access denied" or a sharing violation** if another program has the target open without delete-sharing: antivirus scanning it, the search indexer, OneDrive, Notepad with its handle open. These are usually held for milliseconds to a few seconds.
   *Proposal:* on Windows only, retry `rename` on `PermissionDenied`/sharing errors with a short back-off (about 10 attempts over about 2 seconds), then fail as now. The temp file stays beside the target throughout, so a failure loses nothing: the save is reported, the text is still in the editor and the existing "save failed" paths (recovery file) apply.
2. **No atomic swap, a gap in compare-then-write.** `stat_checked_replace` re-reads and compares the identity before renaming; on the Mac the swap closes the gap. Windows has no `RENAME_SWAP`.
   *Proposal:* on Windows, open the target with sharing that **denies other writers** (`FILE_SHARE_READ | FILE_SHARE_DELETE`), compare its bytes through that handle, then rename the temp file over it while the handle is still held, and close it. A program that tries to save in the gap gets a sharing violation instead of a lost write. This needs `std::os::windows::fs::OpenOptionsExt::share_mode`, **no new crate**. How it's proved: the existing `before_swap`/`after_verify` hooks, with a test that holds another handle open (with and without write sharing) and checks the outcomes; a test that the late write is kept, not lost.
3. **Flushing to disk:** `File::sync_all` is `FlushFileBuffers` and works. There is no directory fsync on Windows; the rename's durability relies on NTFS journalling. *Proposal:* accept, state it in `docs/safety-core.md`; `MOVEFILE_WRITE_THROUGH` would need the `windows-sys` crate and is not proposed.
4. **Renaming files** (`rename_unguarded`): a file is renamed by hard link then delete of the old name. On Windows the hard link works on NTFS only (the fallback copy covers FAT/exFAT and network shares), but **removing the old name fails while the file is open elsewhere**, leaving two names for one file, and the code reports an error after the link exists.
   *Proposal:* on Windows, rename with `MoveFileExW` **without** the replace flag (it fails if the target exists, so it is exclusive by itself and atomic). Needs the `windows-sys` crate (a ruling: §9). Fallback if refused: the link, then if the delete fails, remove the new name and report, so there is never a second name left.
   Case-only renames (`jane.md` to `Jane.md`) already hop through a temporary name; the `same` check uses the inode on Unix and is `false` on Windows, so a case-only rename would be refused as "exists". Needs the file id (`GetFileInformationByHandle`) or a case-insensitive compare of the two paths on Windows.
5. **Backups, `.trash/` retirement:** both go through the functions above, so they inherit (1) and (4). Backup zips are created create-only; `_sf-backup` temp names (`.<name>.<hex>.tmp`) start with `.`, which on Windows is only a name (not hidden), so they would show in Explorer. Harmless; noted.
6. **The write guard** is pure string logic over `/` paths and passes `test/guard-spec/guard.json` on both. Windows adds one rule the guard does not have: **reserved names and trailing dots/spaces** (§4).
7. **Containment** (`ensure_inside`) uses `canonicalize`, which on Windows returns `\\?\C:\…` (verbatim) paths; `real.starts_with(root)` compares both after `canonicalize`, so it holds, but a symbolic link needs the "create symbolic links" right, so most Windows users have none. A **junction** (what OneDrive and some tools create) is not `is_symlink()` in Rust and would be followed by `read_dir`. *Proposal:* treat a reparse point (`FILE_ATTRIBUTE_REPARSE_POINT`) as a link, as the Mac code treats a symlink. Unproved.
8. **Machine settings** write with `rename` over an existing file: same retry as (1).
9. **File watching** uses `notify` (`ReadDirectoryChangesW` on Windows). Notepad and others save by write-then-rename or by in-place write; both produce events the batcher already coalesces. The 0.4 s reload timing is a Mac measurement; the friend's test (§9) checks it. A **network drive or OneDrive Files On-Demand folder** may drop events; the existing rescan covers a missed batch.
10. **How it is proved:** (a) fix the bridge so Windows builds and runs `sf-bridge`; (b) `cargo test -p storyforge-fs` as its own Windows step; (c) the whole disk-safety suite, which already runs the same cases over the real Rust code through the bridge; (d) new Windows-only tests for the retry, the held handle, the exclusive rename and the case-only rename. **Retire the "vacuous pass" risk:** on `windows-latest` the suite fails if the bridge is not built.

## 4. File names

Names are made by `paths.ts`/`codex*.ts`/`chapterCreation.ts`, checked by the guard, and compared by NFC and lowercase (`fold_key`). Windows differs:

| Case | On Windows | Today |
|---|---|---|
| Reserved names `CON PRN AUX NUL COM1 to COM9 LPT1 to LPT9`, with or without an extension (`NUL.md`) | cannot be created, or open a device | not refused; a Codex entry "Nul" or a chapter "Con" would fail |
| `< > : " / \ | ? *` | refused | `/` and `\` are refused; the rest are allowed (`:` and `?` are common in titles) |
| Trailing dot or space | silently stripped or refused | not refused |
| Path length over 260 | fails unless the long-path setting is on | no limit; deep Codex trees plus long titles could reach it |
| Case | case-insensitive, preserving; `fold_key` already assumes that | already handled (the Mac default is the same) |
| NFC and NFD | NTFS keeps the bytes it is given and does **not** normalise | `fold_key` compares NFC, so "Zoë" in either form is found; the Mac normalises on its own, Windows does not. The fixture "Zoë Åberg" is the test, **on the runner**: write it NFD on a Mac-style fixture, open, rename, check the links follow |
| A name stored in NFD (made on an old Mac volume) | stays NFD on disk | links match by folded key, so fine |

**Proposal (affects Mac projects, so Kenny rules):** a name check shared by both platforms and applied **only to names the app is about to create or rename** (never to existing files): refuse reserved names, trailing dots and spaces, and the characters `< > : " | ? *` with the existing explaining notice, and warn when a full path would pass 240 characters. The point is that a project written on the Mac must stay openable on Windows, so a name allowed on the Mac but unusable on Windows is the thing to catch. **Not changed without Kenny.** *Existing* projects with such names (a Mac user's "What?.md") cannot open those files on Windows; the proposal is to list them in the reconciliation summary as "cannot be used on Windows", never rename them.

## 5. The Mac-only parts

| Part | On Windows |
|---|---|
| "Show in Finder" (`reveal_in_finder`) | **"Show in File Explorer"**: `explorer /select,<path>`, still only reveals. Same command name, label changed per system. |
| The open panel (`rfd`) | `rfd` has a Windows implementation (the system dialog); no change. |
| The invisible title bar, 28 px drag band, traffic lights (`titleBarStyle: Overlay`, `.sf-titlebar`) | macOS-only. On Windows use the normal title bar and menu bar; the 28 px band and its space for the traffic lights are not drawn (platform flag on the page). This changes the vertical layout by the band's height, so the resting grid (decision 175) and the 28 px top gap need checking in Chromium. |
| Quitting from the Dock, Log Out, `applicationShouldTerminate:` (Fix 1) | Mac-only code. On Windows the quit routes are: Alt+F4 or the close button, File ▸ Exit, and **Windows shutdown/log-off** (`WM_QUERYENDSESSION`/`WM_ENDSESSION`), which gives the app only a few seconds. *Proposal:* route the first two through the existing `request_close`; for shutdown, answer `WM_QUERYENDSESSION` and run the same close with `ShutdownBlockReasonCreate`. Needs `windows-sys` (ruling). **Unproved, and the least certain item here.** If refused, shutdown while a save is pending falls back to the periodic save and the crash-recovery path (the session in progress lives in the app data folder). `test:quit` is Mac only; a Windows route needs its own driver, which nobody can run: the friend's test only. |
| Signals (`SIGTERM`…) | `install_quit_signals` is already a no-op off Unix. |
| iCloud placeholders (`.Name.md.icloud`) | Not on Windows. OneDrive's equivalent is a **cloud-only file** (reparse point / `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`): reading it makes OneDrive download it, on demand. *Proposal:* nothing special for reading (it downloads when read; the open may be slow); do not treat them as placeholders. Say in the README that a project folder should be set to "Always keep on this device". Unproved. |
| Menus (`PredefinedMenuItem::services/hide/hide_others/show_all`, "Emoji & Symbols") | The App menu does not exist on Windows. Settings, About and Quit move to File/Help; Services, Hide and Show All are left out. "Emoji & Symbols" has no menu item; **Win + .** opens the emoji panel, and the special-characters button (editor/lastWriting.ts) stays. |
| `⌘` shortcuts | `CmdOrCtrl` accelerators already map to Ctrl. Three places test `event.metaKey` (⌘-click on a Codex link, ⌘-Return, decision 165): on Windows they test `ctrlKey`. Labels in tooltips and docs say "Ctrl" on Windows. **The Mac keeps ⌘ exactly.** |
| Inactive-window selection (decision 146) | `data-window` is set from focus and blur events, which Chromium also fires; no change expected. |
| Machine settings and recent projects | `app_data_dir()` becomes `%APPDATA%\io.github.kennyrn.storyforge` (Roaming). **Proposal:** use local app data (`%LOCALAPPDATA%`), since the session snapshots and recent paths are per computer and must not roam. `recent_display` shortens `$HOME`; on Windows use `USERPROFILE` and compare case-insensitively with `\`. |
| Text defaults (smart quotes off, spellcheck on, `platform.rs`) | Mac only. WebView2 has no such system substitution; spellcheck is on in the editable areas by default. Check the red underlines appear. |
| `tauri.conf.json` `bundle.macOS` | Windows needs a `bundle.windows` section (NSIS, per-user). |

## 6. The display

WebView2 (Chromium), not WebKit. Expected differences, and what I propose to check:

- **Fonts:** SN Pro and the others are embedded, so glyphs are the same; **rendering differs** (ClearType/DirectWrite instead of the Mac's smoothing). `-webkit-font-smoothing: antialiased` is ignored; text will look heavier. Line widths measured by `test:look` are Mac figures. The 30em width, wrapping and `font-synthesis: none` should hold; verify in Chromium.
- **Scrollbars:** the CSS already sets `scrollbar-width: none` and `::-webkit-scrollbar`, and draws its own indicator (`kit/scrollIndicator.ts`). Chromium honours both, so no width is taken. This lowers the risk to the resting grid and decisions 170 to 175, but **proves nothing**; check in Chromium.
- **Focus rings, selection colour:** Chromium draws its own focus ring where the CSS does not; the selection rules name CodeMirror's full path and `data-window`, so should hold. A regression test measures them: run it in Chromium.
- **WebKit-only CSS:** `-webkit-user-select` (twice; Chromium supports the prefixed form), `-webkit-font-smoothing` (ignored). Nothing else found.
- **Dialogs, `inert`, `execCommand("insertText")`:** the typing aids rely on `execCommand` so WebKit keeps spelling underlines. Chromium supports it, but its undo grouping differs; `isolateHistory` should cover it. Highest risk in the editor; **only a person typing can prove it.**
- **Menus:** Windows draws the menu bar inside the window (about 20 px), which also moves the layout; see §5.

**Proposal: run `test/ui` in Chromium on the Windows runner** (the suite is Playwright; Playwright's Chromium is the nearest to WebView2, not identical). The tests assume Alt-Tab for focus on a Mac with keyboard navigation off; on Windows plain Tab reaches buttons, so a few tests would need to accept both. Expect a list of Chromium failures to triage rather than a green run at first; those not caused by the app (focus-order tests) are logged, those that are get fixed. It also builds the browser preview, which needs no Tauri, so it avoids the icon problem.

## 7. The Rust commands

| Command | Mac-only assumption | Windows |
|---|---|---|
| `pick_project`, `pick_cover` | none (`rfd`) | fine |
| `open_recent`, `peek_recent*`, `recent_display`, `forget_recent`, `clear_recent`, `remember_project` | `HOME`, `/` in path shortening (`recent.rs`) | `USERPROFILE`, `\`; case-insensitive prefix |
| `watch_start` | `notify` default | fine; see §3.9 |
| `reveal_in_finder` | `/usr/bin/open -R` | `explorer /select,` |
| `machine_get`, `machine_set` | `rename` over an existing file | retry (§3.1) |
| file ops (`write_text`, `create_file`, `compare_write`, `rename`, `retire`, …) | swap, hard link, inode | §3 |
| `quit_ready`, `close_progress`, `set_menu_state`, `set_recent_names` | none directly | menu shape differs (§5) |
| `read_cover`, `app_info`, `project_info`, `close_project` | none | fine |
| `register_editor_text_defaults`, `install_terminate_hook` | Mac | already `cfg`-gated no-ops |

The capability file (`capabilities/main.json`) grants the same commands; no Windows addition. The CSP has `connect-src ipc: http://ipc.localhost`, which is already Windows's IPC origin.

## 8. The installer

- **Tauri's NSIS installer** (`.exe`), `installMode: currentUser` (no admin rights, installs under `%LOCALAPPDATA%`). Recommended over MSI, which is per-machine by default. Unsigned: "Windows protected your PC", then "More info" and "Run anyway" (README to be written from a real screen, not memory).
- **WebView2:** Windows 11 includes it; most current Windows 10 machines have it. Options:
  - **(a) Rely on it** (`webviewInstallMode: skip`): smallest; the app fails to start with a plain error if it is missing.
  - **(b) Let the installer fetch it** (`downloadBootstrapper`, Tauri's default): about 2 MB larger; the installer, not the app, makes one request to Microsoft. The app still makes none.
  - **(c) Embed the offline installer**: about 120 MB larger; no network at all.
  - **Recommendation: (b)** for the preview, because a friend who lacks WebView2 gets a working install and the app itself stays offline. It is a network request by the installer, which the brief allows only if Kenny rules it. **Kenny rules.**
- **Architecture:** x64 only (as the brief). The file name carries `preview` and the version.
- **No new crate for the installer.** The Windows job in `release.yml` mirrors the Mac one (actions pinned to hashes, attestation, added to the same draft release).

## 9. Rulings needed from Kenny (the stop)

1. **Line endings** (§2): approve the rule "never change endings behind the author's back", including the change to mixed-endings normalising (decision 22).
2. **File names** (§4): approve the shared check on **new** names (reserved names, trailing dot/space, the nine characters, path length warning), which affects Mac projects, and the "cannot be used on Windows" listing for existing ones.
3. **New dependency:** `windows-sys` (small, Microsoft's own, only for Windows): used for the exclusive file rename, the case-only rename's file id, reparse points, and (optionally) shutdown handling. Without it: §3.4 falls back to hard link plus clean-up, the case-only rename on Windows compares paths, and the shutdown route is dropped. Say yes, no, or "only the rename".
4. **WebView2** (§8): (a), (b) or (c).
5. **`test/ui` in Chromium** on the Windows runner (§6): yes or no.
6. **Machine settings in `%LOCALAPPDATA%`** instead of Roaming (§5): yes or no.
7. **The shutdown route** (§5): attempt it (with `windows-sys`) or leave Windows shutdown to the periodic save and recovery.
8. **Mac behaviour:** I propose none changes. Confirm. (Shared changes: `.gitattributes` affects only checkouts; the name check and the endings rule are the only ones that touch it, and both are in rulings 1 and 2.)

## 10. The friend's test (outline; the full checklist is `docs/windows-test.md` after the rulings)

A sample project of invented text (a series with two short novels, a Codex of six entries, one with an accent: "Zoë Åberg", one with a long title, one archived), built by the existing fixture builder and shipped as a zip beside the installer. Steps as in the brief §1.5, plus: a chapter saved while a folder is "Always keep on this device" in OneDrive; the project on the Desktop; a file with CRLF; Win + . for an emoji; the Ctrl-click on a Codex link; shutting Windows down with a chapter just typed. The report asks for the Windows version, whether WebView2 was already there, and screenshots.

## 11. What I will do after the rulings, in order

1. CI fixes: `.gitattributes`, `toPosix` in the tests, `vite` by `node`, skip the Mac helper's test off Mac, `icon.ico`, a Windows-aware `rustBridge.ts`, and a Windows step `cargo test -p storyforge-fs`. Expect the first honest Windows run to show what the Rust code does, which may be more than listed here.
2. The safety core (§3) with its tests, until the Windows run passes with the bridge built; then the run becomes blocking.
3. The Mac-only parts and the display, as ruled.
4. **H2**, then the preview build.
