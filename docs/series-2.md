# The series page, round two: a survey (no build)

Written for Kenny and the next release's brief. Nothing here is built; the redesign goes into the next release with its own hold point. Read with `docs/novel-2.md` (the novel tab's chosen chapter, which this copies) and `docs/story-shape.md` (what the overviews may write).

## 1. What there is today

- **The left pane's series tab** (`faces/seriesTab.ts`): the series title row (inline rename, `writeSeriesTitle`), the placed and unplaced novels (drag to sequence, inline rename through `renameBookTitle`). A click on a novel calls `model.selectBook(folder)`: it sets `nav.book`, sets `nav.chapter` to that novel's first chapter, **switches the library side to the novel tab**, opens that chapter in the one chapter editor (`editors.open("centre", …)`, with the usual save first) and shows the novel overview.
- **The central pane** (`overviews/seriesOverview.ts`): the series title (`h2`, not editable here), the series cover and the description beside it, then a row per placed novel (its cover, title as a button, a plain word-count bar and its synopsis), then the unplaced novels.
- **The context panel on the series tab** is the ordinary one: a Codex note if one is open, otherwise blank. Only the novel tab has the chosen-chapter panel (`context/chapterContext.ts`, `showsChosenChapter`).

## 2. The redesign: the central pane always shows the series

- The central pane would be the series overview as it is, with the novels drawn as rows or cards of their cover, title and (read-only) bar; nothing in the pane would depend on which novel is chosen, so it never changes when a novel is chosen. It is `mountSeriesOverview` minus the per-row synopsis fields (they move to the context panel, §3), keeping the cover (`coverBox`), the title and the description (`descriptionField`).
- It stays a layer over the still-mounted chapter editor, `inert` while covered, exactly as the overviews are now.

## 3. The context panel shows a chosen novel

When the series tab is up, the context panel would show the chosen novel (`nav.book`), as `chapterContext.ts` shows the chosen chapter on the novel tab: a `showsChosenNovel(model)` beside `showsChosenChapter(model)`, one host (`sf-novel-context`), hiding the Codex-note host while it is shown. Top to bottom:

1. the novel's **cover** (`coverBox`), 2. its **title**, 3. its **default PoV** (the same Codex picker menu as the novel tab's left pane), 4. its **synopsis** (`synopsisField`, a card on bg0), 5. its **novel data bar** (the progress bar of `novelOverview.ts`: segments, dividers and the structure strip, read-only), 6. its **chapters as unlabelled data bars** (`dataBar` from `overviews/bars.ts` without the name: a `labelled: false` option that keeps the tooltip and the `aria-label`, so the bar is still a named control). A click on a chapter bar would be `chooseChapter` as on the novel tab, or nothing (Kenny's call: a bar with no label that also moves you is easy to hit by mistake).

## 4. What writes today, and how each would move without changing its writer

| Thing | Writer today | Where it is written from today | In the redesign |
|---|---|---|---|
| Series description | `commitDescription` (`core/fieldWriter.ts`), section `## Description`, compare-then-write, recovery under `recovery/_fields/` | `descriptionField` in the series overview | Unchanged: the central pane keeps `descriptionField`. |
| A novel's synopsis | `commitSynopsis`, section `## Synopsis`, same rules, `rescueSynopsis` | `synopsisField` in the series overview rows and the novel overview | Mounted in the context panel instead of the rows. The same `textField`/`FieldBin`, so the close route (`registerCloseCommit`), the compare-then-write and the recovery path are the ones already proved. Its host must register and clear as the chosen novel changes, as the plot note does (`commitFocusedFields` before the panel is rebuilt). |
| Default PoV | `writeDefaultPov(project, book, path, name)` (frontmatter `default-pov`) | the novel tab's left pane (`novelTab.ts`, `metaRow` with the Codex menu) | The context panel calls the same function from the same menu. |
| Covers | Rust `pick_cover` (only `ui/model.ts` calls it, an architecture test), `read_cover` (only `overviews/cover.ts`), then `writeBookCoverName` / `writeSeriesCoverName` in TypeScript | `coverBox` | The context panel reuses `coverBox` for the novel; no new Rust command. |
| Series title | `writeSeriesTitle`, inline rename in the left pane | `seriesTab.ts` | Unchanged (the central `h2` could become an inline rename later; not needed). |
| A novel's title | `renameBookTitle` | inline rename in the left pane | Unchanged; the context title is read-only. |
| Planned lengths | `writeBookPlanned*` through the shared `lengthFields.ts` | the novel tab's left pane | Not moved. |
| Novel data bar, chapter bars | read-only | the novel overview | Read-only in the panel too. |

Opening any of these writes nothing (a test compares the folder byte for byte, as for the other overviews). No writer changes; what changes is where the field editors are mounted and which host owns the close registration.

## 5. Things the redesign must keep or decide

- **The Codex note on the series tab is displaced** by the novel panel, as it is on the novel tab; opening a Codex note on the series tab would need the same rule as the novel tab has (it switches tab, or is refused).
- **Unlabelled bars and colour:** a bar's name is today its only label; unlabelled, the chapter's name is in the tooltip and `aria-label`. The rail and bar colours (round five) apply as they do everywhere.
- **Widths:** the series tab's side panels already have their own set (round five: `seriesWidths`); the context panel's width there would now be a real design input, not a leftover.
- **Chosen state:** `nav.book` is already shared by both sides; the redesign adds no new state if the chosen novel is `nav.book`.

## 6. For Kenny to decide: does choosing a novel also change the novel being written?

Today it does, and more: `selectBook` switches to the novel tab, sets `nav.chapter` to the first chapter and opens it in the one chapter editor. In the redesign the series tab should stay the series tab, so there are two ways:

- **A. Choosing a novel only chooses it for the panel** (a separate `nav.chosenNovel`). The storytelling side keeps its novel until the author asks to write that one (an explicit "Write this novel", or the novel tab's own list). Cost: a second piece of state, and two things called "the novel".
- **B. Choosing a novel changes `nav.book`, as choosing a chapter changes `nav.chapter`** (`chooseChapter` is the precedent: the one editor switches by the save-and-open route with `reveal: false`, no focus moves, the library side keeps its view). The storytelling side then follows: its navigator, its chapter list and its editor are that novel's. Cost: browsing the series changes what you will type into when you flip back; the first chapter is opened without a choice.

Recommendation: **B**, because the app already has one chosen novel and one chosen chapter shared by both sides (decision of Brief 14), and a second chosen novel would contradict it; make the opening of the first chapter silent (`reveal: false`) and keep the last chapter the author was in per novel (a machine setting) so choosing a novel and coming back does not lose their place. Kenny decides.

## 7. Hold points for the build

The close path (every field the panel mounts must register and rescue like the plot note), the disk-safety suite, `test:quit` with text typed in the synopsis in the panel, `test:cover`, and the sessions rules (switching the novel must not end or count a session: nothing is typed in the switch).

---

# Brief 19, H1: survey and mock-up (no build)

Branch `series-2`, cut from `main` at `v1.10.0`. Nothing in `src/` changed. Mock-up: `docs/series-2-mockups/mockup.html` (the app's theme tokens, not app code; `?case=` picks a case) with its PNGs; `now-*.png` and `measure.json` are the app as it is today, measured in the preview at 1440×900. §6 of the survey above (option A or B) is settled by decision 143: **A**.

## H1.1 The series page, and every `selectBook` call

`selectBook` is defined in `model.ts` and called from exactly two places: `seriesOverview.ts` (the name button in each novel row, placed and unplaced) and `seriesTab.ts` (a click on a row in the left pane's novel list). Each also calls `model.select({kind:"novel"})` first. Today it sets `nav.book`, `nav.chapter` (first chapter), `forgeTab = "novel"`, opens that chapter, and shows the novel overview.

| Call | Becomes |
|---|---|
| central pane's novel name | `model.chooseNovel(folder)`: sets the library chosen novel only |
| left pane's novel row | the same |
| (new) "Write this novel" | the old `selectBook`, minus the forced first chapter: reopen the last chapter in that novel |

**Proposed state:** `nav.libraryBook` (string | null), session only. `nav.book` stays the novel being written. `chooseNovel` touches `"nav"` only: no editor call, no `persistSoon`, no session effect. The central pane's rows lose `synopsisField` (it moves to the panel); each row keeps cover, title, word-count bar.

## H1.2 How the two choices interact

- The novel tab shows `nav.libraryBook ?? nav.book`. The left pane's novel tab (`novelTab.ts`) and `novelOverview.ts` read the shown novel, not `nav.book`.
- **Shown ≠ written:** the left pane lists the shown novel's chapters with **no row highlighted** (the highlight is `nav.chapter` only when `nav.book === shown`), and the context panel is empty (`showsChosenChapter` also requires `shown === nav.book`). Choosing a chapter calls `chooseChapter(shown, file)`, which already sets `nav.book`; it then also clears nothing, since the two are equal again.
- **The storytelling side's novel-name click** (`openLibraryTab("novel")`) sets `nav.libraryBook = nav.book` first.
- **Other `nav.book` changes** (`openChapter`, `addNextChapter`, archive tidy) set `libraryBook = null`, so a stale choice never survives writing elsewhere. Needs one test.
- **Novel selector.** Today the novel tab has no novel name in its left pane; the novel's name is the `h2` in `novelOverview.ts` (the workspace). Proposal: the `h2` becomes the selector's button, so it is where the name already is. The navigator's selector (`faces/navigator.ts`) is a closure over one `draw()` that mixes the button, the list, outside-click and Escape handling, and the focus return. **Sharing:** extract `kit/selectList.ts` (`mountSelectList({ items, current, label, onChoose, extraRows, separatorBefore })`), which owns the button, the joined list, the shadow, arrows/Home/End/Return/Escape, outside click and focus return; the navigator becomes its first user (its "add the next chapter" row is `extraRows`), the novel selector its second. Its CSS (`.sf-nav-select`, `.sf-nav-current`, `.sf-nav-row`) is renamed to neutral classes. The navigator's `setBehind` (inert siblings) is navigator-specific and stays a hook. Risk: the navigator's tests (`navigator.ui.ts`) pin the current classes; they would be updated, not loosened.
- **List arrangement (proposal):** placed novels in series order, a separator, then unplaced ones muted, as the chapter list does. The current one highlighted (rule 1); others muted. A standalone project (`storyKind === "standalone"`) renders plain text.

## H1.3 "Write this novel"

- **Icon:** a hover icon (muted at rest, accent on hover, like the add icons) beside the title in the panel, named "Write this novel", tooltip "Write this novel". I suggest Tabler `pencil-bolt` or a quill-and-arrow; **Kenny may supply one.** The mock-up shows a placeholder glyph.
- **Where the last chapter per novel lives:** machine settings, per project (app data folder), as `selectedNovel`/`selectedObject` already are: a new `lastChapters: Record<string, string>` in `MachineProjectState`, written on `persistSoon` whenever `nav.chapter` changes. Never in the project. The key must be carried through saves and read leniently (unknown book or missing chapter falls back to the first placed chapter). **This is new machine state, not a project key.**

## H1.4 The close path

The synopsis in the panel is the same `synopsisField`/`textField` with the same `FieldBin`; `registerCloseCommit` registers while it has focus wherever it is mounted, so the close sequence is unchanged. What must be added: the panel calls `commitFocusedFields()` before rebuilding for another chosen novel (as `chapterContext.ts` does), and a rebuild is refused while the field has focus with unsaved text (`seriesOverview.ts` already has that guard). `test:quit`: add a case typing in the synopsis in the series tab's panel next to the existing chapter and plot-note cases; the other nine routes are unchanged. Cover and default-PoV writes are not typed text and are not close-committed.

## H1.5 Settings

- **"this computer" holds only the widths table:** a note paragraph ("These stay on this computer…", muted), the "Measure widths in" select, the table, and a narrowed-window note. Nothing else needs a new home. The unit select stays; I propose it moves with the table onto "sidebar widths". **To confirm:** if sliders replace typed figures, is the unit select still wanted? Sliders in percent only would drop it.
- **Muted lines in Settings** (`sf-muted`): (1) `source()` after every row built by `row()` and `storyKind()`: "this project", "the plugin's settings", "default" — **source markers, go**; (2) `sizeSlider`'s value span (`sf-setting-source`, already used as a readout): decision 133 removed the visible readout, so check it is hidden, and drop the class; (3) `sf-options-tag` "bar" / "rail" tags above swatches: labels, **kept** unless Kenny says otherwise; (4) `sf-grid-hint` under the Interface and Writing fonts ("Every part of the app's own text…", "The chapter and note editors…"): **hints, listed for Kenny**; (5) widths note paragraph and the "narrower" note: **hints, listed**; (6) `sf-width-hint` range text and "Not allowed: use…": **go with the sliders**; (7) typing page: `sf-setting-hint` on the shortcode explanation ("Type ~ and the letters, then Tab…"), the Mac's-own-aids paragraph and the list settings' hints: **hints, listed**; "None" in empty lists is content, kept; (8) the read-only paragraph at the top of a page when settings are off: a state message, kept.
- **Merged general sub-page:** `GENERAL_PAGES` becomes `["general", "this computer"→"sidebar widths"]`; the page holds Interface (Opens in, Hide series pane), Story (This story is) and Numbering. The "story" sub-page is removed.
- **Hide the series pane:** `check("hideSeriesPane")` is drawn only when `storyKind === "standalone"`. Switching `storyKind` to `series` writes `hide-series-pane` false through the same settings writer, in the same `change()` (two writes, each compare-then-write). The consumers (`storyforge.ts` tabs, `navMenu.ts`) read `hideSeriesPane && storyKind === "standalone"`, so a stored `true` is ignored while a series, and an outside change to `story-kind` (Fix 6) writes nothing.
- **Layout:** `.sf-setting-row` is a flex row with the control pushed to the right edge; a single-control row should use `justify-content: flex-start` with a fixed label width (e.g. 14em) so the control sits next to its label.
- **Width sliders:** one range input per cell, min/max from `rangeIn()`, step 1 (px) or 0.5 (%), `aria-valuetext` giving the value with its unit, saved on release through `commitTypedWidth` (the existing check stays the single authority). Keep-same-width on storytelling, codex and archive means `widthsLinked` becomes per view: **a data change** (`widthsLinked` is a single machine setting today; it would become a set per view, with the old one carried to all three that had it). Flag for Kenny.

## H1.6 The gaps

Measured today (1440×900, left panel 288 px; `--sf-card-gap` = max(12, 10% of left) = 29 px):

| Where | Today |
|---|---|
| storytelling chapter box | top 57 (28 band + 29), left/right 29 from the panels, foot 871 (900 − 29) |
| storytelling Codex card (left) | foot 824, which is 12 above the stats section (836); side margins 29 |
| context panel top | `--top-gap` 20 under the band = 48; side margins `max(12px, 10%)` of the panel |
| novel tab, left Placed box ↔ workspace | 12 px list margin + the overview's 32 px padding = 45 |
| novel tab, workspace synopsis ↔ context boxes | the overview's right edge + the panel's 29 px margin ≈ 74 |

One rule: **`--gap`** = the one figure, used for the window's sides, between panels, and above and below boxes; the band counts inside it (top of a box at `--gap` from the window's top, with the traffic lights in the margin).

- **Option 1, following:** `--gap = max(12, 10% of the left panel)` as now (29 px here). The chapter box's top moves from 57 to 29; the context Codex card's top from 48 to 29; feet all at `900 − 29`... **but** the Codex card's foot is fixed at 12 above the stats (decision 93), so to line up the feet the stats section's top must sit at `--gap` above the foot as well (stats is a fixed 64 px). Everything moves with the panel's width.
- **Option 2, fixed:** `--gap = 20 px` (the existing `--top-gap`). Same alignment, constant at every width; the 10% rule goes (the context panel's note margins and the chapter box change from 29 to 20 here). Simpler to test (one figure), nothing moves as a divider is dragged.
- **Recommendation: option 2.** A gap that grows with a panel makes the boxes shift while dragging and means the novel tab's two gutters can only be equal at one width. **Kenny rules.**
- Novel tab gutters at the chosen figure: the overview's side padding and the panel's margin both become `--gap` (the Placed box already sits `--gap` from the window's edge).
- Mock-up: `story-follow.png` (29) and `story-fixed.png` (20), `gutters.png`.

## H1.7 The bug: how the context panel decides what to show

`shell.ts`'s `apply()` hides the Codex-note host (`loreHost`) **only** when `showsChosenChapter(model)` (library side, novel tab). The `lore` slot's editor belongs to the storytelling side, but nothing hides it on the library side's series, codex and archive tabs, so a storytelling Codex note stays drawn there (and is live, editable). The library layer for codex/archive is a different host (`libraryHosts`) in the workspace, so it is not affected. The fix, in one place:

- `loreHost.hidden = model.nav.face === "storyforge"` (a library side never shows the storytelling note), `inert` while hidden (the editor stays mounted, so nothing typed is lost), and the panel's content chosen by one function `contextShows(model): "note" | "chapter" | "novel" | "empty"` (storytelling → note; library novel tab → chapter; series tab → novel; codex, archive → empty).
- The panel's bottom row (special-characters button) stays; `lastWriting` already greys when the editor is covered.
- A flip-with-unsaved-text test reuses the decision 106 route.

## H1.8 Mock-up (`docs/series-2-mockups/`)

`series.png` (a novel chosen), `series-none.png`, `novel-other.png` (shown, not being written), `selector.png`, `story-follow.png`, `story-fixed.png`, `gutters.png`, `settings.png`. Drawn from the app's tokens, so colours are real; layout and proportions are approximate, and the bars in the panel are the real bar colours and shapes without names.

## H1.9 For Kenny

1. **Gap: following (10%, 29 px here) or fixed (20 px)?** Recommended: fixed.
2. **Selector placement:** the novel overview's `h2` becomes the selector. OK?
3. **"Write this novel" icon:** supply one, or accept a Tabler pencil.
4. **Last chapter per novel** as machine state (`lastChapters`). OK?
5. **Settings:** the muted hints in H1.5 (4, 5, 7): which go? Does the unit select stay once widths are sliders?
6. **Keep-same-width on three rows** makes `widthsLinked` per view in machine state. OK?
7. **Clicking a chapter bar in the panel:** the earlier survey suggested doing nothing (unlabelled bars are easy to hit by mistake); the brief doesn't say. Default: nothing.

---

# Brief 19, rulings and as built (1.11.0)

## Rulings (H1, 6 November 2026)
Gap: one fixed 28 px (nothing follows a panel's width). Novel selector on the novel overview's heading, extracted into `kit/selectList.ts` with the navigator's tests updated to the new class names, not weakened. "Write this novel": Tabler's pencil until Kenny supplies an icon. `lastChapters` in the per-project machine settings; a missing chapter falls back to the first placed chapter. Sidebar widths are percentages: the "Measure widths in" select goes; a px width converts to its percentage once, at the first slider use, with nothing written before. Hints that only repeat their label go; those that say something stay (listed below). `widthsLinked` per view, offered on storytelling, codex and archive. Chapter bars in the panel: a click does nothing, the hover shows the name. The chosen novel is cleared only when the novel being written changes, not when another chapter of the same novel is chosen.

## As built
1. **The bug:** `contextMode()`; the lore host is hidden and inert on the whole library side.
2. **The series page:** `chooseNovel`, `nav.libraryBook`, `shownBook`; the central pane has no synopses and marks the chosen novel (`is-chosen`).
3. **The panel's novel:** `context/novelContext.ts`; `overviews/novelProgress.ts` is shared with the novel overview; `dataBar({ labelled: false })`.
4. **The routes:** `kit/selectList.ts` (the class names `sf-nav-select|list|row|current|add` became `sf-select*`; an arrow key on the button opens the list and moves into it); `model.writeNovel`; `nav.lastChapters`; `openLibraryTab(tab, { resetChoice })`.
5. **Settings:** `GENERAL_PAGES = ["general", "sidebar widths"]`; `seriesPaneHidden`; sliders; `widthsLinkedViews`.
6. **The gap:** `--gap` and `--half-gap`.

## Differences and decisions made while building
- **The three boxes' common foot** is 12 px above the stats section (76 px from the window's foot), the Codex index card's existing foot (decision 93): the chapter box's foot moved up from 29 px above the window's foot. The storytelling chapter box's bottom margin is therefore not 28 px.
- **The gap is 14 px on each side of a panel's edge** (28 px in all), so the Placed box's right edge, the workspace's content and the context boxes all keep to it. The overviews no longer have a maximum width (880 px), so the gutters are equal at every width; the series overview's list rows are wider on a wide window.
- **The library's Codex and Archive workspace card now starts at the title band** (28 px from the window's top), as the storytelling boxes do; a test that said 48 px was updated.
- **The same-width switch** is a per-view machine setting (`widthsLinkedViews` for series, novel, codex and archive; `widthsLinked` stays the storytelling set's). Only storytelling, codex and archive offer it.
- **"Hide the series pane":** the settings writer switches it off when a series is chosen (two writes, each compare-then-write); `seriesPaneHidden` ignores a stored `true` while a series.
- **`test:settings-sync`** now uses the "Opens in" selector as its disabled-control probe (the checkbox it used is only drawn for a standalone story); **`test:widths`** sets the slider's value through the accessibility API and was not run against the built app when it was written.
- **The title band's pointer events and the list of rows** are otherwise as before.

## Settings hints, for Kenny's look
- **Removed (repeated their label or said where a value came from):** every "this project" / "default" / "the plugin's settings" marker; the sidebar widths' range text and "Not allowed" messages; the "Measure widths in" select; the widths note's second sentence ("Each row is the widths of the left panel and the right panel only…"); "for this project" in the first sentence.
- **Kept (they say something the label doesn't):** the "bar" and "rail" tags beside the two swatch rows; the Interface and Writing fonts' hints; the widths note ("These stay on this computer. Unlike the rest of this dialog, they don't travel with the story.") and "The panels are narrower than this in the current window."; the Writing page's hints (the Mac's own aids are off; "Type ~ and the letters, then Tab…"; the elisions, names and special-characters lists' hints).
