# Brief 12 – the stats panel: report

Built on `stats` (storyForge **1.4.0**, built app from branch `stats`; `main` is still 1.3.0 until the merge). Decisions 68 and 69. The survey and the rulings are in `docs/stats.md`.

## What was built

- **The counts row:** the graph icon (24 px; opens the history view), the icon of the count on display (16 px), its number. Clicking the count icon steps day, week, session, chapter, novel, round again. Which count shows is kept per project in machine settings; day isn't stored; `project.md` is never written (tested).
- **Icons changed after the first build** (Kenny, see `docs/stats.md` §9a): Fluent's document-text, clock, clock-bill and clock-pause. The pause stays at a minute.
- **The readout row** (only with the existing setting on, and then always there): the clock (24 px) beneath the graph icon, the length (`0m`, `25m`, `1h 05m`), the words (not repeated when session is the count above). The clock is the paused one from a minute without an edit; the length holds at first-edit-to-last-edit; at the session's end the row goes back to the standard clock and `0m`.
- **Colour:** the whole section is `grey1` (`#859289`, 4.08:1 on `bg_dim`), tested for every part.
- **Accessibility:** the count icon is a button named "Words today; press for this week" (and so on), the same in its tooltip; Return and Space step it and focus stays on it; the number is a polite live region whose hidden text names what it counts.

## Where each figure comes from (unchanged)

| Count | Source |
|---|---|
| day, week | `getBookWordStats` → `storytellingTodayAndWeek` with `excludedByDay` (the storytelling figures) |
| session | `SessionRecorder.live().net` (the tracker's `net()`) |
| chapter | `project.wordCount(libraryChapterPath(book, chapter))` |
| novel | `getBookWordStats(...).current` |

No figure, maths module, session rule or counter changed.

## The one interface change

`SessionRecorder.live()` also returns `lastEditMs` (read-only; ruled in decision 69, item 2). The tracker already held it. A recorder test shows it stays at the last edit while time passes and is null between sessions; core tests cover the length format, the pause at exactly 60 s, the next edit clearing it, and the length holding while paused.

## Icons

| Use | Icon | Set | Licence |
|---|---|---|---|
| graph (history) | clipboard-data, filled | Tabler | MIT |
| today, this week, this session, this novel | calendar-days, calendar-date-range, calendar, book-open (16 px solid) | Heroicons, Tailwind Labs, Inc. | MIT |
| this chapter | document-text (16 px, filled) | Fluent (Microsoft) | MIT |
| no session, a session ongoing, paused | clock, clock-bill, clock-pause (16 px, drawn at 24) | Fluent (Microsoft) | MIT |

All recorded in `Icon Licences.md`. The Heroicons release the files came from wasn't recorded; the entry says "2.x, the 16 px micro set".

## Tests

- `npm test`: 1,607 passing (new: `sessionReadout`, the recorder's `live()`, the machine state's `statsCount`).
- `npm run test:ui`: 345 passing, 1 skipped as always. The old "switch wordcount" tests and the six "live readout" tests were rewritten for the new design, testing the same behaviour and more; none weakened.
- Rust tests pass; no Rust changed. `npm run test:quit` wasn't run: the close path isn't touched (decision 38).

## Screenshots

- **The H1 mock-up** (`docs/stats-shots/mockup.png`) is updated to the decision 71 layout, using the real icon paths.
- **WebKit preview, all six states, in the decision 71 layout:** `docs/stats-shots/preview/`: readout off; on with no session; during a session; paused; session chosen (words not repeated); chapter chosen. (These preview shots were taken before the fixture was brought up to date, so their day figure reads 10 for five typed words: the old fixture recorded 17 words for a chapter of 22, and the history caught up by five on the first change. A fixture artefact, not a double count.)
- **Built-app screenshots, retaken in the decision 71 layout** from the built 1.4.0 app (confirmed 1.4.0 first), on a fixture copy with a temporary `HOME`, typed through the typing guard (decision 72) so nothing could land outside the test copy. In `docs/stats-shots/built/` (each a crop of the section and the whole window, `-window`): `readout-off`; `readout-on-before-a-session` (plain clock, `0m`); `readout-on-during-a-session` (clock-bill, five words typed); `readout-paused` (clock-pause, length held, five words); `session-chosen-readout-without-words` (session chosen as the count, seven words above; the row has the clock and `1m` and no words); `chapter-chosen`. The day figure reads 5 for the five words typed: the fixture's `wordcount.md` was brought up to date with its chapters (decision 72), so it no longer catches up on the first change.
- `docs/stats-shots/now-*.png` are the section before the brief.

## The low session-word count (decision 71, item 4)

- **Lazy counting is not the cause.** `SessionTracker.net()` counts the chapter's current body each time it is called (it caches the count per body), and `live()` calls it; nothing in the recorder lags the typing. In every built-app case I examined, **the readout matched what had reached the chapter**: with the leading space dropped the text read `anything.afew quiet words here`, which is three words more than before, and the readout said 3; with every space dropped (`anything.afewquietwordshere`) it is one word, net 0, and the readout said 0; with the typing landing properly, the session file and the readout both said 5 (seven runs). A session file written after a run that dropped most keys said `net: 0` while the chapter on disk ended in `anything.a`.
- **The cause was the keystrokes, not the app:** the keystroke tool dropped or glued characters (as in decision 55), and in the last runs another window and a system dialog were taking focus.
- **Still done, as ruled:** the readout now redraws every 250 ms from a fresh `live()` read (it was once a second), without changing how sessions are counted or recorded; no recorder change was needed beyond `lastEditMs`. A new interface test checks the words match what was typed within 300 ms of the last key, including after deleting.
- **Not shown:** a repeat under CPU load. Since the cause was found in the evidence, I did not run one; say if you want it.

## Hold points

- **H1** (after `docs/stats.md`): ruled in decision 69; nothing else was hit.
- No figure, maths module, session rule or the tracker needed changing, so the second hold never arose.

## Things to know

- **The keystroke tool dropped spaces** typed in a burst while taking the screenshots (the known behaviour, decision 55), so the built-app script sends each word, then the space key on its own. It is not an app fault. The script stayed in the scratchpad, as the other drivers do.
- **A space typed with the count icon focused steps it on,** as for any button.
- **`storyForge.app` in Kenny's folder links to this 1.4.0 build from `stats`.** After the merge, `main` is rebuilt so it points at the latest `main`.

## Kenny's check (in the built app, on a copy of a project)

1. Click through all five counts and check each figure.
2. Open the history view from the graph icon.
3. Switch the live readout on (Settings, Display); write, stop for over a minute, write again, then stop for over three.
4. Choose session as the count and check the readout doesn't repeat the words.
5. Judge the 16 px count icons beside the 24 px graph and clocks (decision 69, item 4).

*Status: waiting for Kenny's check, or his waiver.*

## The typing guard (decision 72)

Every script that types into the real app (`test:quit`, `test:look`, `test:typing`) now goes through `scripts/lib/typingGuard.mjs`: before each burst of keystrokes the test copy must be the frontmost app, alone, with one of its text boxes focused, or nothing is typed and the script stops saying what was in front. Long strings are typed in chunks of eight with a check before each. All three scripts pass with it on the 1.4.0 build (`test:quit` ten of ten, no "not typed" or "saved early" retries). Two things the guard's first runs found and fixed in the guard itself: the first key typed straight after the check was dropped (a 250 ms settle fixes it), and a chunk starting with `-` (such as `-- y`) was read by `osascript` as an option and silently typed nothing (each chunk now has a leading character that is dropped again). The rule is in `AGENTS.md`.

**One sign found:** a run on 31 October 2026 typed my test text into `~/Desktop/text.txt` (Kenny's file) while the Xcode dialog was in front. Reported to Kenny; the file was not touched.
