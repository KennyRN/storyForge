# Brief 15 – the data bars

Branch `data-bars`, cut from `main` at `v1.7.0` (tagged, on `main`). The colour-cycle try-out branch `try-colour-bars` was deleted, not merged (its one commit, 63579ae, is in the reflog). storyForge was not running.

## H1 survey (read only; nothing in `src/` has been changed)

### 1. Every use of the data-fill purpose

`--purpose-data-fill` (= `--ef-blue`) is used in `overviews.css` by:

| Use | Where | Takes the chosen colour? |
|---|---|---|
| Chapter bar fill, sliver, dots, marker, name stroke | `.sf-bar-fill`, `.sf-bar--sliver::before`, `.sf-bar-dots`, `.sf-bar-marker`, `.sf-bar-name-text` | Yes (§1.3) |
| Series overview bars (`plainBar`) | `.sf-bar-fill` at 12 px | Yes (§1.3) |
| Novel progress bar segments | `.sf-progress-seg` | Yes (§1.3) |
| **History heatmaps** | `--purpose-heat-a…d` in `purposes.css` use `--ef-blue` directly (mixed with `bg2`), not data-fill | **For Kenny to rule.** I'd say no: heat steps are a separate purpose and show a different kind of figure. |
| Stats panel | uses `--purpose-stats` (grey1), not data-fill | No data colour involved |
| Other | `--purpose-data-overrun` (orange) is defined but, after Brief 14, nothing draws with it; `--purpose-bar-notch` is used for the progress bar's dividers | Both stay; I'd retire `data-overrun` at commit 1 if you agree (it's the last trace of the orange overrun). **Ruling needed.** |

`--purpose-text-on-data` (bg_dim) is used only for the chapter name.

### 2. How the key joins the settings

It follows `codex-colour` exactly: `app/settings.ts` has `CODEX_COLOURS`, the `ProjectSettings.codexColour` field, its default, and a `FIELDS` row (`{ file: "codex-colour", plugin: "-", valid }`). The new one is `data-colour` / `dataColour`, valid = one of `yellow aqua blue orange purple`, default `blue`; `red`, `green`, other strings and non-strings read as blue, source `default`, and are never rewritten (the same path the codex-colour tests already pin).
- **Appearance page:** `screens/settings.ts` already has the swatch row (`.sf-swatch`, radio buttons) for the Codex colour; I'll reuse it as a second `section("Data colour", …)`. Decision 110's rules apply (accent fill on the chosen swatch, muted rows).
- **Writer:** `setSetting(…, "dataColour", v)`, compare-then-write inside `modifyFrontmatter`, so Fix 6's "elsewhere" notice comes for free.
- **Outside changes:** `refreshSettings` already loops over every `FIELDS` key, so an outside edit lands in `running.settings` and fires the `settings` topic. `app.ts` applies the colour from that subscription (as `applyCodexColour` does); I'd set `data-data-colour` on the root and have `purposes.css` map each role to `--purpose-data-fill`. No bar redraw is needed for a colour change.
- **Older versions:** `project.md` is parsed with the minimal-diff frontmatter editor, which keeps unknown keys through every rewrite, and 1.7.0 and earlier read only the keys in their own `FIELDS`. I have **not** run 1.7.0 against a file with the key. I'll add a test that sets the key, makes an unrelated settings write and checks the key survives byte for byte.

### 3. The scaling code

- `bars.ts` `computeDataBarState(words, target, scale)` gives every chapter bar the same `full = max(scale, words, target)`, where `scale = max(plannedChapter, longest chapter)` (`novelOverview.ts:93`). That is why the bars currently share one scale and overrun is dots between target and word count. It returns `fillPercent`, `targetPercent`, `overPercent`.
- Decision 28's rounding (`roundToSignificantFigures` against `significantFigures(target)`) decides "at target"; I keep it unchanged.
- **§1.2 fits as a new pure function** beside it (e.g. `frameWidthPercent(pcts)` = `100 / max(100, longest words/target × 100) × 100`), computed once in `novelOverview.ts` from all placed chapters and passed to every `dataBar` as one value (a CSS custom property on the cards' list, so a resize needs no JS). The bar's own width is then `words / target × frame inner width`. With no chapter length there's no target, so the existing `scale` path stays and no frame is drawn. Redraws already happen through `debounced(refresh)` on library, stats, project, archive and nav, which covers word count and chapter length changes. **Width changes are CSS-only** if I express the frame as a percentage of the row.
- One thing the brief doesn't say, for you to rule on: when **no chapter has a length** the bars scale to the longest chapter (as now); when a length is set but a chapter is empty it is the 3 px sliver inside the frame. I'll do exactly that.

### 4. What's removed, and what depends on it

Removed in commit 1: `marker()` and the `SVG` constant, the dots element, the clearance layer and the `snap()` rounding in `bars.ts`; in `overviews.css`, `.sf-bar-dots` (with its two masks), `.sf-bar-name--clear`, `.sf-bar-marker`, and the name's text stroke, padding and margin.
- The `over` / `under` states of `DataBarState` stay (labels and the "over its plan" aria text use them); only `targetPercent` and `overPercent` change meaning.
- **Tests that go or are rewritten:** `test/ui/novelBars.ui.ts` is almost entirely about dots, the stroke and the clearance (its stroke, clearance, dot-lattice and dot-corner tests are deleted, the rest rewritten for the frame); in `test/ui/overviews.ui.ts` the test at line 201 (dots and marker) is rewritten; `src/ui/__tests__/bars.test.ts` loses its marker checks (lines 14 and 25 mention the marker).
- Nothing outside the bars depends on them. The progress bar's ghost dividers and structure strip are separate and untouched. `docs/numbers.md`, `docs/novel-2.md` and `docs/interface.md` describe the old look and will get an "as built" note rather than being rewritten.
- The new `docs/data-bars-mockups/` folder (this survey's throwaway generator and pictures) should be deleted before the merge.

### 5. Mock-up

`docs/data-bars-mockups/mockups.png` (source `mockups.html`, built by `build.mjs`): a static page using the real Everforest dark-soft values and §1's geometry (34 px bar, 4 px frame, 8 px radius, 19 px / 700 name), in blue and yellow, 600 px row. It is **not** the real app's bars: it's drawn by hand to judge the shape. Cases: A no overrun; B 80 / 100 / 210%; C 80 / 100 / 115%.

What the pictures show that you may want to rule on:
- **The frame's end is only half visible on an overrun bar.** Where the bar runs on past the frame, the frame's 4 px rim above and below stays visible and its rounded end disappears under the bar. In B and C the frame still reads as a shape, but the row with the overrun has no visible end line. The other rows' frame ends line up and carry the edge. Your design says this is intended; flagging it because it is the one place where "the frame's end is the target" is less obvious.
- **A bar exactly at target** meets the inner edge with no gap, as designed.

### 6. The extreme case (needs your ruling)

D is a 300% chapter. Every frame shrinks to a third of the row (200 px of 600), and the short chapters' names are cut at the frame's inner end or the bar's end, whichever is further. In the mock-up "Chapter One" and "Gate" still fit, but a name like "The Gate: Part One" would not. E is the same rows with a **minimum frame width of 300 px**: frames stop shrinking, and a longer bar is stopped at the row's end instead of reaching its true length (so a 300% bar would be drawn as about 200%, and the picture no longer tells the truth beyond that).

The choice: (a) no minimum, as the brief reads, honest but cramped at 300% or more; (b) a minimum frame (say 40% of the row), clamped bars. I'd go for (b) only if you want legible names over accurate extremes; I lean to (a) with the name cut short, because it is the only one where bar length stays true. Your call.

## Stopped here for Kenny's rulings

1. Heatmaps: should they keep fixed blue? (Default: yes, unchanged.)
2. Retire `--purpose-data-overrun`, which nothing draws any more? (Default: yes.)
3. Extreme overruns: no minimum frame (a) or a minimum (b), and what percentage?

After your answers I'll start commit 1 (the frame and the solid bar).
