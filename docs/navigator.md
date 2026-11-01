# The navigator (Brief 13): survey and proposals

Hold point H1. Nothing is implemented. Branch `navigator`, from `main` at `v1.5.0` plus `57776d5` (decision 78's script fix). The built app on disk is 1.5.0 from `main`; no storyForge was running; nothing was built.

## 0. Before H1

- **Decision 78's script fix is in (`57776d5`), but its proof is outstanding.** The "quit unexpectedly" reports are `SIGABRT` raised by the app itself (the newest report: `abort()` from a storyforge thread, ~29 s after launch, at the end of a `look-smoke` run), not by the script's `SIGKILL`. `look-smoke`, `typing-smoke` and `cover-smoke` piped the app's stderr to a reader that goes away first; `widths-smoke` already used `stdio: "ignore"` for that reason. They now do too (and no longer print stderr on failure; `quit-smoke` still pipes it because it reads it). **Proved** on the built 1.5.0 app (from `main`, no other storyForge running, through the typing guard): `test:look` and `test:typing` each passed, and the report count stayed at 7 before and after each run (the seven are all older: the last five are from 10:22–10:26 on 1 November). `test:cover` has the same change and wasn't run. (The first attempt was refused, the screen being locked.) Seven reports exist today (the last five from 10:22–10:26). Needs one unlocked `test:look` and `test:typing` run, with a report count before and after.
- **No `.DS_Store`, copies or changes** were made in Kenny's `Fonts` folder; nothing has been copied into the repository yet (that is commit 2).

## 1. The fonts

All six licences are the SIL OFL 1.1 and were supplied (Aleo, Atkinson, Courier Prime, Fraunces `OFL.txt`; Inter `LICENSE.txt`; SN Pro already shipped). Read with fontTools; coverage is against each font's own character map.

| Family | Files supplied | Size | Axes (min / default / max) | Real italic |
|---|---|---|---|---|
| Aleo | 2 × `.ttf` | 147 + 153 KB | wght 100 / 400 / 900 | yes (own file) |
| Atkinson Hyperlegible Next | 2 × `.ttf` | 114 + 123 KB | wght 200 / 400 / 800 | yes |
| Courier Prime | 4 × `.ttf`, static | 68 + 70 + 77 + 77 KB | none: Regular, Bold, Italic, Bold Italic | yes |
| Fraunces | `.woff2` and `.ttf`, each upright and italic | woff2 195 + 236 KB (ttf 384 + 438 KB) | opsz 9 / 9 / 144, SOFT 0 / 0 / 100, wght 100 / **900** / 900, WONK 0 / 1 / 1 | yes |
| Inter | 2 × `.ttf` | 880 + 910 KB | opsz 14 / 14 / 32, wght 100 / 400 / 900 | yes |
| SN Pro | in the app | (unchanged) | wght 200–900 | yes |

- **Added size:** about **3.0 MB** if Fraunces ships as `.woff2` and the rest as supplied (Aleo 0.30, Atkinson 0.24, Courier Prime 0.29, Fraunces 0.43, Inter 1.79). Inter is 59% of it; it's the only one that would shrink much as `.woff2`. Converting is "changing" a font under §1.5, so I won't unless Kenny says so. Fraunces: I propose the supplied `.woff2` (decision 79: ".ttf as supplied where there's no .woff2") and not shipping its `.ttf`.
- **Two things to know about the axes.**
  - Fraunces' file defaults to **wght 900** (its name table says "Fraunces Black"), and its Wonk default is 1. The `@font-face` must declare `font-weight: 100 900` and every use must set weight and `WONK` explicitly, or it draws Black. Its **opsz starts at 9 and follows the text size** with `font-optical-sizing: auto`; Inter's opsz range is 14–32, also automatic. Neither has a control.
  - Wonk is a 0/1 switch, Softness 0–100; I propose a switch and a 0–100 step-of-25 slider/number.
- **Weights offered** (the font's own range, 100 steps; Atkinson 200–800): Aleo 100–900, Atkinson 200–800, Fraunces 100–900, Inter 100–900, SN Pro 200–900, Courier Prime 400 and 700 only.
- **Coverage** (special set `æ Æ œ Œ ð Ð þ Þ ƿ Ƿ ȝ Ȝ`, the aids' output `‘ ’ “ ” – — …`, Latin-1, Latin Extended-A and -B, and every non-ASCII character in the fixtures):
  - All six have every aid character, `æ Æ œ Œ ð Ð þ Þ` and the fixtures' `— ö é Å`.
  - **Missing `ƿ Ƿ ȝ Ȝ` (and `ǣ ǭ ſ`):** Aleo, Atkinson, Courier Prime, Fraunces (and SN Pro, decision 56). **Inter has them all.** These go to Arial, as ruled; Arial has them with real italic and bold (decision 57).
  - Atkinson is the thinnest: 35 of Latin Extended-A and 202 of 208 Extended-B letters missing, and `µ`. Courier Prime and Aleo lack most of Extended-B; Fraunces lacks 144 of it. Those characters go to Arial too, in a different design, which matters for names with unusual letters. The fixtures' Japanese (`日本語`, `の`, `章`) is in none of them nor Arial: the system font draws it, as today.
  - The special-characters button's starting set is unaffected.
- **Ligatures and alternates (GSUB), and how they're switched off.** Aleo `liga`; Courier Prime `liga` (italics); Fraunces `liga`, `ss01`, `rvrn`; Inter `calt`, `dlig`, `ss01–08`, `cv01–14`, `salt`, `zero`; Atkinson none of consequence. One rule on every use, as for SN Pro: `font-variant-ligatures: none` plus `font-feature-settings: "liga" 0, "calt" 0, "dlig" 0, "ss01" 0` (the ss/cv sets are off by default). Inter's `calt` is the one that matters (it changes arrows, colons and some letter pairs by context). `font-synthesis: none` throughout. `rvrn` (Fraunces) is required variable-font substitution and stays.
- **To prove in commit 2:** weight, Softness and Wonk really change the drawing (measured widths), and each family is the one drawn.

## 2. The navigator as it is

Screenshots: `docs/navigator-shots/current-closed.png`, `current-open.png`, `current-library.png`, `current-settings.png` (WebKit, the preview, the `series` fixture).

- **The left panel on both sides has one header,** built in `shell.ts`: the **project's folder name** (small, `grey2`; **green on the storytelling side only**: that is the "project name in green") and one **Flip side** button. Below it the face's body.
- **There is no project selector.** The header's name is a plain `span`; no control switches project (File → Open Recent is the only route). So decision 80's "the library side keeps the project name, its project selector and Flip Side" describes a selector that doesn't exist. **Kenny to rule:** keep the library side exactly as it is (name and Flip Side), which I'd do.
- **Because the header is shared, removing it from the storytelling side means drawing it per face.** On the storytelling side the green project name goes too (it is part of that header); decision 80 says "project selector and Flip Side" only. **Kenny to rule:** project name removed with the header (my reading: the series and novel names replace it as the green titles), or kept above the series name.
- **Order today:** the novel's title (green, bold, numbered: "Book 1: The Harbour Wakes"), the **current chapter** button (full-width raised bar, chevron), the list when expanded (inline, pushing the Codex down, max 5 rows, `role="list"`), **Add the next chapter** (a quiet button below, always visible), then the Codex list, then the stats.
- **The list holds placed and unplaced chapters** (`[...ordered, ...unplaced]`; the screenshot shows "Unplaced idea // with a subtitle" after the placed ones). It is not archived chapters. Titles use `#` numbering and padding.
- **"Add the next chapter"** calls `model.addNextChapter` → `createContinuingChapter(project, book, currentChapter)`. **It places the new chapter immediately after the open chapter, not at the end** (end only if there's no open chapter or it isn't in `chapter-order`). Decision 80 and the brief say "appends at the end of the reading order … as it does today". They differ. **Kenny to rule:** keep today's behaviour (after the open chapter; File → New Chapter shares it) or change to true append. With a dropdown whose last item is "add the next chapter", "after the one you're on" will surprise when you're mid-book. I'd keep it, and label the item "Add the next chapter".
- **Read-only:** add is disabled with "This project is open read-only." No novel: "Open a chapter to get started." (no list, no add). A novel with no chapters: the selector reads "No chapter yet", the list is empty, add is enabled.
- **An open chapter that isn't in the list:** the open unplaced chapter shows by name in the selector (it is in the list today as it includes unplaced). Archived chapters can open (read-only editor) and appear in the selector, with no list entry.
- **"A novel with no series."** The core can't say: `series.md` missing gives `seriesTitle: "Series"` as a fallback, and the only existing notion of a standalone book is the setting **"Hide the series pane (for one standalone book)"**. **Proposal:** show no series line when `hideSeriesPane` is on, or when `series.md` has no `series-title`. **Kenny to rule.** When the series tab is hidden, the series name can't lead anywhere, so this also keeps the two consistent.
- **Open item for the click targets:** the library side's tab rail is `series | novel | codex | archive` (`TABS`); "flip to the series tab" is `model.nav.forgeTab = "series"`, `centreView = "overview"`, then `flipFace()`. No new model API beyond a small `openLibraryTab(tab)`.

## 3. "Highlight the active chapter" (Brief 5)

A boolean setting (`highlight-active-chapter`, default on, in Settings → Interface). It colours the open chapter in the accent in **three** places: the navigator's list (storytelling), the novel tab's list and the series tab's selected row (library). Decision 80 item 8 (the selected chapter is green) makes it always true on the storytelling side. **Proposal:** the storytelling navigator ignores the setting (always green); it keeps working on the library side, and stays in Interface. The alternative, removing it everywhere, needs a ruling and a core-settings change that I'd avoid in this brief. **Kenny rules.**

## 4. The settings dialog

Today: one scrolling modal with groups **Numbering, Backups, Sessions, Display, Typing, Interface, This Mac this project** (`screens/settings.ts`, `typingSettings.ts`, `widthsSettings.ts`), all labelled; Codex colour is in Interface. Proposal, a list down the dialog's left side, one page at a time (keyboard: a vertical tab list, ↑↓, as the library rail):

```
┌ Settings ─────────────────────────────────────┐
│ General        │  Appearance                   │
│ Appearance  ◄  │  Codex list                   │
│ Writing        │   Font [Fraunces ▾]           │
│ Sessions       │   Weight [400 ▾]  Size [1 rem (16 px)] │
│ Backups        │   Softness [0]  Wonk [off]    │
│ This Mac       │   Sample: Cast · Harbour      │
│                │  Codex colour  ● ● ● …        │
│                │  Novel title … Series name …  │
│                │  Selected chapter …           │
└────────────────┴───────────────────────────────┘
```

- **General:** Numbering, Interface (opens in, highlight, hide series pane). **Appearance (new):** the four parts and the Codex colour. **Writing:** Typing (the aids, shortcodes, special characters, name list). **Sessions:** Sessions and Display. **Backups.** **This Mac:** panel widths, labelled as before.
- Mock-up above is ASCII; a WebKit render of the real page comes with commit 4, since it needs the page built.

## 5. The Appearance keys (`project.md`)

Proposed, in the style of `codex-colour`:

```
appearance-codex-font: Fraunces        appearance-codex-weight: 400   appearance-codex-size: 1
appearance-novel-font: …               appearance-novel-weight: …     appearance-novel-size: …
appearance-series-font: …  (-weight, -size)       appearance-chapter-font: … (-weight, -size)
appearance-fraunces-softness-codex: 0 … (one softness and one wonk per part, kept when another font is chosen)
```

Softness and Wonk are per part (`appearance-<part>-soft`, `appearance-<part>-wonk`). Size is stored in rem as a number. **Reading:** an unknown font name, a weight the font doesn't have, a size outside its range, a non-number, or Softness/Wonk on another font all fall back to the part's default for that value and **are never rewritten**; a weight between steps takes the nearest the font has. Nothing is written until the author changes a value, and only the changed keys. Fonts are stored by family name (`Aleo`, `Atkinson Hyperlegible Next`, `Courier Prime`, `Fraunces`, `Inter`, `SN Pro`). `codex-colour` keeps its key.

## 6. Size ranges (rem, base 16 px)

Codex list **0.75–1.75 rem** (12–28 px), step 0.0625 (1 px); novel title **0.75–2 rem**; series name **0.75–2 rem**; selected chapter **0.75–1.75 rem**. Typed figures accept two decimals; the arrow keys step 1 px, Shift 4 px. Current looks, for the defaults until H2: Codex list 1 rem (16 px), novel title 1 rem (bold 600), selected chapter 1 rem (the closed bar is 16 px today), series name has no current look so it starts as the novel title's.

## 7. The dropdown

- **Covers, doesn't push:** the navigator becomes a positioned block of fixed height (series, novel, selector); the list is `position: absolute` from just beneath the selector, full width of the left panel, on `bg1`, over the Codex list (z-index below dialogs and the shortcode popup). The Codex list is `inert` while it's open, so it can't be clicked or tabbed into; a click outside (a transparent catcher over the rest of the window) only closes it.
- **Maximum height:** the room below the selector to the bottom of the stats row, at most about 60% of the window's height; longer lists scroll inside with the app's own indicator.
- **Keyboard:** the selector is a button (`aria-haspopup="listbox"`, `aria-expanded`); open it with Return, Space or ↓; the list is a `listbox` of `option`s (the open chapter `aria-selected`), ↑↓/Home/End move, typing a letter jumps, Return chooses and closes, Escape closes and returns focus to the selector; "Add the next chapter" is the last option (disabled with the reason in a read-only project). Tab closes it and moves on. Reduced motion: no animation (there's none otherwise either).
- **The unplaced or archived open chapter:** the closed selector shows its name in `grey2` with "unplaced" or "archived" beside it; no option is green. **Open question:** unplaced chapters are no longer listed, so the only route to one is the library side; that is decision 80 item 9 as written.

## 8. Mock-ups

```
 with a series             standalone novel          unplaced open chapter
 The Harbour Chronicles    Book 1: The Harbour…      The Harbour Chronicles
 Book 1: The Harbour…      [ Chapter 1          ▾ ]  Book 1: The Harbour…
 [ Chapter 1          ▾ ]  Cast                     [ Unplaced idea · unplaced ▾ ]
 ┌ Chapter 1 (green)  ┐                              Cast
 │ The Storm: Part Two│  (open: the list covers Cast, Harbour… beneath it)
 │ Chapter 2          │
 │ + Add the next chapter │
 └────────────────────┘
```

Real WebKit renders of the new navigator come with commit 3. Today's are in `docs/navigator-shots/`.

## 9. Questions for Kenny

1. Is the script fix proved? Needs an unlocked Mac for one `test:look` and `test:typing` (§0).
2. The header: remove the project name from the storytelling side with the selector and Flip Side? Library side unchanged (there's no project selector to keep)?
3. "Add the next chapter": keep after-the-open-chapter, or true append?
4. What counts as "no series": `hideSeriesPane` or a missing `series-title`?
5. "Highlight the active chapter": storytelling ignores it (always green); library keeps it?
6. Fraunces as supplied `.woff2`; Inter as `.ttf` (1.8 MB), or may it be converted?
7. The settings sections, key names and size ranges in §4–6.

## 10. Ruling on the series-or-standalone setting (decision 81, item 3) and proposed key

Kenny's ruling: the setting lives in `project.md` (not `series.md`, which is in the frozen 0.17 layout), as one key written only when it changes, with no `format-version` change. Missing or unknown means series and is never rewritten, so existing projects don't change. It's changed in settings, in a section for the story's own settings; creating a standalone novel sets it through the same settings route, with no core change. For now it affects only the storytelling side's series line; the library side is untouched. (This replaces the §2 proposal of `hideSeriesPane` or a missing `series-title`, and §9 question 4.)

- **Proposed key: `story-kind`**, values `series` (the default) and `standalone`. In `src/app/settings.ts` as `storyKind`, with `valid: v === "series" || v === "standalone"`; any other value reads as `series`.
- **Where in settings:** a **Story** section in the §4 list, above Appearance (a short page holding this one choice, a two-option radio, "A series" / "One standalone novel"); the existing "Hide the series pane" check, which is about the library side, stays in General.
- **Creating a standalone novel:** the new-project screen's route writes `story-kind: standalone` through `settings.set` after the project is created, the same call the settings dialog makes.

## 11. Rulings (decisions 81 to 83)

**H1 (decision 81).**
1. The project name leaves the storytelling side with Flip Side; the storytelling side has no header. The library side stays exactly as it is.
2. "Add the next chapter" is a true append (the end of the novel, not after the open chapter); inserting mid-novel stays possible on the library side by dragging. (File → New Chapter shares the function, so it appends too.)
3. The storytelling navigator always shows the selected chapter in green, whatever "Highlight the active chapter" says; that setting keeps working on the library side's novel and series tabs.
4. Inter ships as the supplied `.ttf`, Fraunces as the supplied `.woff2`. No conversion.
5. Fraunces: every use sets its weight and Wonk explicitly; chosen for a part, it starts with Wonk off and Softness 0 and keeps the weight carried over from the previous font.
6. Coverage accepted: wynn and yogh fall back to Arial in Aleo, Atkinson Hyperlegible Next, Courier Prime and Fraunces.
7. Series or standalone: key `story-kind` (`series` or `standalone`) in `project.md`, in a new **Story** section of settings; missing or unknown is `series` and is never rewritten.

**Commit 2 (decision 82).** Accepted; shortening Fraunces' file names is fine; the built-app proof that each family is drawn moves to commit 4.

**§4–6 (decision 83).**
- **Settings sections:** General (Interface); Story (series or standalone, plus Numbering, which moves here); Appearance (new); Writing (the typing aids); Sessions (Sessions and Display); Backups; This Mac. One page at a time.
- **Keys** as proposed in §5: `appearance-<part>-font`, `-weight`, `-size` for `codex`, `novel`, `series` and `chapter`, plus `-soft` and `-wonk` (Fraunces). Sizes stored in rem. An unknown or out-of-range value falls back to the default and is never rewritten.
- **Size ranges:** Codex list and selected chapter 0.75–1.75 rem; novel title and series name 0.75–2 rem. **Step 0.125 rem (2 px), 0.25 rem (4 px) with Shift.** A figure typed within range is rounded to the nearest step and the field shows the rounded figure at once; out of range is refused with the range shown.
- Commit 4 ends at **H2:** nothing is set as a default until Kenny chooses in the built app.

## 12. Commit 3 as built

- **Header:** drawn per side in `shell.ts`: the library side only. The storytelling side's green project name goes with it (its CSS rule too).
- **Navigator** (`faces/navigator.ts`): series line (when `storyKind` is `series`; the series title, or "Series" if `series.md` has none), the novel line, then the selector. Both names are buttons ("Open the series / novel on the library side") that call `model.openLibraryTab`, which sets the tab, shows its overview and flips; the editor stays mounted. `story-kind` is read in `app/settings.ts` (no UI for it until commit 4; the new-project screen's series-or-standalone question will set it then).
- **Dropdown:** the list is absolutely positioned under the selector over the Codex list, the panel's full width, on `--purpose-raised-bg` (`bg1`), no border, `max-height: 60vh`. While open, the Codex and stats sections are `inert` and a capturing `pointerdown` outside closes it (the click goes nowhere). Escape closes and refocuses the selector; ↑ ↓ Home End move; the selected chapter has `aria-current`. It stays a list of buttons (not `listbox`/`option`), so existing names and tests hold.
- **Unplaced or archived open chapter:** the selector shows it muted with a quiet "unplaced" or "archived".
- **Looks are unchanged** until commit 4 (the titles still use the old font, weight and size; the series name is the novel title's style at weight 500).
- **Tests:** `test/ui/navigator.ui.ts` (10); the others changed only where the Flip side button no longer exists on the storytelling side (a `flipFace` helper uses the View ▸ Flip Side menu route) and where "add the next chapter" now appends. The built-app scripts reach the library side through the novel name button.
- Screenshots: `docs/navigator-shots/new-*.png` (WebKit preview).
