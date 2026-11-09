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

---

# As built (H2): the port up to the first Windows build

Rulings given by Kenny after H1: line endings approved (a consistent file keeps its endings; new files are LF everywhere; decision 22 kept for mixed endings); new names approved; `windows-sys` approved (Windows only); the installer fetches WebView2 if missing; `test/ui` in Chromium on Windows, reported only until triaged; machine settings in local app data; shutdown attempted briefly; the Mac unchanged except ruling 2; the deny-writers open and the native exclusive move approved.

## What changed, in the order of the brief

1. **The CI fixes.** `.gitattributes` (LF text everywhere; the four font licences and the CRLF fixture are `-text`, kept byte for byte); `toPosix` where tests compare `path.relative`; `vite` run by `node` (no `npx`); the Mac key-posting helper's tests skip off the Mac; `icons/icon.ico` (seven sizes, from the 1024 px icon; in `tauri.conf.json`'s icon list).
2. **Ruling 0.** `test/helpers/rustBridge.ts` finds `cargo` (`where` on Windows), uses the platform's path delimiter and `.exe`; `test/globalSetup.ts` **throws when `CI` is set and the bridge is not built**, so a missing bridge fails CI on every platform and the safety suites cannot silently skip. On the Windows run the bridge suites (`contract`, `tauri`, `appLife`, `settings`, 17 + 4 + 29 + 81 tests) now run and pass. The only skips left are the Mac key-posting helper's six tests.
3. **The safety core on Windows** (`src-tauri/fs/src/platform.rs`, `ops.rs`):
   - `rename_excl`: `MoveFileExW` without the replace flag. Atomic, exclusive, no hard link and no second name. Files and folders.
   - `retry_sharing` / `replace_file`: the last step of every atomic write (and machine settings) waits out a program holding the file (sharing violation, lock violation, access denied) for about two seconds, then fails as before; the temp file is removed, nothing is lost. **Reads wait too** (`read_bytes`, the compare's read, and the read that decides whether a file is CRLF: without it a held file would have lost its CRLF). On the Mac `retry_sharing` is one call: nothing changes.
   - `compare_write`: the target is opened with other writers denied (`FILE_SHARE_READ | FILE_SHARE_DELETE`), compared and replaced while held; if the replace cannot be done while held it falls back to the stat-checked path.
   - Case-only renames: `same_path` (canonical paths) stands in for the inode comparison.
   - **Junctions** (what OneDrive and some tools make) are refused as links; Rust's `is_symlink` already reports them (tested with a real junction on the runner).
   - Unix-symlink tests are gated to Unix, with a `link_dir` helper that makes a junction on Windows; `fs/tests/windows.rs` (Windows only) covers exclusive and case-only renames, a file held briefly (save and compare), held for good (fails, loses nothing, leaves no temp file), a conflict, the writer-denying open, CRLF kept, new files LF, and a junction.
4. **Names (ruling 2).** `sanitizeCodexBasename` also drops a trailing dot or space; `isReservedFileName` refuses CON, PRN, AUX, NUL, COM1 to COM9, LPT1 to LPT9 (with or without an extension) in the new-note box, in the rename box, and as a backstop in the core (`UnusableNameError`; `uniqueCodexFilename` never makes one). The characters `< > : " | ? *` were already refused. **Existing** names Windows can't hold are listed in the summary shown after opening ("Can't be used on Windows"), never renamed (`core/windowsNames.ts`). Note for Kenny: the list is shown on the Mac too, at every open of a project that has such a name, because that is where such names exist; say if it should be shown once, or only in Settings.
5. **The Mac-only parts.** Menu: Windows has no app menu (Settings and Exit are in File, About in Help; the Mac's menu is untouched, `cfg`-gated). "Show in File Explorer" (`explorer /select,`). Home folder display uses `USERPROFILE`, either separator, case-insensitive on Windows only. Project names come from backslash paths (`folderName`: the shell's title and the cards). Machine settings in `%LOCALAPPDATA%` (`app_local_data_dir`). ⌘-click is Ctrl-click on Windows (`primaryModifier`; ⌘-Return is CodeMirror's `Mod-Enter`, already Ctrl). **Shutdown:** a hidden window on its own thread answers `WM_QUERYENDSESSION` (starts the ordinary close, and says why with `ShutdownBlockReasonCreate`) and waits at most four seconds on `WM_ENDSESSION`. **Unproved**; it is on the friend's list.
6. **The display.** `test/ui` runs in Chromium on the Windows runner (`SF_BROWSER=chromium`, `ui-chromium` job in `ci.yml`, reported only).

## What passes, and where

| | Mac | Windows runner |
|---|---|---|
| `npm run build`, `npm test` (1810 tests) | passes | passes (6 skipped: the Mac helper) |
| Rust bridge suites (disk safety through the real Rust code) | passes | **passes, running** |
| `cargo test --workspace` (incl. `windows.rs`) | passes | passes |
| `npm run test:ui` (WebKit, 740) | passes | n/a |
| `test:ui` in Chromium | n/a | see below |

### Chromium triage

First run: 700 pass, 40 fail. After the test-side fixes below: **710 pass, 30 fail** (reported only; none is a data-safety failure, read from the log).

- **Fixed (test-side):** tests that hard-coded `Meta` (⌘A, ⌘Z, ⌘B/⌘I, ⌘-click, ⌘-Return) now use `ControlOrMeta`, and the start card's `~/` expectation accepts `~\`. The Mac run of those files passes. 10 tests.
- **Test-side, not yet changed (10):** keyboard-focus tests that reach buttons with Option-Tab, which Windows uses for its own switcher (`kit.ui.ts:117`, `modal.ui.ts:54`, `navigator.ui.ts:51`, `storytelling.ui.ts:59`, `tweaks2.ui.ts:220`, `codexlook.ui.ts` 74, 91 (both sides) and 174). They need a Windows way to move focus, not an app change. Two `settingsRace.ui.ts` tests are timing-sensitive and also unexamined.
- **Undecided (17):** `typing.ui.ts` (the aids' one-⌘Z undo and the shortcode popup), `chars.ui.ts`, `editor.ui.ts` 27/78/104/153, `chapterContext.ui.ts:160`, `gfm.ui.ts` 175 and 339. They may be the tests (key handling that differs in Chromium on Windows) or Chromium's undo grouping against `execCommand("insertText")`. Playwright's Chromium is not WebView2, and the app's own typing aids can only be settled by a person typing in the real Windows app, so they are on the friend's list.

## What only the friend can check

Installing; WebView2; the title bar and menu on Windows (the 28 px band and the traffic-light space are still drawn; they hold the left panel's menu chevron, and the layout against the Windows title bar is unseen); the ClearType look of the fonts; the red spelling underlines; typing aids and their undo in WebView2; File Explorer reveal; OneDrive folders; **shutdown with a chapter just typed**; Notepad's change being picked up (the watcher on Windows).

## Not done yet (after H2)

The installer and the Windows job of `release.yml`; the README steps; the changelog and version; the Mac's three-round built-app sweep (a minor version, decision 104); `bundle.windows` in `tauri.conf.json` (NSIS, per-user, `downloadBootstrapper` for WebView2).


---

# H2 rulings and what was done (the preview build)

1. **The names list:** shown when the list changes (the first time, and again only when new names appear), on both systems, no longer at every open. What was told is remembered per project on this computer (machine setting `windowsNamesSeen`, never in the project). It is also viewable at any time: **Settings ▸ General ▸ names windows can't use ▸ Show…**.
2. **The title bar on Windows:** `--band-h` is 0 and the drag band is gone (`[data-platform="windows"]`); the menu's chevron keeps a 28 px box of its own (`--chevron-h`). The tabs' squares still set the library pages' top, and the baseline of the novel title stays on the squares' bottom: the resting-grid and alignment tests pass in Chromium with the band gone (three tests that hard-coded the 28 px offset now say `BAND`). **Pictures:** `docs/windows-shots/` are taken by Chromium on the Windows runner (real Windows fonts; the CI artifact `windows-shots` has more). They show the chapter box and the context card touching the top of the window: the old 28 px gap was the band. The built app on the runner was not attempted; the friend's report is the check for the real window.
3. **Option-Tab:** it is **not an app shortcut**: it is WebKit's own way of reaching buttons with the Mac's keyboard navigation off. WebView2 and Chromium reach buttons with plain Tab, so no F6 binding is added and the Mac is unchanged; the tests now send Tab on Chromium (`TAB`, `SHIFT_TAB` in `test/ui/helpers.ts`).
4. **The 17 undecided Chromium failures, each triaged:**
   - **Redo (the typing aids' one-⌘Z tests in a chapter, plot note, synopsis and description, the shortcode undo tests, `chapterContext.ui.ts:160`): a test fault, with one real gap found on the way.** Playwright's `press("Control+Shift+z")` sends a **lower-case** `z` with Shift held; a real keyboard sends `Z`. CodeMirror reads the lower-case form as plain Ctrl-Z, so the "redo" undid the typing (hence the empty document in the failures). Reproduced locally in Chromium with a Windows platform: with `Control+Shift+Z` redo restores exactly what was typed, and `Control+Y` too. The tests now send the upper-case form on Chromium (`REDO` in `test/ui/helpers.ts`). **The real gap:** CodeMirror binds Shift-Ctrl-Z to redo only on the Mac and Linux, so on Windows it was unbound and the browser's own redo would have acted on its own history. `ui/editor/redoKeymap.ts` binds `Mod-Shift-z` in the chapter editor and the field editors (on the Mac it is the binding it already has). **No lost or doubled character, and no undo that failed to restore exactly, was found in the app.** Unproved in the real window: whether the Edit menu's Redo accelerator and this binding together redo twice; it is on the friend's list.
   - **Test faults, fixed test-only:** the caret keys, and the title-band offsets. The tests moved the caret with the Mac's ⌘↑, ⌘↓, ⌘← and ⌥→, which on Windows scroll or do nothing, so the test typed at the wrong place (`editor.ui.ts` 27, 78, 104, 153; `gfm.ui.ts` 175 and 339; `chars.ui.ts:80`). They use `DOC_START`, `DOC_END`, `LINE_START` and `WORD_RIGHT`. `chars.ui.ts:144` built a Vite module path from a Windows folder. Seven tests hard-coded the Mac's 28 px band (`backgrounds`, `card`, `gaps` ×2, `navmenu` ×2, `tweaks1`): they use `BAND`, and the two that are about the drag band itself or the 48 px line are skipped where there is no band. `typing.ui.ts:443` followed from an earlier step.
   - **A real focus fault in Settings, fixed in the app** (`settingsRace.ui.ts` 33 and 77): when a box's own write landed, the dialog redrew it as a fresh twin and **focus fell to the page** (against decision 119); the Mac's timing hid it. The redraw now puts focus on the new twin of the focused control (by tag, type and name), with the caret. No text was lost (the value was kept and stored once); Chromium also commits a box when the redraw takes it out of the page (it fires `focusout`, WebKit does not), so the second test asserts "stored once" there instead of "one write on Return".
   - **Differences in look:** none found by the tests; the look of the fonts and the title bar are on `docs/windows-test.md`.
5. **Trailing dots and spaces:** trimmed, with the box showing the trimmed name and "Press Return to create “…”" before anything is made; leaving the box does not create it (a UI test).
6. **The sample project:** `scripts/sample-project.mjs` makes it from scratch. `test/fixtures/series` was **not** used: it holds only test material (text files standing in for broken covers, legacy and unknown keys, comments the app must keep, a CRLF note and one with no final newline, "Windows" and "NoNewline", an unplaced novel, `.obsidian/`, `elsewhere/`, an export, a title-composer lexicon). What goes in the zip is listed in `docs/windows-test.md`.
7. **Ctrl-Return:** CodeMirror's `Mod-Enter` is Ctrl-Return on Windows and the binding is `Prec.highest`, so it keeps the blank-line meaning off a link as ⌘-Return does. `gfm.ui.ts:339` (⌘-Return on a live link, on a muted one, and on no link) is the test; its caret keys were the fault.

## The preview build

`bundle.windows` in `tauri.conf.json`: NSIS, `currentUser`, WebView2 by `downloadBootstrapper` (the installer fetches it if missing, silently; the app makes no request). `release.yml` has a `windows` job after the Mac one: it builds the installer on the runner (`--bundles nsis`), names it `storyForge_<version>_windows-preview_x64-setup.exe`, adds it to the same draft, attests it, builds and attests `storyForge-sample-project.zip` and adds that. Actions are pinned to full hashes. Version 1.13.0, changelog and README steps are in. **Unsigned**: Windows says "Windows protected your PC"; the wording of the README steps ("More info", then "Run anyway") is Microsoft's standard SmartScreen dialog and has not been seen on a screen by the author of this change.

## The draft (a dry run from the branch)

The release workflow was run by hand from the `windows` branch (`workflow_dispatch`, which makes a private **draft** and publishes nothing). The first run showed two faults, both fixed: the installer kept Tauri's own file name (the action ignores a naming pattern when the bundle already has one), so the workflow now builds with `tauri build --bundles nsis`, renames the file `storyForge_<version>_windows-preview_x64-setup.exe` and uploads it itself; and PowerShell's `Compress-Archive` stores names in the old OEM encoding, which would have mangled "Zoë Åberg" in the sample zip, so the zip is written by Python with the UTF-8 flag. The draft now holds `storyForge_1.13.0_universal.dmg`, `storyForge_1.13.0_windows-preview_x64-setup.exe` (a Nullsoft installer) and `storyForge-sample-project.zip` (17 files, UTF-8 names), and `gh attestation verify … --repo KennyRN/storyForge` succeeds for the installer and the zip. The installer has not been run: nobody here has a Windows machine.

**Not done:** the Mac's three-round built-app sweep (a minor version, decision 104), because a copy of storyForge was running on the Mac and the scripts refuse to start beside it (and a build must not replace a running copy); and the merge to `main`, the `v1.13.0` tag and the rebuild, which follow the sweep (release order in `AGENTS.md`). The draft above comes from the branch, not from the tag: a tag push will rebuild and replace its files.
