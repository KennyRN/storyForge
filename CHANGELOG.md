# Changelog

## Unreleased — the story shape (0.12.0)

The story half of the overviews returns, on top of the numbers. Unlike the numbers, it writes: plot notes, synopses, the series description, PoV and location lists and covers, all into keys, sections and files the 0.17 layout already has. No new key, file or folder; `format-version` is unchanged. See `docs/story-shape.md` (rulings in §12, as built in §13) and `docs/story-shape-report.md`.

- New: chapter cards in three sizes (bar; bar and plot note; bar, PoV, Location, Length and plot note) with a chevron on each card and a size control for all of them (kept per project on this computer). Clicking the bar still opens the chapter.
- New: plot notes, the novel's synopsis and the series description are written in place, committed when the field loses focus and on every close and quit route; leading spaces survive; a conflict never overwrites: the author's text goes to a recovery file and a notice says so.
- New: PoV and Location rows with a Codex picker, and the novel's default PoV (shown, muted, on a chapter with no PoV of its own; never written into the chapter). A reference to a note that is gone shows as missing and is never dropped.
- New: covers for the series and each novel, chosen in the Mac's open panel (`pick_cover`, `read_cover`). The old cover is retired to `.trash/`, never deleted.
- Changed: a Codex rename now updates the path and name of chapters' PoV and location references and the default PoV, announces how many novel files will follow, and the open-time summary says so. A deleted or archived note's references are left as they are (they show as missing) instead of being dropped.
- Changed: `## Synopsis` and `## Description` match only an exact heading line, refuse a duplicate heading (the field shows read-only) and an empty field removes the section. Plot notes keep their leading whitespace.
- Changed: the close commits any field being edited before the editors flush; one that can't land, or hangs, is rescued into a recovery file. The quit test now runs every route with text typed in a plot note too, and tells "never typed" from "typed and lost".
- Fixed (found in the first run of the built app): saved covers were never drawn, because the content security policy allowed `img-src 'self' data:` and the cover box draws `blob:` URLs, so the window blocked every one and showed "No cover" with no message. The policy now allows `blob:` for images (nothing else changed), a cover that is recorded but can't be read or drawn says so in a notice, and the cover button is labelled "Change the cover of …" only while an image is really on screen. A test fixes the policy against the image sources the interface uses, and `npm run test:cover` checks the built app draws saved covers (it fails on the old policy).
- Tests: 1,359 core tests, 153 WebKit interface tests and the Rust tests, all passing.

## Unreleased — leftover temporary files (0.11.1)

When the app saves a file it writes a hidden temporary file beside it and swaps it in. A crash, force-quit or power cut at the wrong instant can leave one behind, and one can hold words that exist nowhere else. At open, storyForge now deals with them safely. See `docs/temp-tidy.md` (the investigation, rulings in §8, as built in §9).

- New: at open (after the layout check, before reconciliation; never in a read-only project; never on a file under a minute old), a backup's temporary zip and a copy identical to the file beside it are removed; anything that differs is copied into recovery, read back and checked, confirmed unchanged, and only then removed. A recovery file's own leftover gets a visible name in its recovery folder. Anything unclassifiable stays, is reported once and is remembered.
- New: the opening summary says first, plainly, when what was being saved is newer than the file beside it ("may hold words that were never saved"), and mentions earlier versions quietly.
- New: a guard operation `temp-remove` (name and folder checked, 40 table rows in both guards) and two commands, `list_temp_leftovers` and `remove_temp`; `npm run fixture:leftovers` builds a copy of the fixture with every kind planted.
- Fixed: the `quit` refactor of 0.11.0 is covered by a regression test (`QuitState::terminate_request`).

## Unreleased — writing sessions (0.11.0)

Each writing session is recorded: when it started and ended, to the second, the words it added to the story, and its pace. Sessions are listed in the history view, and editing or pasted-in sessions are left out of the storytelling figures. This is a deliberate, additive change to the 0.17 disk format (decision 34): one new folder, `_backstage/storyforge/sessions/`, read by nothing else; `format-version` is unchanged. See `docs/sessions.md` (the design, rulings in §10, as built in §12) and `docs/sessions-report.md`.

- New: a session starts at the author's first edit in a chapter and ends at its last edit when 3 minutes (a setting) pass with none, the project closes, the app quits by any route, or the Mac wakes. Only the author's own edits count: never reloads, link rewrites, reconciliation, Codex notes or archived chapters.
- New: session files, one per month per computer (`<YYYY-MM>-<random id>.md`), written only when a session ends; the session in progress lives in the app's data folder and a crashed one is finished at the next open, marked recovered. A file that can't be read is never rewritten.
- New: the history view lists a day's sessions (times, length, words, pace, chapters, and the words "editing", "unreliable", "recovered") and the average pace with its number of sessions. Today, this week, the days, the weeks and the heatmaps are the storytelling figures: they leave out editing sessions and sessions with a paste or drop over 30 words. Chapter, novel and series counts and every bar still count every word.
- New: Sessions settings (idle limit, shortest session shown, count as editing below a pace) and a Display group with the live session readout in the stats panel (off by default).
- Changed: ending the session is a step in the close path (after the editors flush, before the snapshot), and counts as progress for the watchdog. `ProseWriter.onAuthorEdit` is a new observer (it can never change a write's outcome); the editor says where each edit came from. Machine settings gain `computer` and `session/<sha>`.
- Fixed: the settings dialog drew the word "null" above its first group when the project was writable (an old slip from Brief 5, caught by a screenshot).
- Tests: 1,253 core tests, 131 WebKit interface tests and 35 Rust tests, all passing.

## Unreleased — Fix 1: quitting from the Dock (0.10.1)

Quitting from the Dock, logging out and shutting down used to end the app without telling the window, losing the last 2 seconds of typing and able to cut a Codex rename off partway. They now run the same close as Cmd+Q. See `docs/quit-paths.md`.

- Fixed: the Dock's Quit, Log Out, Shut Down and the quit Apple event now answer macOS "not yet", run the close, and reply when the window has saved (`applicationShouldTerminate:` added to the application delegate, in `platform.rs`; tao 0.37.2, the newest, does not answer it).
- Fixed: SIGTERM, SIGHUP and SIGINT run the same close. A second request while a close is under way joins it. The 15 s watchdog and `quit_ready` race for one exit.
- Changed: the close watchdog fires 15 s after the last progress (a stage of the close finished, or a file of a Codex rename was written), not 15 s after the close began, so a slow rewrite always finishes. New command `close_progress` (no arguments, touches no file); progress is sent from real work only.
- New: `npm run test:quit` (macOS, outside `npm test`, before every release) drives the built app through each route with unsaved text.
- Changed: the README's known gap is now force-quit, crash and power loss only.

## Unreleased — the numbers (0.10.0)

The data that calms the author while writing is back: the series overview, the novel overview and the word-count history, all read-only. Nothing new is written to disk. See `docs/numbers.md` (the design, rulings in §11) and `docs/numbers-report.md`.

- New: the series tab covers the workspace with the series overview: each placed novel with a word-count bar scaled against the longest (a 3 px sliver for an empty novel), unplaced novels beneath. The novel tab shows the novel overview: the progress bar (a segment per chapter with words, ghost chapter dividers, the structure strip at 10, 20, 35, 50, 65, 80 and 90%), the planned lengths (the same field as the left panel's), and a bar-tier card per chapter (target marker short of the plan, orange beyond it, plain fill within the target's significant figures, the first paragraph of the plot note on hover). Opening a chapter brings the editor back; selecting the tab again brings the overview back.
- New: clicking the stats chart opens the word-count history: all novels, this novel, day and week heatmaps (four steps; every cell has its number as a label), and a day's chapters.
- New: the overviews and the open history view refresh on a 250 ms trailing debounce, keep keyboard focus, and never touch the editor.
- Changed: the overview is a layer over the mounted editor, which is inert while covered; flipping to the storytelling face always shows the chapter. `attachTooltip` accepts a function. The planned-length controls moved to `src/ui/faces/lengthFields.ts`.
- Changed vs 0.17.1: overrun is orange beyond a notch, not a dotted pattern; net-loss days are neutral greys, not red; the ghost dividers and structure strip have no switches.
- 15 new WebKit tests and 6 new unit tests (118 and 1,171 in all).

## Unreleased — the v1 interface (0.9.0)

storyForge now has the interface it is written in: the editor, the two faces, the screens around them and the Mac menus, all in Everforest Soft Dark, in plain TypeScript and DOM. The diagnostic window is gone from release builds. 0.9.0 is everything v1 promises; it becomes 1.0 when Kenny says so. See `docs/interface.md` (the design, with the review rulings in §12 and as-built differences in §13) and `docs/interface-report.md`.

- New: the editor (CodeMirror 6, one per writing session) with light prose dressing from 0.17.1 (emphasis and heading markers hidden off the caret's line, `%% comments %%` dimmed, ⌘B and ⌘I), find and replace, spellcheck, undo that survives saves and reloads, silent saving, sticky notices for every outcome that matters, read-only banners.
- New: the left panel's two sides: storytelling (navigator with "add the next chapter", the Codex tree with drag, types and archive, stats; Codex entries open in the context panel) and library (codex, series, novel and archive tabs; Codex entries open in the workspace; the series title is renamed on the series tab). The centre is the workspace; the right is the context panel.
- New: the start screen, New Project, the reconciliation summary (only when something happened), Codex renaming (name, plan, result), settings (⌘,), and the full menu bar with items greyed out when they do not apply.
- New: `ProseSession.onSaveResult` (every save outcome, timed saves included); `OpenedProject.renameNote`; the Rust commands `reveal_in_finder` and `set_menu_state` (neither writes).
- New: a browser preview (development only) that runs the interface in WebKit against the real Rust file code, and 99 WebKit tests (`npm run test:ui`).
- Changed: padded numbering is two digits at least ("01"); the unplaced chapters keep the order they were left in (`unplaced:` is saved and followed); the `hybrid` layout is gone (old values read as the default); `dragReorder` no longer captures the pointer (it hung WebKit); Edit ▸ Undo and Redo and Quit are app items.
- Changed: the diagnostic page is a development-only layer behind View ▸ Developer ▸ Diagnostics; a release build does not contain it.

## Unreleased — the Tauri shell (0.1.0)

storyForge is now a Tauri 2 desktop app for macOS (unsigned apart from the ad-hoc signature, not notarised). The window runs the TypeScript core; a Rust side owns the disk. There is no real interface yet: a plain diagnostic window stands in. See `docs/tauri-shell.md` and `docs/tauri-shell-report.md`.

- New: `src-tauri/` — the Rust guard (passes the shared table unchanged, plus new symlink and `project.md` rows), containment against symbolic links, atomic writes, compare-then-write by atomic exchange (`renamex_np`) with a late-write check, exclusive create and rename, `.trash/` retire, one bulk scan call with file text, a file watcher with 300 ms/2 s batching, machine settings, single instance, close handling, iCloud downloads, a forced-dark window with the Soft Dark first frame.
- New: the window has no file-system, shell, network or dialog permission, only this app's commands; a test enforces it.
- New: `TauriBackend`, and a backend contract suite that node-fs and the real Rust code both pass.
- New: `project.md` (`format-version: 1`) for settings that travel with the project; a newer format opens read-only. Settings from the plugin's `data.json` are read once and never written to.
- New: `applyBatch` (evidence first, then echoes, changes, the index, the reconciler), `AppController` (open, create, watcher, the 30-minute backup check, closing within 5 s with recovery as the fallback).
- Changed: `NodeFsBackend.assertInside` walks the path (a symlink that leaves the project, dangles, or is the file itself is refused). `Backend` calls carry an optional intent. A Codex name containing `[ ] # ^ |` is refused as typed; mixed line endings are reported on save; the rename plan lists unquoted `[[X]]` frontmatter values.
- Known gap: quitting from the Dock's menu does not save the last 2 seconds of typing first (Cmd+Q, the app menu and the red button do). Documented in the README and the report; the fix waits for the real interface.
- Build: `npm run app:build` makes a universal `.app` and `.dmg`; see the README for opening an unnotarised app.

## Unreleased — the safety core

The five things that keep the author's words safe, plus opening and creating a project. All in `src/core/`, tested against fixtures; no interface, Tauri or file watcher. See `docs/safety-core.md` and `docs/safety-core-report.md`.

- New: `ProseWriter` — the single path from the author's typing to a chapter or Codex note (sessions, 2 s save delay, flush-all, compare-then-write, disk wins on conflict, recovery before reload, the "chapter changed" hook for the fingerprint sidecar and word-count history). Archived chapters and notes, `notes/` and everything else are refused.
- New: recovery files (`_sf-backup/recovery/...`, never overwritten), including `_pruned` records of backstage entries removed by reconciliation.
- New: backups (session, automatic, full, pre-rewrite), `isBackupDue`, never two at once, never overwritten. The session and automatic backup scope is `_story-library/`, `Codex/`, `notes/` and `_backstage/` (0.17.1 zipped the whole vault).
- New: the reconciler — match (same body hash, then same opening fingerprint with the closing as tie-break, one-to-one only), then recover, then prune; gates for missing or emptied book folders, a missing Codex, unreadable details and iCloud placeholders. Replaces 0.17.1's prune at load.
- New: the session snapshot (outside the project folder) and `openProject` / `createProject`.
- New: Codex rename end to end — `planCodexRename` / `applyCodexRename` / `renameCodexNote`: plan, pre-rewrite backup, rename, minimal link rewrite (wikilinks, embeds, markdown links, links in frontmatter), re-key, report. The Brief 2 refusal is gone.
- New: compare-then-write on the backends (node-fs: byte comparison plus an inode/size/mtime check before the atomic rename), five new guard operations (89 new rows in the guard table), an architecture test, 37 new disk-safety operations and a link-rewrite fuzzer.
- Changed: `_sf-backup/` is create-only through every route. A renamed book folder now also renames its `novel-<code>.md`. `createProject` ignores hidden entries in the folder.
- Removed: `pruneMissingChapterEntries`, `pruneMissingChapterCodexRefs`, `pruneMissingCodexNotes`, `reconcileMissingCodexNotes`, `reconcileExternalCodexChange`, `renameCodexNoteFile`.

## Unreleased — the data core

The repository's data layer no longer depends on Obsidian. A project handle (a synchronous in-memory index plus a guarded, asynchronous file backend) replaces Obsidian's vault, metadata cache and file manager; the plugin shell, views and modals are gone (kept under the tag `plugin-harness-final`).

- New: `src/core/frontmatter.ts` — minimal-diff frontmatter edits that keep unknown keys, comments, quoting, key order, line endings and the note body; unreadable frontmatter is "unavailable", never empty.
- New: the write guard at the backend boundary, with its rules as a data table (`test/guard-spec/guard.json`); the `_export/` allowance is removed; case, Unicode and separator variants of protected folders are refused.
- New: the node-fs backend (atomic writes, `.trash/` instead of delete), synthetic fixtures, a 117-operation disk-safety suite, and `npm run check -- <folder>`.
- Changed: Codex renaming is refused until link rewriting exists; chapter creation no longer opens the file; a folder in a pre-0.17 layout is refused untouched.
- Removed: `obsidian`, `esbuild`, the CodeMirror typing peers, `manifest.json`, `styles.css`, `backup.ts` (returns in a later piece of work). See `docs/data-core-report.md`.

## Unreleased — the strip

This repository is now the seed of the standalone storyForge app. Before the app is built, the plugin was stripped to a small test harness (not released as a plugin; `release.yml` is gone). Removed: titleForge, the Story Context engine (the right-hand view keeps only the lore slot and the Archive), the overview pages and title/settings modals, continuous mode and the guides, the Notebook, export/import/presets/onboarding, plot threads and tags and their editors, interface formatting and palettes, Forge-family hosting and Obsidian chrome management, migrations, and the winkNLP and manuscript CodeMirror dependencies. The data layer, the pure layout maths and the on-disk format (0.17) are unchanged. See `docs/strip-report.md`.

## 0.17.1

- Novel overview: the novel length bar can now divide the unwritten remainder into planned-chapter-length "ghost chapter" blocks, and show a 4px story-structure strip beneath the bar. Both are toggles on a new "novel" tab of the guides modal.
- README: storyForge is now storytellingForge; development focus has moved to its sister app, storyForge (a standalone app).

## 0.17.0

- Continuous mode is a real manuscript editor: the whole book as one document you can write straight through, saved per chapter (only chapters you change), with the depth guide at every chapter start, the cycling guide across the book, prose dressing and emphasis keys, and new chapters from inside the manuscript. Read-only on mobile.
- Series overview: word-count bars on placed novel cards, kept up to date as chapters and novels change.
- Novel overview and Story Context's Novel tab: three-tier chapter cards with the data bar as the button; hover for word count and description.
- Story Context: the Notebook opens on the Codex first, notes can be renamed, new dossier prompt; Codex dropped from the Chapter tab; re-clicking an open codex page closes it. "Recommend" renamed to Story Context throughout, with settings migrated (the command id changed, so a hotkey on it must be set again).
- Codex notes are no longer scoped to a single book; old `book:` keys are left in place but ignored.
- Sliding ink indicator on the Notebook and Archive source rails, the Codex `#tag` rails and the continuous-mode toggle; redesigned project pane; name-only novel title modal with inline series dice.
- Command "Open storyforge" renamed "Open story library" (same id, existing hotkeys keep working).
- storyForge no longer contains any file-delete call: the Codex ghost eviction (which never succeeded on a real ghost) is gone.
- Community-scanner clean-up: inline styles through `setCssStyles`, window-scoped timers and DOM helpers, no `:has` or `!important` in the stylesheet, typed narrowing in place of `any`, titleForge's command-line tools moved to `tools/titleforge/` as `.mjs`.
- titleForge: title-composer and japanese-ln no longer reproduce real titles (a guard built from their corpora, exemplars and a list of translated classics); plurals and verb agreement fixed ("Centuries", not "Centurys"; "Where the Wolves Rise").
- titleForge: thin word lists expanded across every lexicon (webnovel additions harvested from the frozen corpus); pools of three words or fewer down from 455 to 6, all deliberate. Decades and ordinals now title-case correctly ("1980s", not "1980S").
- titleForge: character names in titles are invented (nameForge's Markov model, seven title-composer registers plus a webnovel hero register) instead of real or scraped names; writers can point any register at their own nameForge pack in titleForge settings.
- titleForge: vocabulary is additive across every lexicon — a genre's own words join its parent's lexicon (words in 2+ of its subgenres) and a general list (words spanning 2+ genres) instead of replacing them; thin pools down from 1,075 to 347 in title-composer, isekai roles 2 → 17.
- western-serial: webnovel v1.2.0 — genre tree (progression × 10, isekai × 2), 9 new patterns, 2 retired, collision guard.
