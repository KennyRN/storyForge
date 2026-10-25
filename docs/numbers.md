# The numbers (v1.1): design

Brief 6. Status: **draft for H1 review.** Nothing is implemented. §9 lists the questions for Kenny and Claude; the H1 rulings will be added as §10.

The rules this rests on: decisions 5, 6, 7, 8, 23, 26 and 27 in `storyForge app – decisions.md`, and the "Keeping v1.x cheap" and "Portability" notes. The reference is the plugin at `5699284`.

## 1. Scope and boundaries

Read-only drawing over data the core already holds: the series overview, the novel overview (progress bar, ghost dividers, structure strip, bar-tier chapter cards) and the word-count history dialog.

- **Nothing is written.** No file, key or folder is added. The only edits reachable from these screens are ones v1 already has: planned lengths, and opening a chapter.
- **The maths is used as it stands** (`seriesNovelBar`, `novelLengthBar`, `plotCardTier`, `historyMath`, `history`). If one needs changing, that's a hold.
- **No new dependencies.** Plain DOM, as in the plugin.
- **No cut feature returns:** no synopses, covers, PoV or location rows, plot threads or tier cycling.
- **Ghost dividers and the structure strip are always on** (decision 27). No setting is read, written or imported.

## 2. Files

- `src/ui/overviews/`
  - `bars.ts`: the primitives (data bar, sliver, target marker, overrun)
  - `seriesOverview.ts`
  - `novelOverview.ts`
  - `overviews.css`
- `src/ui/screens/history/`
  - `historyDialog.ts`
  - `heatmap.ts`
  - `history.css`
- `src/ui/theme/purposes.css`: the new purposes (§7).
- Tests: `src/ui/__tests__/` for the pure parts, and the WebKit suite for behaviour.

## 3. Where the overviews appear

The centre is currently owned by `EditorHost`. The overview is **a layer over the centre, not a replacement of the editor.** The editor stays mounted, hidden while the overview shows, so flipping faces or tabs never closes a chapter or loses unsaved text, and the caret and scroll position survive.

State, in `Nav` (navigation state, so machine settings, not `project.md`; decision 23):

- `centreView: "chapter" | "overview"`. It is not persisted across launches: the app opens in the storytelling face, where the chapter always shows.

Rules (Brief §3.1):

| Event | Centre shows |
|---|---|
| Select the series tab | series overview |
| Select the novel tab | novel overview of the selected novel |
| Select the series tab or novel tab while already on it | its overview, if a chapter had replaced it |
| Open a chapter (from a list, or by clicking a bar) | the chapter |
| Select a novel in the series overview | switches to the novel tab; novel overview |
| Select the codex or archive tab | unchanged |
| Flip to the storytelling face | the chapter, always |
| Flip back to the storyForge face | whatever the centre showed when it left |

If the novel tab has no selected novel, the centre shows a short muted line ("Select a novel."), as the left pane does.

The lore slot is untouched. The overview layer has `aria-label` "Series overview" or "Novel overview", and focus is not moved when it appears from a tab click by keyboard (the tab keeps focus).

## 4. The series overview

- Title: the series title, read-only here (renaming stays on the left pane's series tab).
- One row per placed novel, in series order: numbered title (same numbering as the left pane, `applyHashNumbering`) and a bar.
- Widths come from `computeSeriesNovelBarLayout(totals)`. Totals are the sum of the novel's placed chapter word counts from the index. A novel with none shows a **3 px sliver**.
- Tooltip and accessible label on each bar: the word count (`formatWordCount`).
- Unplaced novels listed beneath without bars, in the same order as the left pane.
- Clicking a row selects the novel and switches to the novel tab.

## 5. The novel overview

**Progress bar** (`computeNovelLengthBarLayout(wordCounts, plannedNovelLength)`):

- one segment per placed chapter with words, in order; `dividerPercents` drawn as gaps
- unfilled remainder is the bar track
- a segment's tooltip and label: chapter numbered title and word count
- clicking a segment opens the chapter

**Ghost dividers** (`computeGhostChapterDividerPercents(total, plannedNovel, plannedChapter, scale)`): faint marks in the unwritten remainder. The maths already returns nothing unless both plans are set and the novel is under plan.

**Structure strip:** a 4 px strip under the bar with marks at `STRUCTURE_GUIDELINE_PERCENTS` (seven). It is decorative; it carries `aria-hidden` and a single visually hidden description ("Story structure guide marks at 10, 20, 35, 50, 65, 80 and 90 per cent"). It is drawn whether or not a plan is set; the percentages are of the bar's full width.

**Planned length fields:** the same two fields as the left pane's novel tab, using the same writers (`writeBookPlannedLength`-style functions already used by `novelTab.ts`). See question 1.

**Chapter cards, bar tier only.** One per placed chapter, in order. The card is the numbered title above a data bar. The bar is a port of the plugin's `renderDataBar`, with these rules:

| Chapter state | Drawing |
|---|---|
| no words | 3 px sliver, no marker |
| no planned chapter length | fill only, scaled against the novel's longest chapter (as the plugin did) |
| under plan | blue fill to its fraction; **target marker** at the plan position |
| at plan, at the target's own precision | plain fill; no marker, no overrun |
| past plan | blue to the marker; **orange** from the marker to the end; marker stays |

Overrun is never colour alone: the marker shows the plan, and the tooltip gives the count. The bar has `role="img"` and an `aria-label` of "<title>: <count> words, <over/under> plan" where a plan exists.

Tooltip: `plotCardTooltip(wordCount, plotNote)`: count, then the first paragraph of the chapter's plot note, read-only. Where the plot note is read from is question 2.

Clicking the bar opens the chapter. The title is not an edit target here. Unplaced chapters are listed beneath without bars, as in the plugin.

## 6. The history view

A dialog (the existing `kit/dialog`), opened by clicking the stats panel's chart icon, or Enter or Space on it (it already takes focus). It's read-only.

Contents, top to bottom:

1. **All novels:** the series total (`getProjectWordStats`: current words).
2. **This novel:** current, lifetime written and removed, today and this week (`getBookWordStats`).
3. **Day heatmap:** `defaultHeatmapRange(todayISO)` (16 weeks to today), `dayNetsFromStats`. Columns are weeks starting on Monday, rows Monday to Sunday.
4. **Week heatmap:** `weekNetsFromDayNets`, one cell per ISO week.
5. **A day's breakdown:** click a day cell to list the chapters that changed that day and by how much (`DailyEntry.chapters`), with chapter titles from the index. Chapters no longer present show their filename, muted.

Days are in England's local time (`todayISOInEngland`), as in 0.17.1, whatever the Mac's zone.

Cells are buttons in a grid (`role="grid"`), each with an `aria-label` such as "Tuesday 14 October: 1,240 words". Every cell has the same text as a tooltip. Arrow keys move between cells.

**Steps.** Positive days are bucketed into **four** steps by their share of the range's largest positive day: up to 25%, 50%, 75% and above. A zero-word day is the empty track. Bucketing is a small pure function, tested. Net-loss days use the neutral loss purpose and never red.

Week cells use the same buckets, scaled against the largest week.

## 7. Colours

All through purposes in `purposes.css`; nothing outside `src/ui/theme/` names a colour.

| Purpose | Role | Used for |
|---|---|---|
| `--purpose-data-fill` | blue (exists) | bar fill, heatmap top step |
| `--purpose-data-overrun` | orange (exists) | bar past its marker only |
| `--purpose-bar-track` | `bg2` | the bar's background, the empty heatmap cell |
| `--purpose-heat-a` … `--purpose-heat-d` | `bg2` blended towards `blue` in quarters | heatmap steps |
| `--purpose-heat-loss` | `bg4` | net-loss days |
| `--purpose-guide` | `grey0` | structure strip marks, target marker outline |
| `--purpose-guide-faint` | `bg3` | ghost dividers |

Heat steps are defined with `color-mix(in srgb, …)` in the theme file, so a later palette swaps two values. The purposes test applies as it stands.

Contrast: `bg4`/`grey0` on `bg0` are decoration, and nothing relies on them to carry meaning (every cell has its number). The target marker is a 2 px line in `--purpose-text`, so it reads against both blue and orange; `--purpose-guide` is used only for the strip. Marker colour is question 4.

## 8. Live refresh

- The overviews subscribe to `library`, `stats` and `nav` (and `archive`, as archived chapters leave the placed list). The open history dialog subscribes to `stats` and `library`.
- A refresh is **debounced, trailing, 250 ms.** Saves arrive at most every two seconds, so a typing author causes at most one redraw per save. A burst from a watcher batch or a reconciliation collapses to one.
- A refresh redraws only the overview's own subtree. It never calls `focus()`. If focus is inside the overview (a bar or a date cell), the redraw restores focus to the element with the same key, or leaves it on the container.
- It never touches the editors: no transaction, no selection change. A test saves while the caret is mid-chapter and checks the caret is where it was.
- A refresh while the overview is hidden (the chapter is showing) is skipped, and one runs when it's shown again.
- `getBookWordStats` is asynchronous. Each redraw takes a generation number and drops a late result, as `stats.ts` does.

## 9. Questions for H1

1. **Planned length fields in the overview.** The Brief says "as on the novel tab", but they already live in the left pane's novel tab. Duplicating the controls means two inputs for one value. Proposal: **mount the same field component in the overview header and keep both.** Both read the index, so they stay in step. Confirm.
2. **Where the plot note lives.** The tooltip needs the chapter's plot note. I haven't confirmed how the core exposes it (the chapter sidecar, `chapterSidecar.ts`). If reading it needs a core change or a new async read per hover, I'd hold. I'll check at commit 2 and report.
3. **"Close enough" precision.** I'll port the rule from `renderDataBar` at `5699284` exactly and record the rule in the report. This doc doesn't restate it because I haven't yet reread the original.
4. **Marker colour.** The target marker in `--purpose-text` (light) so it reads on blue and orange, rather than a grey. Confirm.
5. **Heat steps.** Four steps, by share of the range's largest day. The plugin's own bucketing, if it differs, is not reproduced. Confirm four.
6. **Overview layer over a mounted editor** (§3), rather than unmounting the editor. It costs a hidden editor and keeps unsaved text safe. Confirm.

## 10. Tests

As Brief §5, in the WebKit preview, plus:

- pure tests for the heat bucketing and the bar state table (§5)
- a disk test: open each overview and the history view against a fixture and assert the project folder is byte-identical afterwards
- a live-refresh test: type, wait for the save, assert the bar changed and the caret did not move

## 11. H1 rulings (decision 28)

1. **Planned-length fields in both places.** One component, reading the index and writing through the same data-layer function. An edit commits on blur or Return, not per keystroke. The other copy updates without taking focus.
2. **Plot-note tooltips.** `readChapterPlot` (`src/core/book.ts`) already exists, so no core change should be needed. Read lazily on first hover, cached until the next index change. The word count shows at once; the note joins it when the read finishes. If a core change turns out to be needed, hold.
3. **"Close enough" rule** (from `renderDataBar` at `5699284`): the word count is rounded to the target's significant figures (1,493 against 1,500 gives 1,500).
   - equal after rounding: plain fill, no marker, no overrun
   - over: blue up to the target, orange from the target to the word count
   - under: blue up to the word count, plus the dashed marker (2 px wide, round caps, 3 px dashes, 3 px gaps)
   - no words: 3 px sliver, no marker
   - no target: plain fill
4. **Marker colour.** Short of the target, the dashed marker is drawn in `fg` (about 5:1 on the track). Past the target, the blue/orange boundary gets a 2 px notch in `bg_dim` (about 6:1 on both), because `fg` is about 1.3:1 on blue and orange. This supersedes §5 and §7 on marker colour. Purposes: `--purpose-bar-notch`; the dashed marker uses `--purpose-text`.
5. **Four heatmap steps.** 0.17.1's `heatClass`. A day with no writing is an empty cell, not step 1. Each step is the day's share of the largest absolute day or week in the range, rounded up; days and weeks share one scale. Net-loss days also get four steps, in neutral greys (`--purpose-heat-loss-a` to `-d`), never red. This supersedes the single loss purpose in §7.
6. **Overview layer over the mounted editor.** While the overview covers the editor it is inert: it can't take focus, it is hidden from screen readers (`inert`), and Find, ⌘B, ⌘I and Undo don't act on it. Saving carries on underneath.

## 12. As built

- The layer is `src/ui/overviews/layer.ts`, mounted by the shell beside the editor slot in a `sf-centre-wrap`. `Nav.centreView` and `AppModel.centreCovered` say when it shows; `EditorHost.open` into the centre, `openChapter` and flipping to storytelling put the chapter back; the storyForge face remembers what the centre showed when it was left. The app opens on the chapter, so an overview appears after the author selects the series or novel tab.
- Heat steps are named `heat-a` to `heat-d` and `heat-loss-a` to `heat-loss-d` (the purposes test reads purpose names as letters and hyphens only). `bg4` joined the palette file.
- The target marker sits inside the bar's edge at 99% or more, so it is never half clipped.
- Titles in the overviews and the history breakdown use the same hash numbering as the left panel.
- The novel overview's bars scale against the longest chapter or the planned chapter length, whichever is larger; segments of the progress bar open their chapter.
- The overview's planned-length fields use the left panel's click-to-edit field (one component, `lengthFields.ts`); a redraw is skipped while one is being edited.
- Tests: `test/ui/overviews.ui.ts`; unit tests `bars`, `heatmap` and `refresh` in `src/ui/__tests__/`.
