# Changelog

## 1.2.0: the look, round one (Brief 10, decisions 54 to 60)

- New: **SN Pro**, one embedded font, in every place the author writes (the chapter editor, Codex notes in the workspace and the context panel, the plot-note, synopsis and series-description fields) and in the Codex list on both sides. The upright and italic variable files are shipped unmodified inside the app with their licence (`OFL.txt` in the app's Resources, `Font Licences.md`), loaded from the app itself under `font-src 'self'`; the app still makes no network request. Bold comes from the weight axis and italic from the italic file; ligatures (and the `ss01` set) are off and font synthesis is off, so what is on screen is what is on disk. Arial (real italic and bold) draws only the characters SN Pro lacks (`ƿ Ƿ ȝ Ȝ ǣ` and a few more). Everything else keeps the system sans-serif.
- Changed: the chapter editor and Codex notes are **20 px at a 1.6 line height**, and the editor's maximum width is **30em** (600 px at 20 px, about 66 characters a line).
- Changed: **the Codex list**, on both sides: no chevrons; a folder's icon (the filled Tabler folder) and a note's tag icon sit next to the name, 1em after it; a note with no tag shows no icon; a long name is cut with "…" and its icon stays. An open folder has a line beside its contents (nested folders, nested lines), and an open empty folder says **Empty**. With the mouse a folder opens and closes only by its icon, which has a 28 px square hit area; the rest of the row does not. The list is a proper tree to a screen reader (levels, open or closed, groups) with one tab stop and the standard keys: ↑ ↓ move, → opens or goes in, ← closes or goes to the parent, Return opens or closes. **Reordering from the keyboard is now ⌥ plus the arrows.**
- New: **a strip of two buttons down the list's left edge, on both sides**: New Folder above New Note. The name is typed in the list: nothing exists on disk until Return, Escape creates nothing, and a name the rename would refuse (or one already used by a note, or by a folder beside it, ignoring case and accents) is refused. Creating into a closed folder opens it. The old buttons in the pane's header are gone.
- New: **the context panel's note sits on a card** (the editor's background, rounded corners, a margin of 10% of the panel's width, never under 12 px) above a **bottom row** that is always there. With no note open there is no card.
- Changed: **the special-characters button is always shown**, in the bottom row, and puts its character in the editor you last wrote in (the chapter, a Codex note, a plot note, the synopsis or the description), at that editor's own selection, as typing: a chapter counts it as typing, never a paste, and one ⌘Z takes back just the character. Clicking it never takes focus out of a field, so a field is not committed by it. It is greyed out when that editor is covered by an overview, read-only or gone.
- Fixed: **in a read-only project (for example one made by a newer storyForge) the Codex list could not open a note at all** (present in 1.1.0 and earlier: the click was answered by the drag gesture, which was not attached when read-only). A note now opens and a folder folds.
- Changed: `createCodexFolder` takes an optional name (the default is the old "New Folder"), so a folder is made with its real name rather than made and renamed. No disk format change.
- Tests: `npm run test:look` (built app, Mac) reads, through accessibility, the real width of lines in the Codex list, the chapter, a Codex note and a plot note to prove SN Pro is what draws them (and that wynn and yogh in italic text are drawn by Arial Italic, by the slant of the ink), and opens a note with the keyboard. The browser-preview suites gain `look`, `codex`, `strip`, `card` and `chars`. The unit test of the session recorder no longer waits a fixed real 20 ms for file work: it waited on a timer under a fake clock, and failed about once in a hundred runs, more under load.
- Unchanged: the core, the disk format (0.17), the prose writer, the close path and the guard; no new Rust command and no new dependency (the font files are assets; the three Tabler icons are recorded in `Icon Licences.md`).

## 1.1.0: name autocorrect and shortcodes in the fields (Fix 4, decision 53)

Plot notes, the novel's synopsis and the series description now have name autocorrect and shortcodes as well as smart punctuation, on the same options as a chapter: the same names, folding and ambiguity rule, possessives kept, opt-outs respected, multi-word names matched whole, nothing inside `[[links]]`, URLs, code, comments or `~~strikethrough~~`, one ⌘Z leaving exactly what was typed (and the offer to stop correcting a name after a lower-case correction is undone). Each aid's existing switch covers the fields; there is no new setting. Chapters and Codex notes already had both and are unchanged. See `docs/typing-aids.md` §15.

- New: **the shortcode popup in a field**: Tab accepts only while it shows (otherwise Tab leaves the field: no trap), Escape dismisses the popup only, Return makes a new line and never accepts. It is drawn in the page's body, so no card or the overview's scrolling clips it; it goes above the text when there is no room below and stays inside the window beside its edge. Leaving the field, or the app closing, with the popup showing leaves the code as typed and the field commits as normal.
- Changed: a field now corrects a Codex name typed in lower case, as a chapter does (`harbour` in a synopsis becomes `Harbour`).
- Unchanged: the rename, settings and search boxes take no aids (decision 47); field text is written only through `FieldState` and `fieldWriter.ts`; the field editors never reach the prose writer or the session tracker (the architecture test now covers the popup too, and fixes where the aids may be mounted). No code in the prose writer, the session tracker, the field-writing path, the close path or the disk format changed.
- Tests: `npm run test:typing` (built app) types into a plot note: a name, ⌘Z, a shortcode with the real Tab key, Escape, Return and Tab out; `--aid-shots` saves pictures of a corrected name and of the open popup.
- Changed: `npm run test:typing` now types one key at a time, 40 ms apart. Sent as one burst, the keystrokes arrived faster than anyone types and the built app (1.0.0 too) dropped spaces and letters while an aid was replacing a word; the same script passes the chapter cases on 1.0.0 once typed at that pace.

## 1.0.0: storyForge 1.0

storyForge is declared 1.0. This release changes no code; it is the version the pre-1.0 check was run on (0.13.1) with its number changed.

What 1.0 means: every way the app can quit has been proved to save the author's text first, by tests and by Kenny himself. The routes are Cmd+Q, the red button, the Dock's Quit (the quit Apple event), SIGTERM, SIGHUP and SIGINT, and a real Log Out. Each was run with unsaved text in a chapter and in a plot note, and the text was there when the app was opened again.

- Proved by tests, in the built app: `npm run test:quit` (every route, text typed in a chapter and in a plot note), `npm run test:cover` and `npm run test:typing`.
- Also checked in the built app by accessibility, on a fixture copy: Cmd+Q, the red button and the Dock's Quit each followed by a reopen; covers chosen through the real open panel (a replaced cover goes to `.trash/`); Undo and Redo through the Edit menu in a chapter editor, a rename field and a settings field; which menu items are greyed with no project open, with an overview showing and in a read-only project; Reveal in Finder.
- Proved by Kenny himself: a real Log Out, with both parts working.
- Not yet checked by anyone: the titles on the folder pickers ("Open a storyForge project folder", "Choose an empty folder for the new project"). Screenshots exist for Kenny to read.
- Housekeeping in the same commit: AGENTS.md carries the note on outside edits in the preview and the two standing rules for built-app tests (never touch Kenny's running copy, not even to read it; real mouse clicks only as a last resort, announced first), and the preview server notes beside `/__preview/touch` and `/__preview/rename` that they emit no `watch-batch`.

## Unreleased — Fix 3: dashes in the word count (0.13.1)

An unspaced dash between two words now counts as two words (decision 49; decision 37 had said so, but the counter counted one). Counts, and the word-count history, jump once for chapters that use them: nothing is rewritten, and the next count of each chapter records the new figure. `wordcount.md`, the history format and sessions are unchanged.

- Changed: **the counter** (`src/core/wordCount.ts`): an em dash, an en dash, two or more hyphens, and an ellipsis (`…` or three or more full stops) separate words like a space. A single hyphen still joins (`well-known`, `mother-in-law`). A run with no letter or digit is not a word, so a spaced dash, a lone ellipsis, a bare `-` (a list marker) or `#` (a heading marker) no longer counts as one. A dash between two digits still joins, so `1990–95` and `12–14` are one word, as before.
- Unchanged: the typing aids never change a count: `--` and `—` count the same, and so do `...` and `…` (the regression test now proves it, including a 6,000-case fuzzer).


## Unreleased — typing aids (0.13.0)

Four aids to the author's own typing. They act only on what is being typed right now: never on text already on the page, and never on pasted, dropped, dictated, undone or reloaded text, or inside `[[links]]`, URLs, code or comments. One ⌘Z always gives back exactly what was typed. Each has its own switch in the new Typing group of the settings, saved in `project.md` (new `typing-*` keys, no `format-version` change). See `docs/typing-aids.md` (rulings in §12, as built in §13) and `docs/typing-aids-report.md`.

- New: **smart punctuation**: curly quotes and apostrophes by context, `’tis` and `’90s`, a spaced hyphen to an en dash and two hyphens to an em dash (each as the next character is typed), three full stops to an ellipsis. The elision list is the project's.
- New: **name autocorrect**: a Codex title, an alias or a word-list name typed without its joined letters, accents or capitals (`aelfric` for `Ælfric`) is corrected when the word is finished, if exactly one name matches. Possessives are kept; names that are also words can be opted out (undoing a lower-case correction offers to); multi-word names match whole.
- New: **shortcodes**: `~` and some letters offer your codes (and Codex names) in a small list; Tab puts in the full text, Escape dismisses, Return still makes a new paragraph. The list is announced to a screen reader.
- New: **the special-characters button** in the corner of the blank context panel: a palette of your characters (ash, ethel, eth, thorn, wynn, yogh, and any you add) that goes in at the chapter's cursor.
- Changed: plot notes, the synopsis and the series description are now small plain-text editors with smart punctuation and their own undo (decision 47). They look and behave as before; Edit ▸ Undo and Redo reach them.
- Fixed (0.12.1, shipped on its own): the Mac's own smart quotes, dashes and text replacements no longer act in the editor (they broke links and code), and spellcheck underlines are on.
- Fixed: an aid's change used to make WebKit forget every spelling underline in the paragraph; it no longer does.
- Tests: 1,541 core tests, 192 WebKit interface tests and the Rust tests, all passing; `npm run test:typing` (new, built app), `test:quit` and `test:cover` pass.

## Unreleased — Fix 3: the Mac's own text substitutions (0.12.1)

In 0.12.0 the Mac's own text system acted inside the manuscript editor, before any code of ours and inside text it should never touch. Typing straight quotes gave curly ones, two hyphens became an em dash, three full stops an ellipsis, and the author's own Text Replacements (System Settings, Keyboard) fired: a short code like `omw` became "On my way!". It did all of this inside `[[links]]`, inline code and `%% comments %%` as well, so a curled apostrophe in a link broke the link. The editor already asked for no autocorrection and no autocapitalisation; those attributes don't stop it. Found by typing real keystrokes into the built app while surveying for the typing aids (docs/typing-aids.md §1.2).

- Fixed: at start-up the app registers five WebKit defaults for itself (`platform.rs`: `registerDefaults`, in memory, this app only; nothing is written to disk, to the Mac's global settings, or to any other app, and Text Replacements elsewhere keep working): smart quotes, smart dashes, text replacement and spelling autocorrection are off.
- Fixed: the red spellcheck underlines were off in 0.12.0 (the web view's continuous spellchecking defaulted off, so a misspelling was never marked). They are on now. A Codex name the Mac doesn't know will be underlined; stopping that is later work.
- New: `npm run test:typing` (Mac only, built app) types real keystrokes into a chapter of a fixture copy and requires the editor to hold exactly what was typed. It fails on the 0.12.0 build and passes on this one. `--shot` saves a picture of the window to look at the underlines.
- Check this in Obsidian: a `[[link]]` typed in 0.12.0 may have a curly apostrophe or quote in it and show as unresolved.
- Tests: 3 new Rust tests for the defaults; 1,359 core tests and 153 WebKit tests unchanged.

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
