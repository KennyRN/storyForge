# Brief 18: the type styles (decision 123)

H1: a survey and a mock-up. Read only; nothing in `src/` has changed. Branch `looks`, from `main` at `v1.9.0`. Reported together with `docs/colours.md` (Brief 17), at one stop (decision 124).
Mock-up: `docs/type-styles-mockups/`: the real preview, with the Interface font swapped by one CSS variable.

## 1. Every text rule mapped to a style

A scripted pass over every `src/ui/**/*.css` found **20 distinct font sizes**, weights of 400, 600, 700 and the variable ranges, one letter-spacing (`0.04em`, twice) and one `text-transform` (`lowercase`, the pane titles). The mapping of the table in Brief 18 §1.3:
- **Display** 28 px: `.sf-start-title`. **Title** 20 px: `.sf-overview-title`. **Heading** 15 px: the dialog title. **Small heading** 12 px / 600 / 0.04em: the pane titles, Placed and Unplaced, the summary titles, the overview sub-headings (13 px today). **Body** 13 px: the app's base (`body`, `--text-ui`, `base.css:34`) and most rows, buttons, menus. **Hint** 12 px: the 16 rules at 12 px (problems, paths, placeholders, the banner). **Bar name** 19 px / 700: `.sf-bar-name-text`.
- **Navigator:** `.sf-nav-lead` (novel title), `.sf-nav-series`, `.sf-nav-current` and `.sf-nav-row` (selected chapter), the Codex list: all four already go through `--ap-*` variables.
- **Writing:** `.sf-editor .cm-content` (`--prose-size`), `.sf-chapter-text` (15 px), the three fields (`.sf-note-field`, inheriting).
- **Fit no style, listed for Kenny:** the special-characters button (17 px, `.sf-chars-button`) and its characters (18 px, `.sf-char`): they draw a glyph, not words; `.sf-nav-note` (`0.8em` of its line); the three 14 px rows (overview names, the shortcode popup: to Body's 13 px as the brief tidies them). Everything else lands in a style.
- This pass reads the rules by selector; the full per-rule table is produced rule by rule in the build's commit 2, where each rule is moved onto its style and a static test fails on any that isn't.

## 2. What could shift when the Interface font changes

- **One switch.** The Interface font is set in two lines: `--font-ui: -apple-system, system-ui, sans-serif` (`base.css:3`) and `body { font: var(--text-ui)/1.4 var(--font-ui) }` (`base.css:34`), plus the CodeMirror find panel (`editor.css:90`). The mock-up swaps that one variable and the whole app follows.
- **The Navigate menu's capital-height centring** (decision 112): it trims the label's box to the font's capital height, measured. The cap heights are: Atkinson Hyperlegible Next **0.668 em**, Sofia Sans **0.655 em** (from the fonts' OS/2 tables); SN Pro's couldn't be read here (the WOFF2 needs a decoder I don't have), but the code measures the real font at runtime, so it follows. The Navigate shots in both fonts show the text centred on the icons.
- **The 60 px alignment of the Codex lists** (decision 106): fixed paddings, not font metrics; it moves only through the fonts' own side bearings (the 0.5 px already allowed).
- **The bar name's cut-off:** CSS ellipsis at a measured width; the text is a different width in each font, so which letters are cut changes; the rule (at the further of the frame's inner end and the bar's end, less 8 px) does not.
- **The stats' tabular figures:** **both fonts have them**, measured in WebKit (four `1`s and four `0`s at 40 px under `font-variant-numeric: tabular-nums`: SN Pro 96 and 96, Atkinson 101.12 and 101.12, Sofia Sans 100.8 and 100.8). The two places that use them (`faces.css:498` and `:802`, and the session-when column) stay steady. Without `tabular-nums` the digits are proportional in all three (`1` much narrower), so every number that must hold still has to keep that property; none does without it today.
- **Tests that measure text:** `spacing.ui`, `measure.ui`, `look.ui`, `fonts.ui`, `navmenu.ui`, `dividers.ui`, `novelBars.ui` and `defaultRules.ui`'s sizes, and `test:look` and `test:fonts` in the built app. Each measures the system font's drawing today; they will assert the style's resolved font instead, and be run in both Interface fonts (the brief's point 2 list).

## 3. Sofia Sans

- **Where:** Kenny's `Fonts/Sofia Sans/` (outside the repo): `Normal/SofiaSans[wght].ttf` and `SofiaSans-Italic[wght].ttf`, plus `OFL.txt`; the other three widths are not wanted.
- **Format:** **variable TrueType (TTF)**, the same as Aleo and Atkinson, which the app already bundles as TTF in their own folders (`src/ui/theme/fonts/<family>/`). No conversion needed (so no Reserved Font Name question arises from converting).
- **Axis:** `wght` **1 to 1000** (default 400), so **600 and 900 are covered**; the italic file has the same axis and `italicAngle` −9 (a real italic, so nothing is synthesised). Both have `tnum` and the characters the app uses (’ and ŋ checked).
- **Licence:** SIL OFL 1.1, "Copyright 2019 The Sofia Sans Project Authors"; **no Reserved Font Name** is declared. It is recorded in `Font Licences.md` with the others, with Inter's entry marked removed.
- **Inter** leaves: its files (`src/ui/theme/fonts/inter/`), its `@font-face`, its place in `core/fontFamilies.ts`, its licence resource in `tauri.conf.json` (`OFL-Inter.txt`), and its entry, marked removed in 1.10.0; a stored `Inter` draws the default and is never rewritten.

## 4. Proposed size ranges (never under 11 px for an interface style)

| Style | Default | Range |
|---|---|---|
| Display | 28 | 20 to 40 |
| Title | 20 | 16 to 28 |
| Heading | 15 | 13 to 22 |
| Small heading | 12 | 11 to 16 |
| Body | 13 | 11 to 16 |
| Hint | 12 | 11 to 14 |
| Bar name | 19, fixed | the font only |
| Prose | 20 | 14 to 32 |
| Reading | 15 | 12 to 22 |
| Fields | 13 or 14 (Kenny's choice) | 11 to 20 |
| The four Navigator styles | as now | as decisions 79, 83, 84 |

Weights follow each family's own axis (nearest weight kept, as now). A figure outside a range is refused with the range shown.

## 5. `test:look` and `test:fonts`

- **`test:look`** proves SN Pro draws the writing surfaces by reading real line widths and the slant of the wynn in italic. It will read the **Writing font's** resolved family: default SN Pro (as now), and a second stage sets the Writing font (through the setting, by accessibility action) to another family and proves the same surfaces change.
- **`test:fonts`** proves each Appearance family draws and weight/Softness/size change the drawing, for the four Navigator parts. It gains the two bases and the new styles' rows, drops Inter, adds Sofia Sans (upright and a real italic), and checks that changing a base changes every style that follows it and none that names its own.

## 6. The mock-up

All in `docs/type-styles-mockups/`, the real preview with only the Interface font swapped (`--font-ui`), 1200 x 800:
| Screen | SN Pro | Atkinson Hyperlegible Next |
|---|---|---|
| the storytelling side, Navigate menu open | `storytelling-navigate-sn-pro.png` | `storytelling-navigate-atkinson.png` |
| the library side's novel tab, with the context panel | `library-novel-sn-pro.png` | `library-novel-atkinson.png` |
| Settings ▸ Appearance | `settings-appearance-sn-pro.png` | `settings-appearance-atkinson.png` |
| the start screen | `start-sn-pro.png` | `start-atkinson.png` |
| a dialog and notices | `dialog-notice-sn-pro.png` | `dialog-notice-atkinson.png` |

Also: `sofia-navigator.png` (the novel title at 900 and the series name at 600 in Sofia Sans), `fields-13px.png` and `fields-14px.png` (the Fields style at each size: the context panel's plot note), and `sofia-writing-italic.png` (Sofia Sans as the Writing font, with its real italic). Two notes on the pictures: the notices in the library and storytelling shots are leftovers from the dialog step of the same run, which also shows several notices at once; and "Settings ▸ Appearance" still shows today's page (the new groups are built after the rulings).

## 7. Questions for Kenny

1. **The Fields size:** 13 px or 14 px? (`fields-13px.png`, `fields-14px.png`)
2. **The Interface font:** SN Pro or Atkinson Hyperlegible Next? You choose at your look in the built app; until then SN Pro.
3. **The size ranges** (§4): right?
4. **The special-characters button and its characters** (17 and 18 px): leave as glyph sizes outside the styles?
5. **Sofia Sans:** is it right to copy the Normal-width files from `Fonts/Sofia Sans/` into the repo? I won't touch your folder.

## 8. Rulings (H1, 5 November 2026)

- **Body bold** is its own Interface style: 600 at 13 px, following the Interface font, changeable like the others. It is the series title, the project card's name and state words, the plan headline and the shortcode label. No relative `bolder`.
- **Fields** is 14 px: the plot note, the synopsis and the description (`.sf-section-field` too). Only the overview names go to Body's 13 px.
- **Named exceptions** in the static test: the prose headings (`em`), the dressing's emphasis weights (bold 700, the markers' 400), the special-characters button and its characters (17 and 18 px) and `.sf-nav-note` (see below); the library side's Codex list is the Codex list style, no exception.
- The Interface font is SN Pro until Kenny chooses at his look (SN Pro or Atkinson Hyperlegible Next). Sofia Sans is bundled in three widths, each its own family.

## 9. As built (1.10.0)

**Core.** `core/typeStyles.ts` is the table: Display 28/600, Title 20/600, Heading 15/600, Small heading 12/600, Body 13/400, Body bold 13/600, Hint 12/400, Bar name 19/700 (fixed: the font only) for the Interface; Prose 20, Reading 15, Fields 14 (all 400) for the Writing font; sizes in pixels with the ranges of §4. Two base fonts, **Interface** and **Writing** (default SN Pro for both), are what a style follows until it names its own font (`base`).

**Settings** (`project.md`, written only on change, an unknown or out-of-range value reads as the default and is never rewritten): `appearance-interface-font`, `appearance-writing-font`, and for each style `appearance-<style>-font|weight|size|soft` (`display`, `title`, `heading`, `small-heading`, `body`, `body-bold`, `hint`, `bar-name`, `prose`, `reading`, `fields`). The style's font is a family or `base`. The weight is the resolved family's nearest real weight (Sofia Sans runs to 1000, so the stored weights now allow 100 to 1000). The Navigator's four parts keep their own keys and ranges (rem, as in decisions 79 to 84) and gain `base` as a font (the Interface font in the Settings list).

**Drawing.** `applyAppearance` sets `--font-interface`, `--font-writing` and, for every style, `--ts-<style>-family|weight|size|var` on the page (and with no project open applies the defaults). The defaults before that are `theme/typeStyles.css`, which a test keeps equal to the table. Every text rule in `src/ui/**/*.css` writes `font-family`, `font-weight`, `font-size` and `font-variation-settings` as `var(--ts-…)` (or `var(--ap-…)` for a Navigator part); `src/ui/__tests__/typeStyles.test.ts` fails on any other font, size or weight (proved by breaking a rule), on `font:` other than `inherit`, and on a system font; the exceptions are named there.

**`.sf-nav-note`** is a named exception, not Hint: it is 0.8 of the line it sits in, so it scales with the Navigator's Selected chapter style (the one it belongs to). Hint would be a fixed 12 px whatever that part's size.

**Settings ▸ Appearance** is in three groups, **Interface** (the Interface font, then the eight styles), **Navigator** (the four parts) and **Writing** (the Writing font, then Prose, Reading, Fields), then Codex colour, Data colour and Text colours. A style row is its font (first option: the base font), weight, size in pixels (committed on Return or blur, refused outside its range with the range shown, Escape puts it back) and a sample.

**Letter-spacing and case** are not part of the style: the pane titles and zone labels keep their 0.04em and lowercase in their own rules (the overview and summary headings were never spaced).

**Tests.** `typeStyles.test.ts` (the static test and the defaults), `typeStyles.ui.ts` (the three groups, the bases following, ranges, weights, samples), settings tests for the 46 new keys, `look.ui.ts` and `appearance.ui.ts` updated for the Interface font (SN Pro first, Arial then the system's as the fallback). `npm run test:look` now also changes the Writing font from outside and checks the fields move; `npm run test:fonts` checks that the Interface font moves a style that follows it and not one that names its own, that a size moves a style and that the Writing font leaves the interface alone (the Codex list, set to follow the Interface font, is the probe: the start screen draws the defaults whatever project.md holds, and a card's text is not exposed to accessibility). Both are untested in the built app until the sweep.

## 10. Look, first round (1.10.0)

- **Display has no row in Settings.** Its only use is the start screen's title, which is drawn with no project open and so always at the default; a per-project setting could never show. The style stays at its default (28 px, 600, Interface font); stored `appearance-display-*` keys are left on disk and nothing writes them.
- **Appearance's Interface group is two:** *Interface: System* (the Interface font, Body, Body bold, Small heading, Hint) and *Interface: Display text* (Title, Heading, Bar name).
- **Settings scrolls on the right only:** the section list and Done stay still; the page keeps its scroll through redraws and a newly chosen section starts at the top.

## 11. Look, second round (1.10.0)

- **Appearance is one entry with five sub-pages** across the top of its pane (Interface: System, Interface: Display text, Navigator, Writing, Text colours); it opens on Interface: System, the arrow keys move between them, choosing one starts it at the top, and the row stays put while the page scrolls. The Codex colour and Data colour rows sit on the Text colours sub-page (no other sub-page fitted them).
- **Samples are in a second column** beside each style's controls; the Settings dialog is wider (900 px) to make room.
- **Colour swatches are unnamed squares** (name for the screen reader and as a tooltip; the chosen one has an outline ring).
- **Sizes are sliders** over the style's range (pixels, or rem at 0.125 steps with Shift 0.25 for the Navigator's parts): a drag previews live, release saves once. A hand-edited out-of-range value still draws the default and is never rewritten.
- **Defaults:** selection blue; bold, italic and bold italic orange; highlight yellow; Interface font SN Pro. Stored values are unchanged ("text" and "plum" are still choices).

## 12. Look, third round (1.10.0)

- **Sub-pages** (lower case): *interface* (the Interface font; Body with Body bold under it; Small heading and its colour; Hint; Dialog heading, the style `heading` renamed), *library mode* (Title, Bar name, the data colour), *storytelling mode* (Series name, Novel title, Selected chapter, Codex list, the Codex colour), *writing* (the Writing font, Prose, Reading, Fields), *text colours* (the five).
- **One grid** per sub-page: name, font, weight, size (slider and value), preview, a column each, lined up; an absent control leaves its cell empty. In a narrow window (the page under 900 px) the previews drop below their row.
- **Body bold has only a weight**: its font, Softness and size are Body's; its stored `appearance-body-bold-font|size|soft` keys are never read.
- **Previews** are drawn in the style's real colour on its real background, in text of the kind the style is used for, with the open project's own series, novel and chapter names; the Codex list's preview uses fixed example names.
- **Small heading:** size 11 to 18 px; a colour setting `small-heading-colour` (text colour by default, replacing the muted grey; yellow, aqua, blue, orange, purple), applied to the pane titles, zone labels, overview sub-headings and summary titles. Contrast (WCAG) on bg_dim / bg1: text 7.83 / 5.75, yellow 7.25 / 5.33, aqua 6.25 / 4.59, blue 6.09 / 4.47, orange 5.74 / 4.22, purple 5.73 / 4.21 (the old grey2: 5.43 / 3.99).

## 13. Look, fourth round (1.10.0)

- **Accepted exceptions (Kenny, round three):** Small heading's blue (4.47:1), orange (4.22:1) and purple (4.21:1) on bg1 (the summary dialog) are under 4.5:1 for small text and are kept. All pass on bg_dim.
- **Four sub-pages** (the text colours moved into *writing*, as a group after the writing styles): interface, library mode, storytelling mode, writing.
- **A colour sits with its style:** Small heading's colour under Small heading, the Codex colour under Codex list, the data colour under Bar name; the row repeats no name. The size readout column and the "where it is saved" words are gone; the slider's value is its `aria-valuetext`.
- **The writing styles' labels** (lower case): Prose is *chapter*, Reading is *read-only context fields*, Fields is *context and library fields*. Their keys in `project.md` (`appearance-prose-*`, `-reading-*`, `-fields-*`) are unchanged.
- **The Codex list preview** shows the project's first four top-level Codex entries in the list's own order; the examples (Cast, Jane Harbour, Ælfric) only for an empty Codex.

## 14. Look, fifth round (1.10.0)

- **Fraunces' Softness is removed** (as Wonk was in 1.6.1, decision 103): no control, Fraunces is always drawn at `"SOFT" 0, "WONK" 0`, and a stored `appearance-*-soft` or `-wonk` key is never read or rewritten (decision 14). The `Soft` keys are gone from the settings schema.
- **library mode** (lower case), in order: *title*; *library header* (the zone labels: "Placed Chapters" and "Unplaced Chapters" on the novel tab, "Unplaced Novels" on the series tab, and the archive tab's headings, each archived novel's title and "Codex"; they no longer use Small heading; own font, weight, size 11 to 18 px and a colour of text colour or the five); *placed* and *unplaced* (the novel tab's two chapter lists: own font, weight, size and a colour with the Codex colour's choices, default green, used for the rows' text and their highlight); *data label* (the label before a colon: Default PoV, Novel Length, Chapter Length, Average, Median, and PoV and Location in the context panel; default the muted grey) and *data* (the value; default the text colour), sharing one preview, with the choices text colour, muted grey and the five; *data bar* (was Bar name: font only) with the *bar colour* (the data colour, `data-colour`) and the new *rail colour* (`rail-colour`: grey0 by default, grey1, grey2 or the five; the bar's own colour is disabled in the row and, if hand-edited, draws grey0). The data bar's preview is a complete bar: rail, partial bar and the chapter's name across both.
- **New keys** in `project.md`: `appearance-library-header-*`, `-placed-*`, `-unplaced-*`, `-data-label-*`, `-data-*` (font, weight, size) and `library-header-colour`, `placed-colour`, `unplaced-colour`, `data-label-colour`, `data-value-colour`, `rail-colour`. Written only on change; unknown or excluded values draw the default and are never rewritten; outside changes apply live.
- **Contrast on bg_dim** (WCAG): text 7.83, muted grey 5.43, yellow 7.25, aqua 6.25, blue 6.09, orange 5.74, purple 5.73.
- **Bar against rail**, with pairs under about 1.5:1 marked ⚠ (the bar's end is hard to see there): yellow bar: grey0 2.13, grey1 1.78, grey2 1.34 ⚠, aqua 1.16 ⚠, blue 1.19 ⚠, orange 1.26 ⚠, purple 1.27 ⚠. Aqua: grey0 1.84, grey1 1.53, grey2 1.15 ⚠, yellow 1.16 ⚠, blue 1.03 ⚠, orange 1.09 ⚠, purple 1.09 ⚠. Blue: grey0 1.79, grey1 1.49 ⚠, grey2 1.12 ⚠, yellow 1.19 ⚠, aqua 1.03 ⚠, orange 1.06 ⚠, purple 1.06 ⚠. Orange: grey0 1.69, grey1 1.41 ⚠, grey2 1.06 ⚠, yellow 1.26 ⚠, aqua 1.09 ⚠, blue 1.06 ⚠, purple 1.00 ⚠. Purple: grey0 1.68, grey1 1.41 ⚠, grey2 1.06 ⚠, yellow 1.27 ⚠, aqua 1.09 ⚠, blue 1.06 ⚠, orange 1.00 ⚠. Only grey0 clears 1.5 against every bar colour (grey1 against yellow and aqua); the five colours are all close to the bars' own colours.
- **The novel tab's left pane:** Unplaced is no longer on a working card (it sits on bg_dim; Placed keeps its card), amending Brief 14 §1.8. No chevrons; Placed can't be collapsed (a plain heading); Unplaced collapses and expands from its header, still a button with `aria-expanded`. The series tab's "Unplaced Novels" header is unchanged apart from its font and colour.
- **Every style's name is lower case** in Settings (body, body bold, small heading, hint, dialog heading, title, data bar, and the rest, the Navigator's parts too); the base fonts' rows are "interface font" and "writing font".

## 15. Look, fifth round, additions (1.10.0)

- **One General entry:** General, Story and This Mac are one entry, *General*, with sub-pages *general*, *story* and *this Mac* (lower case; it says those settings stay on this Mac), chosen by a row of buttons as Appearance's are. Settings opens on *general*; each sub-page starts at the top; redraws keep the position.
- **No dialog has a visible title:** `openDialog` draws none; the dialog's accessible name is its `aria-label` (Settings, Word count history, New project, Rename note, the Codex picker, Changes found when opening). The *dialog heading* style and its row are gone; stored `appearance-heading-*` keys are left on disk and never read. Dialogs whose purpose may not be clear without a title: none found. Each opens from a clear action and has its own content (the settings' sections, the history's charts, the rename's field and plan, the picker's search box, the summary's lists); I added no text.
- **Appearance rows:** one row per style, three columns all aligned to the top (name, options, preview). The options are stacked: the font and weight on one line, the size slider, the colour swatches (the data bar's two swatch rows carry a small "bar" or "rail" tag). In a narrow window (the page under 760 px) the preview drops below.
- **The data bar's rail** has the bar's own corner radius (4 px) in the app and the preview, replacing Brief 15's concentric corners (the rail's radius was the bar's plus 4 px).
- **No focus ring** on the novel tab's synopsis, the plot note and the read-only chapter text (the caret marks focus in the editable ones); amends decision 106 for these fields only. The series description keeps its ring.
- **Settings ▸ Backups** has the Navigate menu's Back Up icon (Kenny's shield, decision 112) before its text, coloured as its row, in the surface colour when selected. The other entries get icons next round.

## 16. Look, fifth round, more additions (1.10.0)

- **Writing has sub-pages** (lower case): *typing behaviours* (the Mac-autocorrection note, curly quotes, dashes and ellipses, words that begin with an apostrophe), *names* (name autocorrect, names without a Codex note, names that are also ordinary words), *shortcodes* (the two shortcode switches and the list) and *special characters* (the button and the palette list).
- **General's third sub-page is *this computer*** (was "this Mac").
- **No headers inside Settings' pages.** Removed: "Interface" (general), "Story" and "Numbering" (story), "This Mac, this project" (this computer), "Text colours" (Appearance ▸ writing), "Typing" (Writing), "Sessions" and "Display" (Sessions), "Backups" (Backups). The sections keep their names for the screen reader (`aria-label`); the sub-page buttons name the pages.
- **Panel widths per view** (see `docs/widths.md`): three sets on *this computer*, *storytelling panel widths*, *series panel widths* and *novel panel widths*, each the left panel's and the context panel's widths only, never the central workspace. A divider drag sets the set of the view you are in; flipping sides or switching tabs applies that view's. They start from today's stored widths and are machine settings (`storytellingWidths`, `seriesWidths`, `novelWidths`, each `{ left, lore }` in `widthUnit`). The older keys (`leftWidth`, `libraryWidth`, `loreWidth`) are kept as they are. The unit and the same-width switch stay one each, for all three sets; Fix 5's limits and refusals apply to each set.
- **The Codex and Archive tabs** keep what they did: one shared pair, `libraryWidth` (the left panel) and `loreWidth` (the context panel), that a drag on either tab sets and either tab draws; the series and novel sets don't move it and it doesn't move them. Kenny will rule on whether they share a set or get their own.
- **Icons** for General, Appearance, Writing and Sessions: to come from Kenny; those entries have none until then.

## 17. Panel widths, regrouped (1.10.0)

On General ▸ this computer each view is a group: its own icon (Kenny's Storytelling, Series or Novel icon, 32 px) and a plain word (`storytelling`, `series`, `novel`: ordinary text, not a header or a button), then two columns marked by Tabler's `layout-sidebar` and `layout-sidebar-right` icons (the left panel's and the right panel's widths, no text). Each field keeps a full name for the screen reader and as its tooltip ("storytelling, left panel width"). **"Keep the panels the same width" is the storytelling group's alone** and applies to the storytelling widths only (stored as before, `widthsLinked`); series and novel (and the Codex and Archive pair) are always two figures. When it is on, the storytelling group shows one figure marked by both icons ("storytelling, left and right panel width").

## 18. Widths table, the banner and the archive (1.10.0)

- **One table** on General ▸ this computer: region | left | right | width options, headed once by the left and right sidebar icons (named "left panel width" and "right panel width" for the screen reader, no text). Five rows, each an icon and a plain word: storytelling, series, novel, codex, archive, each with its own side-panel widths (`storytellingWidths`, `seriesWidths`, `novelWidths`, `codexWidths`, `archiveWidths`). Codex and Archive start from `libraryWidth` and `loreWidth`, which, like `leftWidth`, are left as they were. "Keep panels the same width" is in the storytelling row's options cell; the other rows leave it empty. Each field is named in full and has a tooltip ("codex, right panel width").
- **The banner above a read-only editor is a notice of its kind** (decision 122): a tinted fill, a 3 px edge and the kind's icon. "Archived. Unarchive it to edit.", "This project was made by a newer storyForge…" and "Read-only: …" are warnings (bg_yellow); "Downloading from iCloud…" is information (bg_blue). Contrast: warning text (fg) on bg_yellow 4.51:1, its icon 4.18:1; information text on bg_blue 4.45:1, its icon 3.46:1 (the icons are shapes, over the 3:1 a shape needs; the information text is a hair under 4.5:1 at 12 px, as the information notice's is).
- **The Archive list:** the selected item (the one open in the workspace) is a block in the Codex colour with the panel's colour on it, as a Codex row is; the list is on bg_dim, with no card. Unarchive is Tabler's `sunrise`.

## 19. Round five, the library's small changes (1.10.0)

- **Library tab order, left to right:** archive, codex, series, novel (the storytelling flip after them); the arrow keys follow it (replacing decision 106's order).
- **Unarchive is a hover icon:** muted at rest; on hover a rounded square as tall as the row's highlight, in the Codex colour, with the icon in the panel's colour; still a named button ("Unarchive …"). Kenny's new icon is yet to come (the current one is Tabler's sunrise).
- **The novel tab's synopsis** has the read-only chapter text's inner padding, 16 px 16 px 24 px, fixed in px.
- **A try-out, the storytelling editor in a box:** a bg0 card on bg_dim, its corners 10 px (the library Codex page's panel), left and right as before (it meets the left and context panels), its top and bottom margins equal to the gap between the Codex card and the editor (`--sf-card-gap`, set by the shell: the card's right margin, 10% of the left panel, 12 px at least; 29 px at the default width). It starts 29 px below the title band's foot (the traffic lights stay in the band) and ends 29 px above the window's foot, with bg_dim showing round it. The editor's text therefore starts 29 px lower than the Codex card's first line (the shared top line, 20 px below the band); if it stays, the gap and the top line should be reconciled. Kenny decides.
- **Unplaced novels** (the series tab) have no chevron and fold from their header; the add icons beside Unplaced (chapters and novels) are the storytelling side's rounded-square plus, muted at rest, the library header's colour on hover, still named ("New chapter", "New novel").
- **No cover:** the icon is half the cover box's width, centred, cut out in the colour of what the box sits on, on a grey1 box (`--purpose-cover-empty`), named "No cover". Contrast of the icon against the box: the series and novel cover boxes (on bg_dim) 4.08:1; the start cards (on bg0) 3.46:1; the context panel has no cover yet (it would be on bg_dim, 4.08:1, with the series redesign). Shapes need 3:1.
- **Survey:** `docs/series-2.md`.
