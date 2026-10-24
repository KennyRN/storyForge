# The v1 interface (Brief 5)

The design for the interface Kenny writes in every day. It says *how* each piece of Brief 5 §3 is built; the brief says *what*. Written before any implementation, for review at **H1**. Section 11 lists what the review must rule on; section 12 is left empty for those rulings.

Reference points read for this design: the tag `plugin-harness-final` (`StoryForgeView`, `TopPanel`, `BottomPanel`, `StatsPanel`, `CodexFocusNavigator`, `archivePanel`, `inlineRename`), commit `5699284` (`manuscriptDressing.ts`, `manuscriptDressingView.ts`), `docs/text-labels.md`, and the code on `main` after the Brief 4 merge (`ca723d1`).

---

## 1. Shape of the code

```
src/ui/
  main.ts            entry: builds the model, mounts the shell, wires menus and close
  model.ts           AppModel: the one object the interface reads from and acts through
  shell.ts           the three-column frame, the face switch, splitters
  kit/               buttons, menus, dialog, notices, inline rename, drag, ink
  theme/             purposes.css, everforest-soft-dark.css, base.css, tokens.ts
  editor/            editorHost.ts, dressing.ts (scanners), dressingView.ts, keys.ts, banners.ts
  faces/
    storytelling/    navigator.ts, codexPane.ts, stats.ts
    storyforge/      codexTab.ts, seriesTab.ts, novelTab.ts, archiveTab.ts
    lore.ts          the lore slot
  screens/           start.ts, newProject.ts, summary.ts, renameCodex.ts, settings.ts
  preview/           preview host and fixture harness (section 8)
index.html           the app (replaces the diagnostic page)
src/diagnostic/      kept; reached only from View → Developer → Diagnostics (section 9)
```

No UI framework. Each region is a plain function `render(container, model)` that builds DOM, as the plugin's views did. The existing helpers in `src/view/` (`dragReorder`, `dragReorderTree`, `dragLock`, `inkSlider`, `a11y`, `codexOpenTarget`) and `src/layout.ts` are moved or imported, not rewritten (section 4).

### 1.1 The model

`AppModel` wraps the Brief 4 `AppController` and is the only thing views touch. It offers:

- **Reads**, all synchronous, straight from the Project handle's index: `series()`, `books()`, `chapters(book)`, `codexTree()`, `archived()`, `settings()`, `stats()`.
- **Actions**, each a thin async wrapper over a core function (`createContinuingChapter`, `writeBookChapterOrder`, `renameCodexNote`, `setSetting` …) that, on success, calls `touch(topics)`, and on failure raises a plain notice naming what could not be done.
- **Topics.** `touch` emits coarse topics: `library` (series, books, chapters), `codex`, `archive`, `stats`, `settings`, `project` (opened, closed, read-only), `notices`, `face`. A region subscribes to the topics it draws and rebuilds *its own subtree* when one fires. The watcher's `onChange` (after an outside batch) touches `library`, `codex`, `archive`, `stats` together.
- **Interface state:** the face, the open centre file, the open lore file, collapsed Codex folders, panel widths. The selected novel, selected item and collapsed folders go to machine settings through `saveMachineState`. Panel widths join them (two extra fields in the per-project machine state; the file is TypeScript-owned JSON, so this is additive). The face and highlight settings come from `project.md`.

Editors are **never** rebuilt by a topic. A topic redraws panels; it cannot replace the text under the caret.

### 1.2 One file, one editor

`EditorHost` owns a map from path to `{ view, session }` and two slots, **centre** and **lore**, each holding at most one occupant. `open(slot, path)`:

1. If the path already has an editor, **focus it** (in whichever slot holds it) and stop. A chapter can't be opened in the lore slot while it is in the centre, and the reverse.
2. Otherwise call `AppController.openFile(path)` (which downloads an iCloud placeholder first), build a CodeMirror view for the returned `ProseSession`, and put it in the slot, closing the slot's previous occupant with `session.close()` (a flush) *after* the new one is ready.

Closing the lore slot, switching chapter, or closing the project each flush through `session.close()`. The Brief 4 close flow already flushes every open session at quit, so nothing new is needed there.

---

## 2. What the core gives, and what it doesn't

Every action in Brief 5 maps to a core function that exists today:

| Interface action | Core call |
|---|---|
| Open a chapter or Codex note | `AppController.openFile` → `ProseWriter.open` |
| Add the next chapter (append and open) | `createContinuingChapter` |
| New chapter (placed or unplaced), new book | `createChapter`, `createBook` |
| Rename chapter / book / series title (inline) | `renameChapterTitle`, `renameBookTitle`, `writeSeriesTitle` |
| Place, reorder, unplace | `writeBookChapterOrder`, `writeSeriesOrder`, `writeUnplacedOrder` |
| Planned lengths, default PoV | `writeBookPlannedNovelLength`, `writeBookPlannedChapterLength`, `writeDefaultPov` |
| Archive / unarchive | `archiveChapter`, `unarchiveChapter`, `archiveCodexItem`, `unarchiveCodexItem` |
| Codex create / move / rename folder / type | `createCodexNote`, `createCodexFolder`, `moveCodexItem`, `renameCodexFolder`, `setCodexEntryType` |
| Codex rename (with links) | `planCodexRename`, then `renameCodexNote` |
| Settings | `loadSettings`, `setSetting` (`src/app/settings.ts`) |
| Backups | `AppController.manualBackup("scope" \| "full")` |
| Stats | `getBookWordStats`, `getProjectWordStats`, `getChapterDaily` |
| Create / open / recent | `createProject`, `AppController.openDialog`, `openRecent`, `recent` |

### 2.1 Gaps found while designing (for H1)

These are things the interface needs that the core does not offer today. Each is small and none changes a behaviour; they are listed here because Brief 5 says to hold rather than work around.

1. **Save outcomes from automatic saves are not observable.** The editor's `session.save()` returns a `SaveResult`, but the two-second autosave runs inside `ProseWriter` (`void this.saveSession(session, false)`) and its result is thrown away. A refusal, a failed save, a `recovery-failed`, or a **failed session backup** during autosave would therefore never reach the author, which breaks the §3.3 promise that those get a sticky notice. A conflict *is* visible, because it arrives as a `ReloadEvent`, but the other four are not. **Proposal:** add `ProseSession.onSaveResult(listener)` (and the matching call inside `saveSession`), additive and behaviour-neutral; a core test covers it. Needs a ruling, because it is a change in a kept module.
2. **A "mixed line endings were normalised" notice** rides on the same result (`normalizedLineEndings`), so the same observer carries it.
3. **Reveal in Finder** needs a Rust command. Brief 5 §1.4 allows one that reveals a file, so this is a request to confirm: `reveal_in_finder(path)`, which opens Finder with the file selected, accepts only a path inside the project root or the app data folder, writes nothing, and adds one line to the window's allow-list (and to `test/tauriConfig.test.ts`'s expected list).
4. **Menu changes** (section 7): the *Open Recent* submenu must follow the recent list, and the Developer submenu exists only in development builds. Both are handled entirely in Rust's `build_menu` (the recent list is already Rust's), with no new command.
5. **Undo and Redo menu items.** Tauri's predefined Edit ▸ Undo/Redo send the native `undo:` action to the web view. CodeMirror keeps its own history, so a native undo would do nothing, and the menu's ⌘Z would swallow the keystroke before CodeMirror sees it. Edit ▸ Undo and Redo are therefore **app items** that emit `menu` events; the window runs CodeMirror's `undo`/`redo` on the focused editor. Cut, Copy, Paste and Select All stay predefined (they work natively).

---

## 3. The theme

### 3.1 Purposes

Components refer to purposes only (`var(--purpose-…)`), and a lint test in `src/ui/__tests__/purposes.test.ts` fails if any `.css` or `.ts` under `src/ui/` (outside `theme/`) contains a hex colour, `rgb(` or a palette variable name.

| Purpose variable | Role | Value (Soft Dark) |
|---|---|---|
| `--purpose-editor-bg` | `bg0` | `#333C43` |
| `--purpose-panel-bg` | `bg_dim` | `#293136` |
| `--purpose-raised-bg` | `bg1` | `#3A464C` |
| `--purpose-raised-hover` | `bg2` | `#434F55` |
| `--purpose-border` | `bg3` | `#4D5960` |
| `--purpose-decoration` | `grey0` | `#7A8478` |
| `--purpose-text` | `fg` | `#D3C6AA` |
| `--purpose-text-muted` | `grey2` | `#9DA9A0` |
| `--purpose-accent` | `green` | `#A7C080` |
| `--purpose-selection` | `bg_visual` | `#5C3F4F` |
| `--purpose-trouble` | `red` | `#E67E80` |
| `--purpose-data-fill` | `blue` | `#7FBBB3` (defined, unused until v1.1) |
| `--purpose-data-overrun` | `orange` | `#E69875` (defined, unused until v1.1) |

Values verified against sainnhe's `palette.md` (soft, dark). `grey0` is used for decoration only (dividers, drag handles), never for text; muted text is `grey2` (Portability rule). Two further purposes are derived rather than taken from the palette: `--purpose-focus-ring` (the accent) and `--purpose-text-on-accent` (`bg_dim`, for text on a green button).

`theme/everforest-soft-dark.css` is the only file that names palette roles; `purposes.css` maps purposes to roles. Adding another variant later means one more file of role values.

### 3.2 Fonts

System fonts only, nothing bundled or downloaded.

- **Interface:** `-apple-system, system-ui, sans-serif`.
- **Prose:** `ui-serif, "New York", Georgia, serif`. In WebKit on macOS `ui-serif` resolves to New York. The WebKit preview on another platform will not show New York; its screenshots show the fallback serif, which is noted in the report.
- Prose size 18 px, line height 1.65, maximum line width 38 em, centred. Interface text 13 px.

### 3.3 The stylesheet and motion

`base.css` is new and small: reset, layout, scrollbars, the focus ring (`outline: 2px solid var(--purpose-focus-ring)`), and one set of spacing tokens. The plugin's `styles.css` is consulted for spacing and behaviour only. Every transition and the ink indicator's slide are wrapped so that `@media (prefers-reduced-motion: reduce)` sets their duration to zero (WebKit honours macOS's setting). `inkSlider` gets an `animate: boolean` option read from `matchMedia`, rather than hard-coding the 0.45 s easing.

The window is already forced dark and starts on `#293136`, so the first frame matches `--purpose-panel-bg`.

---

## 4. The kit and the ported helpers

Everything here is plain DOM, keyboard-reachable, with a visible focus ring.

| Piece | Source | What changes |
|---|---|---|
| Buttons, icon buttons, tooltips | new | A native `title` is too slow and unstyled; a small tooltip layer shows after 500 ms and on keyboard focus. |
| Menus | new | Drawn in the page, `role="menu"`, arrow keys, Escape to close, opened by right-click or the keyboard's context-menu key. |
| Dialog | new | `role="dialog"`, focus trapped, Escape cancels, returns focus to the opener. |
| Notices | new | See 4.1. |
| Inline rename | `inlineRename.ts` (harness, 90 lines) | Obsidian `Menu` replaced by the kit menu. Behaviour kept: double-click or Enter to start, Escape cancels, a refused name explains itself. |
| Drag to reorder | `dragReorder.ts`, `dragReorderTree.ts`, `dragLock.ts` (on `main`) | Already free of Obsidian. Kept as they are, plus keyboard reordering (⌥↑ / ⌥↓ on a focused row), which the originals lacked. |
| Ink indicator | `inkSlider.ts` (on `main`) | `animate` option for reduced motion. Attribution stands in `Code Attributions.md`. |
| `a11y.ts`, `codexOpenTarget.ts` | on `main` | Unchanged. |
| `layout.ts` | on `main` | The four layouts collapse to three (`codex`, `seriesBrowse`, `novelBrowse`) plus the archive tab; `hybrid` goes, since it showed the same tree as `novelBrowse`. Its tests are updated in the same commit. |

Icons: **Lucide**, bundled locally, as SVG strings imported only for the icons actually used (a single `icons.ts` re-exports the named ones, so the bundle contains only those). Added to `Icon Licences.md` with the ISC licence. Codex type icons keep coming from the existing catalogue (`codexTypeIcon`); the plugin's own icon set already in `src/core/icons.ts` is not touched.

### 4.1 Notices

- **Transient:** bottom-centre, fade after 4 s, for things like "Chapter created". Hover pauses the timer.
- **Sticky** (anything about the author's words): stays until dismissed, red left edge, names the file, and offers buttons:
  - conflict: "*Chapter 3* changed on disk while you were typing. Your text is saved at *path*." — [Reveal] [Dismiss]
  - recovery or refusal: the reason in plain words, plus the recovery path — [Reveal] [Dismiss]
  - recovery failed: "Could not save *Chapter 3* or keep a copy. Your text is still in the editor." (no dismiss until the text is saved)
  - session backup failed: "The backup before saving *Chapter 3* failed. Your text was saved." — [Dismiss]
  - read-only because of a newer format: one sticky notice at open, with a quiet banner above the editor as well.
- **One-time:** the mixed-line-endings notice is transient and shown once per file per session.

Notices stack, newest at the bottom, at most five visible; a sixth sticky collapses into "*n* more notices".

---

## 5. The editor

### 5.1 Packages

`@codemirror/state`, `@codemirror/view`, `@codemirror/commands` (history, standard keymap) and `@codemirror/search` (⌘F). `@codemirror/lang-markdown` is **not** used: the dressing scanners are hand-written and DOM-free, as they were. All MIT, recorded in `Code Attributions.md`'s table.

### 5.2 One editor per session

`createEditor(session, options)` returns a CodeMirror `EditorView` whose document is `session.body`. Extensions:

- `history()` — undo survives saves, because a save does not touch the document.
- `EditorView.lineWrapping`, and a theme extension that sets the maximum width and centres the content.
- `EditorView.contentAttributes.of({ spellcheck: "true", autocorrect: "off", autocapitalize: "off" })`. WebKit's spellchecker uses the Mac's language settings.
- `search({ top: true })` with the keymap, and a custom ⌥⌘F command that opens the panel with the replace field focused.
- The dressing (5.3), and `keymap.of([{ key: "Mod-b" … }, { key: "Mod-i" … }, …historyKeymap, …defaultKeymap])`.
- An `updateListener`: when `update.docChanged` and the transaction carries no `fromWriter` annotation, call `session.setBody(view.state.doc.toString())`. (Chapters are tens of thousands of characters at most, so `toString` per keystroke is cheap; the writer's two-second timer does the throttling.)
- `EditorState.readOnly.of(true)` plus `EditorView.editable.of(false)` in the read-only states below.

### 5.3 The dressing

Ported from `5699284`:

- **`dressing.ts`** (from `manuscriptDressing.ts`, 185 lines): `scanEmphasis`, `scanHeading`, `scanComments`, `toggleEmphasis`, with their tests (`manuscriptDressing.test.ts`) moved to `src/ui/editor/__tests__/`. These are DOM-free and come across unchanged apart from the import path.
- **`dressingView.ts`** (from `manuscriptDressingView.ts`, 124 lines): the `ViewPlugin`. It is **simplified**, because one file is one editor: the `chapterRangesField`, `chapterIndexAt`, `chapterContaining` and `refreshTouched` machinery is removed, and comments are scanned over the whole document and cached until `docChanged`. The classes become storyForge's own, styled from purposes:

| 0.17.1 class (Obsidian Live Preview) | storyForge class |
|---|---|
| `cm-em`, `cm-strong` | `sf-em`, `sf-strong` |
| `cm-formatting cm-formatting-*` | `sf-marker` |
| `HyperMD-header HyperMD-header-N`, `cm-header cm-header-N` | `sf-heading sf-heading-N` |
| `cm-comment` | `sf-comment` |

- The rule is kept exactly: markers are hidden (`Decoration.replace`) except on any line holding the caret or a selection, where they show.
- **⌘B / ⌘I** call `toggleEmphasis` and mark the transaction `userEvent: "input.format"`.

Heading sizes: `#` is 1.5 em, `##` 1.25 em, `###` and below 1.1 em, all in the prose font, weight 600. Emphasis uses the real italic and bold of the serif.

### 5.4 Living with the writer

- **Reload from disk.** `session.onReload(e)`: if `e.edit` is non-null, dispatch it as `{ changes: e.edit, annotations: [fromWriter.of(true), Transaction.addToHistory.of(false)] }`. History is remapped over it, so undo and the caret survive (decision 21). If `e.edit` is null nothing is dispatched. If `e.recoveryPath` is set, a sticky notice appears (conflict or outside change, per `e.cause`).
- **Save outcomes** arrive through the observer proposed in 2.1 (1) and become the notices in 4.1. Saving that works shows nothing.
- **Read-only states**, each a quiet banner above the editor, in `--purpose-text-muted` on `--purpose-raised-bg` (the red of `--purpose-trouble` is used only where the brief reserves it):
  - archived chapter or note: "Archived. Unarchive it to edit."
  - newer format: "This project was made by a newer storyForge. Update the app to edit it."
  - iCloud placeholder: "Downloading from iCloud…", with the editor empty and disabled until `openFile` resolves; a failure is a transient notice.

  The archived and newer-format states are enforced by the writer (`ProseRefused`); the interface reads the same facts to draw the banner and never relies on the editor being un-typeable for safety.
- **Word count.** The stats panel reads the open chapter's count from the index, which `ProseWriter` updates on every save. While the author is typing the figure lags by up to two seconds; that is accepted.

---

## 6. The faces and the screens

### 6.1 The frame

Three columns, `left | centre | right`:

- Left panel `--purpose-panel-bg`, default 288 px, 200 to 480 px by splitter.
- Centre `--purpose-editor-bg`, the rest.
- Right panel (the lore slot) `--purpose-panel-bg`, default 400 px, 280 to 640 px by splitter; always present and blank when empty (H2 feedback), and ⌥⌘\ shows or hides it.

The header is a thin bar over the left panel: the face switch (one icon button, `aria-pressed`, tooltip "Flip face (⌘\)"), the ink indicator beneath it, and the project's name. The window's title bar stays native and dark.

### 6.2 Storytelling face

- **Navigator** (`navigator.ts`, from `CodexFocusNavigator` + `renderTopPanel`'s navigator mode): the current novel's title; the current chapter row (the chapter's numbered title, highlighted accent when `highlight-active-chapter`); a chevron that expands a five-row scrollable list of the novel's chapters; and the "add the next chapter" tile, which calls `createContinuingChapter` and opens the result. Clicking a chapter opens it in the centre.
- **Codex pane** (`codexPane.ts`, from `BottomPanel`): header "Codex" with new-file and new-folder icon buttons; the virtual-folder tree with type icons, drag to reorder and into folders (`dragReorderTree`), a context menu (Rename…, Set type…, Archive, Archive Entire Folder, Remove Folder and Keep Items). The "Codex archive" button of the plugin goes (the archive tab takes it over). A click calls `storytellingCodexClickAction` against the lore slot's current path: open, or close if it is already the occupant.
- **Stats** (`stats.ts`, from `StatsPanel`, 57 lines): four modes (daily, weekly, chapter, story wordcount), a switch button cycling them, and the count. The calendar button is not rendered (history view is v1.1).

### 6.3 storyForge face

Left panel is a tab strip (icon + label, ink indicator, ←/→ to move, in the order **codex · series · novel · archive**) over the tab's pane. The centre editor and the lore slot are unchanged by flipping faces.

- **codex tab:** the whole panel is the Codex tree (as 6.2, taller), plus the "Rename…" path (6.4).
- **series tab:** the series header (title, renamed inline there, replacing the harness's thin route), the placed novels in order (drag to place/reorder; inline rename; archive is not offered for novels since the core has no novel archive), the unplaced novels under "Unplaced Novels", and a "New" button. Empty placed list: "Drag a book here to sequence it."
- **novel tab:** the current novel's placed chapters, then "Unplaced Chapters", then the planned novel length and planned chapter length fields (`plannedLengthFields`, inline editors) and the default PoV row. Drag to place, inline rename, archive, "New". Clicking a chapter opens it in the centre without changing face.
- **archive tab:** archived chapters and archived Codex items in one list (a quiet chapter/codex segment control), each with Unarchive.

`#` in titles is rendered with `applyHashNumbering` and the project's numbering styles, exactly as the harness did; the raw title (with `#`) is what the inline rename edits.

### 6.4 The screens

- **Start.** No project open: the app name, "Open Project…", "New Project…", and the recent list (each entry a button; a missing folder is shown muted with "Not found"). Nothing else.
- **New project.** A dialog: "Are you writing a series, or a single standalone book?" with a title field, **Start my series** and **Just one book (no series)** (the plugin's onboarding wording), then the native picker for an empty folder, then `createProject`. A non-empty folder gets a plain notice from `ProjectFolderNotEmptyError`.
- **Reconciliation summary.** A dialog after open **only if** anything matched, pruned, was ambiguous, added or gated (or the snapshot was missing or unusable and something changed). Sections only for non-empty groups: *Matched* (old → new), *Pruned* (each with [Reveal] on its recovery file), *Ambiguous*, *Added*, *Gated* (the reason). A quiet open shows nothing at all.
- **Codex renaming.** Opened from the Codex context menu, or the Story menu's Rename… (no shortcut). Step 1, the name field, validated as typed: `[ ] # ^ |` are refused with "A note name can't contain [ ] # ^ |, because no link can carry them." and the Next button stays disabled. Step 2, the plan from `planCodexRename`, on confirm of the name: "Renaming updates *N* links in *M* files", then collapsible lists for *ambiguous links* (left as they are), *links outside storyForge's folders* (*n*, not changed), *unquoted frontmatter values* (not changed), *files not downloaded* and *files that couldn't be read*. A name that resolves to the same note says "Nothing to change." Step 3 runs `renameCodexNote` (open editors flushed first by the core) and reports changed files, skipped files and the backup's path with [Reveal]; a `stopped` result says where it stopped and that nothing changed.
- **Settings.** In a dialog opened by ⌘,: Numbering (two selects), Backups (automatic on/off, frequency, "Back up everything now" with the result as a transient notice), Interface (opens in: storytelling or storyForge; highlight active chapter; hide series pane). Each row shows its source quietly (`project.md`, the plugin's settings, or default) in muted text on the right. Changing a value calls `setSetting`, which writes `project.md` only then. In a read-only project the controls are disabled with the reason.

---

## 7. Menus and keyboard

Built in Rust (`build_menu`), as now. Items that act on the window emit the existing `menu` event with their id; the window decides what to do (Rust never opens a path by itself). Quit stays the Rust-handled item from Brief 4.

| Menu | Items (shortcut) |
|---|---|
| **storyForge** | About; Settings… (⌘,); the standard Services/Hide group; Quit (⌘Q) |
| **File** | New Chapter (⌘N); New Project… (⇧⌘N); Open Project… (⌘O); Open Recent ▸ (the recent list, then Clear Menu is **not** offered); Close Project |
| **Edit** | Undo (⌘Z), Redo (⇧⌘Z) as app items (2.1 (5)); Cut, Copy, Paste, Select All (predefined); Find… (⌘F); Find and Replace… (⌥⌘F) |
| **View** | Flip Face (⌘\\); Show or Hide Lore Slot (⌥⌘\\); Developer ▸ Diagnostics (development builds only) |
| **Story** | Archive; Rename…; Back Up Now (no shortcuts) |
| **Window** | Minimize, Zoom, Close Window (predefined) |

Notes:

- Items that don't apply (New Chapter with no project, Archive with nothing selected) are **greyed out** (ruling 5): the window tells Rust which of the app's own items are enabled through one command, `set_menu_state`, which touches no files.
- **Story ▸ Archive** and **Rename…** act on the **selection in the focused list** (the last-clicked row of the Codex tree, the novel tab or the series tab), and on the open chapter if none. Neither has a shortcut: ⌘⌫ is the Finder's "move to Trash", so Archive stays unassigned unless H1 wants it.
- ⌘B and ⌘I live only in the editor's keymap, not in a menu, so they cannot clash with a menu accelerator.
- Checked against macOS's own: ⌘, ⌘Q ⌘H ⌘M ⌘W ⌘N ⌘O ⌘F ⌘Z are standard meanings; ⇧⌘N is "New Folder" in Finder only; ⌘\\ and ⌥⌘\\ are unused by the system.

**Keyboard reach.** Tab order: header (face switch, project name) → left panel (tab strip, then the active tab's list as a single tab stop with ↑/↓, →/← to expand and collapse folders, Enter to open, F2 or Enter-on-a-title to rename, ⌥↑/⌥↓ to reorder) → centre editor → lore slot. Dialogs trap focus. Menus open with the keyboard. The interface tests walk this order.

---

## 8. The browser preview

So that the interface can be built, screenshotted and tested without the Tauri window.

- `npm run ui:preview` starts a Vite dev server for `src/ui/preview/index.html`. A small Vite plugin (Node, dev only) **copies `test/fixtures/series` to a temporary folder and spawns the real Rust `sf-bridge`** over it, then serves `POST /__host/invoke` that forwards each command to the bridge. The page's `Host.invoke` is a `fetch` to that endpoint, so the preview runs the real Rust guard and file operations underneath the real TypeScript core, which is closer to the app than an in-memory backend would be (and needs no new backend).
- `Host.listen` is local: the page keeps a table of handlers, and `window.__preview.emit("menu" | "watch-batch" | "close-requested", payload)` fires them. The dev server also offers `POST /__preview/touch` (write a file in the temp copy, for outside-change tests), `/__preview/read` and `/__preview/reset` (recopy the fixture).
- `pick_project` in the preview returns the temp folder (or null when a test asks for a cancel); `reveal_in_finder` records the path in `window.__preview.revealed` instead of opening anything.
- **Playwright's WebKit** drives it: `npm run test:ui` runs the interface tests; `npm run ui:shots` writes a screenshot of each face, tab, screen and notice to `docs/interface-shots/`, which the report embeds.
- `npm test` stays as it is (vitest, Linux-capable). The interface tests are a separate command because they need a WebKit download and the Rust bridge. They run in the same commit gate by hand; CI keeps its install, typecheck and test only (GitHub Actions stays off for release work, and no macOS runner is added).

The interface tests are those listed in Brief 5 §5, one per item, plus: the purposes lint (3.1), the keyboard-order walk (7), the one-file-one-editor rule from both directions (centre then lore, lore then centre), and read-only banners for an archived chapter and a newer-format project.

---

## 9. The diagnostic window

It stays, unchanged, in `src/diagnostic/`. View ▸ Developer ▸ Diagnostics is added to the menu **only when `cfg!(debug_assertions)`** (a development build), and a `menu` event with that id swaps the main window's content to the diagnostic page (a hash route) and back. **No second window**, so no new capability. A release `npm run app:build` has no diagnostics at all. (Kenny's built app therefore loses it; `npm run app:dev` keeps it.) The 30-second autosave delay the diagnostic sets stays confined to that view.

---

## 10. Build order and gates

As in Brief 5 §4: this document (H1), theme and kit, preview, editor, storytelling face (**H2**), storyForge face, screens, settings and menus, diagnostics behind the menu, then docs, report and version 0.9.0. Every commit: typecheck, `npm test`, `cargo test --workspace`, the app builds, the preview starts and `test:ui` passes.

New packages to record with licences: the CodeMirror 6 packages above (MIT), Lucide (ISC, also in `Icon Licences.md`), and, if approved, Playwright (Apache-2.0, dev only). New Rust command: `reveal_in_finder`, only if approved.

---

## 11. For H1 to rule on

1. **The writer's save-result observer** (2.1 (1)): a small additive change to `ProseWriter`/`ProseSession`. Without it the sticky notices for refusal, failure and failed backup cannot appear for autosaves. Approve, or choose a different route.
2. **Playwright as a dev dependency.** Brief 5 §5 requires WebKit through Playwright, but §1.6 lists only CodeMirror and Lucide as allowed packages. Needs a yes (dev only, never in the app). It downloads a browser build when installed; the app itself is unaffected.
3. **`reveal_in_finder`** (2.1 (3)), a read-only Rust command and one allow-list line.
4. **Undo and Redo as app menu items** (2.1 (5)). This is a deviation from the standard Edit menu and is a risk I can't confirm without seeing the window; Kenny confirms it at H2.
5. **Menu items always enabled**, answering with a notice, rather than enabled/disabled from the window (section 7).
6. **Prose font:** the system serif (New York via `ui-serif`), 18 px, line height 1.65, 38 em measure. Kenny confirms or names another.
7. **Shortcuts** as in section 7, with Archive and Rename left **unassigned**.
8. **Panel widths** saved in the per-project machine state (two extra fields), with splitters (section 1.1, 6.1).
9. **The `hybrid` layout is removed** from `src/layout.ts` and its tests, since the novel tab replaces it.
10. **Diagnostics as a hash route in the main window**, development builds only (section 9), instead of a second window.
11. **Interface tests outside `npm test`** (section 8), run by `npm run test:ui`.

---

## 12. H1 rulings

Decision 26, confirmed 23 October 2026. All eleven are approved as proposed except question 5.

1. **`ProseSession.onSaveResult` is approved,** with conditions: an observer can never change a save's outcome (anything it throws is caught and logged, never passed back into the writer); it reports every outcome (written; conflict, with the recovery path; refused, with the recovery path; failed and retrying; recovered when editors are flushed; session backup failed; mixed line endings normalised); core tests cover it and the disk-safety suite is unchanged.
2. **Playwright is approved as a development-only dependency,** never part of the built app; its licence is recorded.
3. **`reveal_in_finder` is approved.** It takes a path relative to the project folder, checked by Rust like every other command and refused outside the folder. It only reveals the file; it never opens, launches or writes anything.
4. **Undo and Redo are app menu items.** They act on whatever is focused: CodeMirror's history in an editor, and normal text undo in rename and settings fields. Checked at H2 in all three places.
5. **Menu items are greyed out, not always enabled** (this replaces the proposal in section 7). A command that sets the app's own menu items enabled or disabled is allowed: it touches no files and grants no new permission. It is listed in the report.
6. **Prose font:** New York, 18 px, line height 1.65, provisionally; judged on screen at H2.
7. **Shortcuts** as tabled; Archive and Rename have none.
8. **Panel widths** are navigation state in machine settings, per project.
9. **The `hybrid` layout is removed.** Old layout values are still read safely: `hybrid`, `codexFocus` or anything unknown maps to a sensible tab, never an error. Nothing is rewritten unless the author changes it.
10. **Diagnostics are a route in the main window,** compiled out of release builds, not merely hidden.
11. **`npm run test:ui` is separate from `npm test`.** The interface tests must pass before every commit from commit 3 onwards. They are added to CI only if WebKit runs there practically; otherwise the report says so.

**Preview server rule.** The browser preview's local server is development-only, listens on `localhost` only, and does not exist in release builds. The app's no-network rule stays absolute.

### H2 feedback (storytelling face, tried in the built app, 24 October 2026)

- Everything looked right, including the layout and the font as they stand. One major issue: **the lore slot must be there from the start, blank, even when nothing is in it.** Fixed: it is always shown, and only View ▸ Show or Hide Lore Slot (commit 8) hides it.
- Other, visual, issues are to be raised later by Kenny; none concern behaviour.
