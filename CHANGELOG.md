# Changelog

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
