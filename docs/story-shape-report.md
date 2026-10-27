# Story shape (Brief 8): report

Version 0.12.0, branch `shape`. Design and rulings: `docs/story-shape.md` (§12 rulings, §13 as built).

## What was built

| Commit | What |
|---|---|
| `9bf3a80`, `21595ca` | the design doc and the H1 rulings |
| `87c5872` | chapter card sizes, the chevron and the size control |
| `0f3014e` | plot notes: commit on blur, compare-then-write, recovery |
| `e0ad6ec` | Codex renames re-point PoV, location and default-PoV references |
| `5fc29ec` | PoV and Location rows, the Codex picker, the default PoV |
| `3f5aac3` | the synopsis and series description as strict section writes |
| `ed9cfdb` | covers: `pick_cover` and `read_cover`, cover boxes in both overviews |
| `7dc68df` | fields being edited are committed by every close and quit route |
| `0e531ee` | rescue of field text when the close cuts a commit off; the quit test tells "not typed" from "lost"; disk-safety operations for the field commits |
| this commit | docs, report, screenshots, version 0.12.0 |

## Screenshots

- Novel overview, cards in all three sizes (Chapter 1 bar, The Storm collapsed, Chapter 2 extended): `docs/interface-shots/shape-novel-overview-mixed.png`
- All cards extended, with the size control showing Extended: `docs/interface-shots/shape-novel-overview-extended.png`
- The series overview with a cover chosen, the description and each novel's synopsis: `docs/interface-shots/shape-series-overview.png`
- The PoV picker: `docs/interface-shots/shape-picker.png`
- The rename dialog's plan, with the new line saying how many novel files will follow the new name: `docs/interface-shots/rename-plan.png`
- The open-time summary with the new line about PoV and location lists following a renamed note: `docs/interface-shots/shape-summary-references.png`

## Behaviour that differs from 0.17.1, and why

- Clicking a card's bar opens the chapter; a chevron changes the card's size (decision 41). The plugin cycled the size by clicking the bar.
- The size control for every card at once is new (decision 41).
- There is no narrator fallback: a chapter without its own PoV shows the novel's default PoV, muted and labelled, and it is never written into the chapter.
- Replacing or removing a cover retires the old file to `.trash/`; 0.17.1 overwrote or deleted it.
- A Codex rename updates PoV, location and default-PoV references by path and name; deleting, archiving or pruning a note leaves them to show as missing instead of dropping them.
- Plot notes keep leading whitespace; an empty synopsis or description removes the section instead of leaving a heading; a duplicated heading makes the field read-only.
- Fields are committed on blur and on every close and quit route; a conflict or failure puts the author's words in a recovery file, never over the file.

## Hold points hit

- **The survey said renames didn't rekey PoV and location references. That was wrong:** the reconciler and the rename already did, though not as ruled. No hold was needed; `rekeyCodexNoteReferences` brought them in line (`e0ad6ec`). No new kind of write at open.
- No other hold point was reached: nothing needed a new key, file or folder, a window permission beyond the two cover commands, or a cut feature.

## Review findings and what they changed

- **Commit 7's review found a gap I had left:** a hung field commit was cut off at the limit with the author's text still only in the field. Fixed in `0e531ee`: `FieldState.rescue` and a rescue step in the close, with unit tests for a hung commit, a throwing commit, a failed recovery and words typed during a commit.
- **The quit test's first run with the new cases had two chapter-route failures** (SIGTERM and SIGHUP: the typed text never appeared, no session file). It passed on every later run, so it was most likely the keystrokes not reaching the editor, but that was not proved. The script now reads the field's content back through accessibility before it quits, waits for real focus, retries with a new marker, and reports "not typed" separately from a loss; a case that never typed is a failure, not a pass.

## Surprises

- The screenshots again found what the tests passed: the synopsis was one line tall instead of filling the cover's height, an empty plot note on a collapsed card was an invisible gap, and the Default PoV row sat flush against the progress bar. All fixed before the commit.
- My plot-note class clashed with an existing `sf-field` class used by the length editor; renamed to `sf-note-field`.
- Retiring a cover needed no guard change: `create-file` and `retire` already allow backstage cover paths.

## Tests

1,358 core tests, 151 WebKit interface tests and the Rust workspace tests, all passing. New: core tests for plot-note round-trips, strict sections and field conflicts; `FieldState` unit tests; ten Rust cover tests; WebKit tests for sizes, plot notes, pickers, missing references, covers, read-only, rename and the close; disk-safety operations for the field commits and cover names.

## Kenny's check (Brief 8 §7)

Pending, or to be recorded as waived. Item 2 (type a plot note, start another, press ⌘Q mid-sentence, reopen) is worth doing by hand: it is the same thing the quit test covers.
