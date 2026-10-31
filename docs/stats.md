# Brief 12 – the stats panel: survey (H1)

Branch `stats`, from `main` at `a85b868` (storyForge 1.3.0, tag `v1.3.0`). Kenny's copy is not running. Nothing is built yet; this is the survey the brief asks for, for Kenny to review.

## 1. The section as it is

`src/ui/faces/stats.ts` (`mountStats`), styled in `faces.css` (`.sf-stats`), mounted at the foot of the storytelling panel (`faces/storytelling.ts`).

- **One row:** a 16 px **layers** icon (`role=button`; opens the history view on click, Return or Space), then text like `daily: 0`, then a 16 px **switch** button (arrows) that cycles **daily, weekly, chapter, novel**. There is no session count in the cycle.
- **The row is `--purpose-text-muted` (`grey2`)**, wrapping (`flex-wrap`).
- **The live readout** (setting `show-session-readout`, off by default) is a second line, `session 0:02, 3 words`, in 12 px. It is **hidden between sessions** and appears at a session's first edit (`live()` is null otherwise), redrawn once a second. It disappears when the session ends (idle limit).
- **Which count is shown is not remembered:** `mode` is a local variable, so it restarts on daily at every open.
- The chart icon's accessible name reads out all four figures; its tooltip is the same text.

Screenshots (WebKit preview, fixture project, readout on):
- Whole window, in a session: `docs/stats-shots/now-full.png`
- The section between sessions: `docs/stats-shots/now-between-sessions.png`
- The section during a session: `docs/stats-shots/now-during-session.png`

## 2. Where each figure comes from (all unchanged by this brief)

All in `refresh()` in `stats.ts`, which re-runs on `stats`, `nav`, `library`, `project` and `sessions` changes.

| Count | Source |
|---|---|
| **day** | `getBookWordStats(project, book).todayNet`, minus that day's unreliable and editing sessions: `storytellingTodayAndWeek(...)` using `excludedByDay(...)` (`core/sessionFigures.ts`). |
| **week** | `.weekNet` through the same function. |
| **session** | **Not shown today.** The figure exists: `model.running.sessions.live().net` (the tracker's `net()`), used by the readout. |
| **chapter** | `project.wordCount(libraryChapterPath(book, chapter))`, for the open chapter. |
| **novel** | `getBookWordStats(...).current`. |

No figure, maths module or session rule needs to change. Two things to note:
- "Session" will be the only count that is not computed in `refresh()`; it comes from the recorder, and changes at every edit and at session end, so it is read on the same one-second tick as the readout (plus the `sessions` subscription), not on `refresh()`.
- **A real difference from today's wording:** the words say "daily" and "weekly"; the brief says day and week. I'd use "today", "this week", "this session", "this chapter", "this novel" in the accessible names (British English, the plugin's lexicon). Kenny to confirm.

## 3. A minute without typing, and the session's length so far

The tracker (`core/sessions.ts`, `SessionTracker`) already exposes `running`, `start` (first edit), `lastEdit` (last edit) and `idleExpired(now)`, and the recorder's `live()` returns `{ startMs, net }`.

- **Needed, and not currently exposed: `lastEditMs`.** `SessionRecorder.live()` is the only caller-facing route (`src/app/sessionRecorder.ts:82`), and it leaves `lastEdit` out. The smallest change is one more field on that return value: `{ startMs, lastEditMs, net }`, reading `t.lastEdit`.
- **That is a change to the recorder's read-only view, not to the tracker or to anything recorded.** No session rule, no file, no timing changes, and `live()` has one caller (`stats.ts`). The brief says "without changing the tracker": it is untouched. But it does touch a kept module's interface (additive, one field), so **I'd like Kenny's explicit OK** (the brief's hold point: "the pause can't be known without changing the tracker"; it can, through this field).
- **Length so far** = `lastEditMs − startMs`, which is what the recorded session will hold (decision 34: a session ends at its last edit), so a paused clock's length holds automatically and matches the file. It is **not** `now − start`, which is what today's readout shows and which would keep counting through a pause.
- **Paused** = `now − lastEditMs ≥ 60 000`, evaluated on the one-second tick, using the same clock the recorder uses (`Date.now()`, as `drawReadout` does now; the tests' fake clock covers it). The idle limit (default 3 minutes) ends the session after that; the row then returns to `0m` with the standard clock, because `live()` becomes null.
- **Format:** `0m`, `25m`, `1h 05m` (minutes rounded down; hours and minutes only). A small pure function with core tests, replacing the `mm:ss` `elapsedLabel` (which will no longer be used; I'd remove it rather than keep two).
- **The row's one-second tick is already there;** no new timer needed. The minute-boundary is only seen to the second, which is fine for a reminder.

## 4. The icons

Kenny's mapping, as received:

| Use | File | Set | Size |
|---|---|---|---|
| Graph (opens history) | `clipboard-data.svg` | Tabler, filled | 24 px |
| Count: day | `calendar-days.svg` | 16-unit set, see below | 16 px |
| Count: week | `calendar-date-range.svg` | same | 16 px |
| Count: session | `calendar.svg` | same | 16 px |
| Count: chapter | `document.svg` | same | 16 px |
| Count: novel | `book-open.svg` | same | 16 px |
| Clock, running | `clock.1.svg` | Tabler, outline | 24 px |
| Clock, paused | `clock-pause.svg` | Tabler, outline | 24 px |

- **Tabler (the three 24 px icons):** already in `Icon Licences.md` (MIT). Their headers give the Tabler glyph codes. They'll go in `kit/icons.ts` as `IconNode`s, like the existing Tabler ones.
- **The five count icons are a different set, and I can't tell which.** They're 16×16, solid, filled, and look like **Heroicons 16 solid ("micro")**. **Heroicons is not in `Icon Licences.md`.** If they are Heroicons, the licence is MIT (Tailwind Labs) and I'd add an entry; **the brief says to ask before using an icon whose licence isn't clear, so: where do these five come from?**
- **Colour:** the files hard-code fills (`#0F172A`, `black`). They'll be rewritten to `currentColor`, since no colour may appear outside `src/ui/theme/` (the purposes test fails on a hex).
- **The two sets differ in weight:** the Tabler clocks are 2 px outline strokes on a 24 grid; the count icons are solid shapes on a 16 grid. In the mock-up the 16 px solid icons look a little lighter than the 24 px ones, but not out of place. Kenny's call whether that sits right.
- `calendar-date-range.svg` has only paths in `black` and renders the same way; its dot positions differ from `calendar-days` (which I'd read as week = a band, day = a grid).
- **Replaced and removed:** the `layers` and `switch` icons are used elsewhere? `layers` appears only in stats; I'll check before removing it from `kit/icons.ts` (the bundle is meant to hold only what's used).

## 5. Mock-up

`docs/stats-shots/mockup.png` (a WebKit render, not the real component): four states, all in `grey1` on the panel's `bg_dim`.
- A: readout off (one row), day.
- B: readout on, before a session (clock, `0m`).
- C: session chosen, 25 minutes in (length only: the words aren't repeated).
- D: day chosen, paused clock, `1h 05m`, then the session's words.

**The mock-up's day, week and session icons are my approximation** of Kenny's files (the real ones come in the build); sizes, spacing and colour are the point.

## 6. Colour: `grey1`

- The theme has **no `grey1` yet** (it has `grey0` and `grey2`). It's added as Everforest's dark `grey1`, **`#859289`**, with a purpose, `--purpose-stats` (the brief says purposes only).
- **Contrast on `bg_dim` (`#293136`): 4.08:1** (computed; `grey2` is 5.43, `grey0` 3.40). Under 4.5:1 for text, as decision 68 records: Kenny's choice. The icons clear 3:1.
- The keyboard focus ring stays green.

## 7. Other design points I need ruled, or will do unless told otherwise

1. **Persisting the count (decision 68):** a new optional key in `MachineProjectState` (`statsCount?: "day" | "week" | "session" | "chapter" | "novel"`), beside `cardTiers`, stored per project in machine settings. An unknown value reads as day, never rewritten. Nothing is written to `project.md`.
2. **Accessible naming:** the count button's name says what's showing and what pressing it shows next (the brief's example); the figure is in `aria-live="polite"`, as now. The number carries a label ("words today: 412").
3. **Count icons and their tooltips** say the same as the accessible name, on hover and keyboard focus.
4. **A negative day:** the existing figures can be negative (net loss); `formatWordCount` already handles it as today. No change.
5. **Existing tests** that look at `session-readout` (`test/ui/sessions.ui.ts`, "the live readout") and at the daily/weekly text (`storytelling.ui.ts`, `dividers.ui.ts`, `look.ui.ts`) will change to the new design: they test the same behaviour, not less. The "goes when the session ends" test becomes "returns to `0m`". I'll list each in the commit message.
6. **No new Rust command, no new dependency, no close-path change;** so no `npm run test:quit` is required for this brief, unless that changes.

## 8. For Kenny to answer before I build

1. Where do the five 16 px count icons come from, and under what licence?
2. May `SessionRecorder.live()` gain a `lastEditMs` field (additive; tracker untouched)?
3. Wording: today / this week / this session / this chapter / this novel in names and tooltips?
4. Is it right for the count icons to be 16 px beside 24 px graph and clock icons (as the brief says "natural size")?

## 9. H1 rulings (decision 69)

1. The five count icons are **Heroicons** (16 px solid), MIT, from Tailwind Labs, Inc. Added to `Icon Licences.md` with source, version and the MIT notice (Kenny supplied the LICENSE; the exact release isn't recorded, and the entry says so).
2. `SessionRecorder.live()` may gain a read-only `lastEditMs`: it only reports, existing callers are unaffected, and it has a core test. Length so far is `lastEditMs − startMs`; paused is `now − lastEditMs ≥ 60 s`.
3. Wording: "today", "this week", "this session", "this chapter", "this novel", in the count icon's accessible name and tooltip ("Words today; press for this week").
4. The count icons stay at their natural 16 px beside the 24 px graph and clock icons. Kenny judges them in the built app.
5. `grey1` `#859289` joins the theme as a palette role (4.08:1 on `bg_dim`).

## 9a. Icon changes after H1 (Kenny, 31 October 2026)

Kenny sent Fluent icons (MIT): **document-text (filled) replaces the Heroicons document** as this chapter's icon; **clock-bill** shows while a session is ongoing; **clock-pause** is the paused clock (now Fluent's, 16 px, instead of Tabler's); **clock** shows when no session is ongoing. All three clocks are drawn at 24 px. He also wanted the pause timing tied to the idle limit; asked what that would show, since the pause and the end of the session would then coincide, he chose **"keep a separate short pause"**: the pause stays at a minute without an edit, and only the icons change. `data-clock` is now `idle`, `session` or `paused`.

## 10. As built

Three commits on `stats` after this document: `7d6e0bc` (the counts row), `49fe23b` (the Heroicons author line), `5d084fe` (the readout row), then the version, changelog, `AGENTS.md` and the report.

- **Differences from §§1–8: none in what was proposed.** The figures come from the same functions as before (§2); session is `live().net`.
- **Where the code is:** `src/ui/faces/stats.ts` (the section, built once and updated in place so keyboard stepping keeps focus), `src/ui/kit/statsIcons.ts` (graph and counts, drawn in `currentColor`), `src/ui/kit/icons.ts` (the two Tabler clocks), `src/core/sessionReadout.ts` (the length format, `PAUSE_AFTER_MS`, `readoutState`), `src/app/sessionRecorder.ts` (`live()`), `src/app/settings.ts` and `src/ui/model.ts` (`statsCount` in machine state; day isn't stored, an unknown value reads as day).
- **Colour:** `--ef-grey1` in the theme file, `--purpose-stats` in `purposes.css` (and `tokens.ts`). The files' own fills (`#0F172A`, `black`) became `currentColor`, so the purposes test still holds.
- **The old `layers` icon and `elapsedLabel` (`mm:ss`) are gone;** the old "Switch wordcount" button is replaced by the count icon.
- **Not a live region on the row:** the readout row has none (as before); only the number is polite, so a step is announced without a ticking clock being read out.
- **The pause is seen to the second:** the row redraws on the existing one-second tick, so the clock changes within a second of the minute.
- **The count icon is a `<button>`,** so a space typed while it has focus steps it on. That is a button's normal behaviour; typing happens in the editor.
- **Rust, the close path, the guard and the disk format: untouched.**
