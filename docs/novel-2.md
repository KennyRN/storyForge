# Brief 14: the novel tab, round two

Design: Kenny, 3 November 2026. Ships as `1.7.0` from `novel-2`. This file holds the **H1 survey** (read only, nothing built) and, later, the rulings and the as-built section.

## H1 survey

### 1. How the plugin drew text over a bar (`renderDataBar`, `NovelPanel.ts` at `5699284`)

- The chapter's name sat **inside** the bar's row (`headerRow`), and the bar was drawn behind it as absolutely positioned `<div>` segments (solid fill, a dot lattice for overrun, an SVG dashed marker for "short"). The row was 34 px high.
- Readability was a **colour split of the text itself**: the name element got `background-image: linear-gradient(to right, T 0, T fill%, B fill%, B 100%)` with `background-clip: text` and a transparent fill. `T` was the chapter colour's own *text* colour (chosen for contrast on the fill), `B` its *background* colour (the accent, drawn as plain text on the empty track). The cut-over was a hard step at the fill's end.
- That worked in the plugin because **each chapter had its own colour pair**, and the track was the plain Obsidian background, so `B` always read on the track. Here there is one bar colour (`blue`) and a `bg2` track, and a single colour can't be right on both sides: light text is about 1.3:1 on the blue, dark text is lost on the track.
- **Proposal (as expected):** two layers of the same text, positioned exactly over each other. The upper layer is dark (the surface's colour), clipped to the fill's width (`clip-path: inset(0 (100 - fill)% 0 0)`). The lower layer is the ordinary text colour over the track. The lower layer is what a screen reader reads (the upper is `aria-hidden`). This is the same hard cut-over the plugin had, but with two real text colours rather than a gradient clip, so it is selectable, renders crisply in WebKit and doesn't depend on `background-clip: text`. With overrun dots, the dots are the bar's own blue on the track, so the light layer is over dots: see issue A.
- The contrast check is by measurement (the tests the brief asks for): sample the two layers' colours against the fill and against the track.

**Issues for Kenny's ruling (A to C) that the survey found:**

- **A. The bar is 12 px high** (`.sf-bar`, `overviews.css:2`), and the page root is 13 px. A name drawn over a bar that height cannot fit (the plugin's was 34 px). "The height is the app's current bar height" and "the name drawn over its bar" can't both hold. Options: (1) the bar grows to about 24 px so the name fits (my recommendation; the chapter bars are now the whole card, so there's room); (2) keep 12 px and draw the name at about 9 px (too small to read); (3) the name stays above the bar, as now (rejects §1.1's first line).
- **B. Overrun dots over a name.** The dots are the bar's colour, 2 px, on an 8 px grid, so they pass behind the light layer's letters. They are sparse enough to read through, but this is worth Kenny's eye on the mock-up.
- **C. The name's length.** A long title is clipped with an ellipsis inside the bar's width? Or it may run past the fill's end onto the track, which is the point of the two layers. I propose the name is one line, ellipsised at the bar's full width (not the fill's).

### 2. Do the series overview's bars share the chapter bars' drawing code?

**In part.** Both go through `src/ui/overviews/bars.ts`, and both use the CSS classes `.sf-bar`, `.sf-bar-fill` and `.sf-bar--sliver` (the track, the fill colour, the 3 px sliver, the 12 px height). But:

- The **chapter bars** are `dataBar()`: they add the marker, the overrun part and the notch.
- The **series overview's novel bars** are `plainBar()`: a fill (or the sliver) against the longest novel, no target, no overrun, no marker, no notch, no name over it (the name is a button above).
- So the overrun, notch and marker changes **don't reach the series bars** (it has none of them). The one-colour fill is already the same. The only shared thing is the **bar height**: if ruling A grows `.sf-bar`, the series bars grow with it unless the new height is put on a chapter-bar class only. I recommend the chapter-bar class only, so the series bars are **unchanged**.
- The novel overview's own progress bar at the top (`.sf-progress-seg`, segments per placed chapter) is separate code and isn't touched.

### 3. Everything removed, and what depends on it

| Removed | Where it lives | Does anything else depend on it? |
|---|---|---|
| Card sizes (extended, collapsed, bar) | `core/plotCardTier.ts` (`PlotCardTier`, `nextPlotCardTier`, `readPlotCardTier`, `withPlotCardTier`, `seedPlotCardTiers`, `plotCardTooltip`); `model.cardTier` and `model.setCardTiers`; the `.sf-card--<tier>` classes | Only `novelOverview.ts` and `model.ts`. `plotCardTooltip` (the hover text) **stays**, since the tooltip stays. The rest is dead once the cards are bars, with its tests (`core/__tests__/plotCardTier.test.ts`). **Ruling D:** delete the dead functions and their tests, or keep them until a later clean-up. I recommend deleting. |
| Stored card sizes | `machine.cardTiers` (machine settings, per project), read into `nav.cardTiers` (`model.ts:156`) and written back by `saveMachineState` (`model.ts:454-456`) | The brief says ignore and never rewrite. Today every save writes `cardTiers` back from `nav`. To "never rewrite", `nav.cardTiers` is kept as an untouched pass-through (read at open, written back as it was) so the stored figures are carried as they are. Dropping the key from the write would erase them, which is a rewrite. It is the only place that needs care. |
| The chevron | `.sf-card-chevron` in `novelOverview.ts` and `overviews.css`; its test in `test/ui/overviews.ui.ts` | Nothing else. |
| The all-sizes control | `.sf-size-control` / `.sf-size-option`; a named exception in `src/ui/__tests__/defaultRules.test.ts:60` | The exception row is deleted with it. |
| The cover link | `removeCoverButton` in `cover.ts`, used by both overviews; `.sf-cover-remove` | Nothing else. `model.removeCover` stays (the menu's Remove Cover uses it). |
| The header's three fields | `povRow` and `meta` (Novel Length, Chapter Length) in `novelOverview.ts` | The left pane has its own (`faces/novelTab.ts`: default PoV at line 83, the two length rows at 98 to 103, through the shared `faces/lengthFields.ts`). Nothing about storage changes. The workspace's `editing` state (the length being edited) goes with them. The novel overview still needs `plannedChapter` as the bars' target and `plannedNovel` for the progress bar and its ghost dividers. |

Also: the card's PoV and Location rows, the "Length" row and the per-card plot note go from the cards (they move to the context panel). The unplaced list in the workspace goes (§1.3).

### 4. The close path

- The close commits focused fields through `commitFocusedFields` (`src/ui/commitOnClose.ts`), registered by `model.ts:116`. A field registers while it has **focus** (`registerFocusedField`, from `fieldCommitter.ts`), whichever element holds it. So a plot note moved into the context panel is found **as long as it is built with `textField(…, bin)` the same way**, because the registry is a module-level set, not a search of the card. No change to the close path is needed.
- What does change: the **`FieldBin`** (the editors of the current draw, cleared on redraw). The context panel's plot note needs its own bin, cleared when the chosen chapter changes, and **its commit must run before the clear** (the blur commit already does; the redraw guard that skips a redraw while a `.sf-note-field` has focus needs the same for the panel's own redraw on a chapter change, or the typed words would be dropped). This is the thing to test hardest.
- **`test:quit`** (`scripts/quit-smoke.mjs` lines 148 to 160): its plot case clicks "Open the novel on the library side", then the "novel" tab, then focuses the accessibility text area named "Plot note for…" on a card. After the change a plot note exists only for the **chosen chapter**, so the script must also choose one (the chapter being written is already chosen, §1.7, so it may need nothing extra), and the plot note will be in the context panel, not the overview. The lookup by name "Plot note for" can stay if the panel's field keeps that label; the commit check (`novel-aaa.md`) stays. The expected file is the chosen chapter's novel file.

### 5. The chosen-chapter route

- `model.openChapter(book, filename)` (`model.ts:273`) sets `nav.book` and `nav.chapter`, selects it, switches the centre to the chapter view and calls `editors.open("centre", path)`. The **navigator's dropdown** (`faces/navigator.ts:85`) and the **left pane's placed list** (`faces/novelTab.ts:58, 61`) both call it. So the left pane's choice already is the shared one, by the same save-and-open route.
- What isn't yet so: the **overview's bar** (`.sf-bar--link` click, `novelOverview.ts`) also calls `open(key)` today, so that already goes through the route. The difference the brief wants is therefore not the route but what is **shown**: the context panel, and the highlight. Today, on the library side, an `openChapter` also flips nothing; the editor under the overview is inert. This already matches §1.7 ("the editor under the overview stays inert").
- The highlight in the left pane's list is `settings.highlightActiveChapter && nav.chapter === name` (`novelTab.ts:49`). **Ruling E:** §1.7 says the chosen chapter is highlighted (rule 1). With "Highlight the active chapter" switched off, should the list still highlight the chosen one? The navigator's dropdown always does, whatever the setting (`navigator.ui.ts:201`), so I recommend the library list does too.
- The novel name on the storytelling side (`navigator.ts:60`, "Open the novel on the library side") already lands on the novel tab with `nav.chapter` unchanged, so the chapter being written is already the chosen one. For an unplaced or archived chapter, nothing is in the placed list; the panel needs `nav.chapter` to resolve whether or not it is placed (it does: it reads the project by path).

### 6. Mock-up

`docs/novel-2-shots/novel-tab-today.png` is today's novel tab from the preview, for reference (it shows the 12 px bars, the name above each bar, the cards and the size control that go). The proposed layout is described here in words, because the brief says to build nothing before the rulings:

- Workspace (`bg_dim`): the novel's title; cover (a button) and the synopsis on a `bg0` card; the progress bar; then one bar per **placed** chapter, each the full width with its name over it.
- Context panel (`bg_dim`): PoV, Location (on the panel); the plot note on a `bg0` card; the chapter's text on a `bg0` card, read-only, scrolling inside it.
- Left pane: Default PoV, Novel Length and Chapter Length as now; the placed list and the unplaced list each on a `bg0` card, the chosen chapter highlighted.

## Rulings (3 November 2026)

H1 accepted. **A** chapter bars about 24 px (series bars stay 12 px; new sizes on a chapter-bar class only). **B** Kenny judges the dots under the name on screen: commit 1 is built and its screenshots are in `docs/novel-2-shots/`; commit 2 waits for his look. **C** a long name is one line, "…" at the bar's full width, full name in the tooltip. **D** delete the card-size code and its tests, but pass the stored `cardTiers` through untouched on every save (a test proves it). **E** the chosen chapter is always highlighted in the left pane's placed list; report every place the "Highlight the active chapter" setting still affects.

## As built

**Commit 1, the bars** (Kenny's look at the built app changed three things from the first build; the version here is the final one).

- **34 px high** (the plugin's height; this amends Brief 14 §1.1's "the app's current bar height", which would have been 12 px). Chapter bars only (`.sf-bar--chapter`); the series overview's bars are untouched at 12 px.
- **The plugin's dot lattice** (`renderDataBar`'s `addDots`): 2 px dots, 8 px columns, nine rows 4 px apart (centres 1, 5 ... 33 of the 34), flush with both edges, half dots at the seam with the fill. Drawn as a CSS lattice rather than one `<div>` per dot; whole dots only at the right edge (the width is 4n+1, by `round()`). In the bar's own colour, no gap to the fill, no notch, no orange. The dashed marker short of the target is in the bar's own colour.
- **The name is one layer** (the two-layer split and its clipping are retired): dark text (`--purpose-text-on-data`, bg_dim) with an **outer stroke in the data colour**, 4 px beyond the letters (an 8 px centred stroke painted under the fill, `paint-order: stroke fill`), round joins (Kenny chose this over a rounded rectangle: it reads as part of the name, not of the data bar). It is drawn over the fill, the dots and the empty track alike. The text's box carries 4 px of padding all round (cancelled by a margin) so the stroke is always inside it: a long name is cut short with "…" at the bar's full width and the stroke is never clipped, nor at the bar's top or bottom edge (the text is pinned to the bottom with 4 px of padding, as in the plugin). The full name is in the tooltip, then the count and the plot note's first paragraph.
- **Size and weight, from the plugin** (`5699284`, `styles.css` and `styleController.ts`): `font-size: var(--sf-story-context-plot-chapter-size, 1em)`, set from the setting `storyContextChapterTitleFontSize` (default 1), so 1em of whatever text size the Obsidian view inherited; `font-weight: ...-weight, 600` (the CSS fallback, there was no setting); family inherited; padding 4 px 6 px; the text pinned to the bottom of the 34 px row. **The 15 px is an assumption**: Obsidian's default interface text size (`--font-ui-medium`), not read from the repository. To be confirmed by Kenny's look; it is one value (`.sf-bar-name-text` in `overviews.css`). Weight 600.
- Tests (`test/ui/novelBars.ui.ts`): 34 px chapter bars with one name layer, series bars 12 px; dark text on the stroke at least 4.5:1 and the stroke the data colour; the stroke's box never clipped (4 px of padding, glyphs 4 px inside the bar's edges, the long name and a short one); **no dot touches a letter**, by pixels (the track and text recoloured magenta and black for the measurement only, so no colour is ambiguous: no track pixel within 3 px of any letter pixel, checked to fail on a 3 px stroke); the dots and marker in the bar's colour, flush, whole dots, no notch; the tooltip.
- `--purpose-data-overrun` is no longer used by any bar. The series overview's bars are unchanged.
- **Found, not fixed:** a Chapter Length of 1 (with a Novel Length of 80,000) makes the overview draw about 80,000 ghost dividers (`computeGhostChapterDividerPercents`) and the window stops responding. It is the same code as in 1.6.5 and earlier, not from this brief; worth a cap for a later fix.
