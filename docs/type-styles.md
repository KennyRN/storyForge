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
