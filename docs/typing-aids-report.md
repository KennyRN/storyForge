# Typing aids (Brief 9): report

Version 0.13.0, branch `typing`. Design and rulings: `docs/typing-aids.md` (§12 rulings, §13 as built; decisions 46 and 47).

## What was built

| Commit | What |
|---|---|
| `19278c8`, `432ad67`, `338555a` | the design doc, then the H1 rulings (decision 46) |
| `29d8db7`, merge `9be3374`, tag `v0.12.1` | **Fix 3, shipped first on its own:** the Mac's own smart quotes, dashes, Text Replacements and autocorrection no longer act in the editor; spellcheck underlines on |
| `9c46993` | settings: the Typing group and its `typing-*` keys in `project.md` |
| `04deffe` | smart punctuation in the editor |
| `1697eac` | smart punctuation in plot notes, the synopsis and the description: they became small CodeMirror editors (decision 47) |
| `306e59f` | name autocorrect |
| `461981c` | shortcodes |
| `ed23bbc` | the special-characters button |
| this commit | docs, report, screenshots, version 0.13.0 |

## Screenshots

- The Typing group in the settings: `docs/interface-shots/typing-settings.png`, with the lists filled in: `typing-settings-lists.png`
- Smart punctuation in the editor: `typing-smart-punctuation.png`
- The shortcode popup: `typing-shortcode-popup.png`
- The special-characters button and its palette: `typing-special-characters-button.png`, `typing-special-characters-palette.png`

## The survey (Brief 9 §0)

- **The word counter** counts runs of non-space characters, so every curly or dashed form counts exactly like its straight form: no aid changes a count (a regression test and a 3,000-case fuzzer fix it). `word--word` and `word—word` are each **one** word today, not two as decision 37 said; the counter was left alone (decision 46) and the question is an open item.
- **macOS substitutions acted in the built editor** (found by typing real keystrokes into the built app): smart quotes, `--` to an em dash, `...` to an ellipsis, and the author's Text Replacements (`omw` became "On my way!"), also inside `[[links]]`, code and comments. A live bug in 0.12.0. Fixed first, as 0.12.1, with three `Web…Enabled` defaults registered per app. Spelling underlines had been **off** (not "staying on"): they are on now.
- **CodeMirror:** no `@codemirror/autocomplete` in the build; the popup uses `@codemirror/view`'s tooltip. No new dependency.
- **The Edit menu** already has "Emoji & Symbols": nothing to build.

## Hold points hit

- **Fields and undo (commit 3).** A browser text area's undo swallows an aid's change (one ⌘Z cleared the whole word; redo gave `don'don’`). Held as the ruling said; decision 47 chose CodeMirror editors for the three field types. 60 extended cards open in a median of 39–40 ms, against 36 ms with text areas.
- No other hold point was reached: the counter needed no change, the Mac's substitutions could be turned off cleanly, an aid can be its own undo step, no new file, key outside `project.md` or dependency was needed.

## Review findings and what they changed

- **A change made through the CodeMirror state made WebKit forget every spelling underline in the paragraph** (found by looking at a picture of the built app, not by a test). Toggling `spellcheck` afterwards didn't help. The aid's change is now made through the browser's own editing and recorded as an isolated step; underlines survive, in the chapter and in the fields (`test:typing --shot` and `--field-shot` take the pictures).
- A first version of the cover-style built-app check looked for an image through accessibility, which never exposes one inside a button; the same lesson applied here: the toggle is an `AXPopUpButton` in the real app (`aria-haspopup`), which only the real run showed.
- **The quit test refused to run on a busy Mac (three runs in a row, in plot-note cases): the typed text was already on disk before the quit.** A field commits when it loses focus, and other apps (IconJar, VS Code) kept taking the focus from the window while the script waited on slow accessibility calls (each took over two seconds with the Mac busy), so the field had already saved: correct behaviour, but a run that proves nothing. The script now retries such a run (up to three) and counts the retries (`"saved early" retries`), and still never counts a retried run as a pass. Final runs on the 0.13.0 build: ten of ten, no retries of either kind.
- Screenshots caught: add-fields stretching to the full dialog width in settings, a white ring around the shortcode popup (CodeMirror's own tooltip border out-weighed my override).

## Behaviour that differs from the brief

- **The aids react to typing and don't intercept it** (§13 of the design doc); they never see composition, dictation or paste.
- **A keystroke can make two changes, undone together** (a dash it completes and the quote it is).
- **Return doesn't finish a word:** a name typed lazily and followed directly by Return is not corrected, and an elision at the end of a paragraph isn't converted. Known limit.
- **Plot notes, the synopsis and the description are small editors, not text areas** (decision 47), with smart punctuation only (1.1.0, decision 53: all three aids; see `typing-aids.md` §15).
- **The popup labels Codex names "Codex", not by type.**
- **The Mac's own substitutions are off in the editor whatever the aid switches say** (decision 46), and the spellcheck underlines are on.

## Measurements

- 60 extended chapter cards, time to appear: **36 ms** (textareas) and **39–40 ms** (editors), medians of six runs each (`MEASURE=1 npx playwright test test/ui/measure.ui.ts`). Under the 100 ms line, so the editors mount at once.

## Tests

1,541 core tests, 192 WebKit interface tests and the Rust workspace tests, all passing. New: table-driven tests and fuzzers for the quote, dash, ellipsis, name and shortcode rules (nothing outside the typed run or inside protected text; every change undoes to what was typed; the word count never changes); WebKit tests for each aid, the one-⌘Z rule, paste, drop and reload being left alone, the switches, the popup's keys and accessibility, and the button; an architecture test that the field editors can't reach the prose writer or the session tracker.

In the built app (decision 45): `npm run test:typing` types real keystrokes (curly quotes, an en and em dash, an ellipsis, elisions, a Codex name, a shortcode with the real Tab key, the button, and one ⌘Z through the real Edit menu) and reads the editor back; `npm run test:quit` (ten cases) and `npm run test:cover` pass.

## Kenny's check (Brief 9 §7)

Pending, or to be recorded as waived. If only a few minutes: items 1 and 3 (a line of dialogue with an apostrophe, a nested quote and a spaced dash, and ⌘Z straight after a curl; a Codex name typed lazily).
