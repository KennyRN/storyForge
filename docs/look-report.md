# The look, round one: report (Brief 10, v1.2.0)

Design and rulings: `docs/look.md` (§1 to §3 the survey, §8 to §13 the rulings and as-built). Decisions 54 to 60.

## What was built

Seven commits on `look`, each passing `npm test`, the Rust tests, the typecheck and `npm run test:ui`, with the app building: the survey (H1); SN Pro (H2); the Codex list's look; the strip; the card and bottom row; the special-characters button; and these docs with the version. Four small follow-up commits carry the rulings on the way (decisions 58 to 60).

## Screenshots (the built app, `docs/look-shots/built/`)

| What | File |
|---|---|
| A chapter at 20 px with `ð þ ƿ ȝ ǣ`, upright, italic and bold | `chapter.png` |
| The same at the editor's 30em maximum width (context panel hidden) | `chapter-30em.png` |
| A Codex note in the context panel, on its card | `codex-note-in-context-panel.png` |
| A Codex note in the workspace (library side) | `codex-note-in-workspace.png` |
| A plot note | `plot-note.png` |
| The Codex list, storytelling side (no note open) | `codex-storytelling-no-note.png` |
| The Codex list, library side | `codex-library.png` |
| The context panel without a note | the right-hand side of `chapter.png` and `codex-storytelling-no-note.png` (blank, bottom row only) |
| An open empty folder (the browser preview) | `docs/interface-shots/look-codex-empty-folder-*.png` |
| The fallback candidates, as shown at H2 | `font-candidates.png` (the panel itself has been removed) |

## The font coverage and how it was ruled

SN Pro (both files: 1,183 glyphs, 979 characters, full weight axis 200 to 900, the italic a real italic) lacks `ƿ Ƿ ȝ Ȝ`, `ſ`, `ĳ`, `ǣ`, `ǭ` and much of Latin Extended-B (`docs/look.md` §1). Ruled at H1 (decision 56): keep the Old English group in the starting set; name no fallback until it could be seen; at H2 (decision 57) the fallback is **Arial**, the only built-in sans-serif that contains `ƿ Ƿ ȝ Ȝ ǣ` with a real italic and bold. The stack is `"SN Pro", Arial, system sans-serif`, with font synthesis off. New York and San Francisco lack `ƿ Ƿ ȝ Ȝ`; Helvetica Neue lacks only `ƿ`. `test:look` shows wynn and yogh in italic text are drawn by Arial Italic (the slant of the ink: 3.4 px more than the upright at 2x; the two have identical advance widths, so width cannot tell them apart).

## The security-policy change, quoted

Before: `default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'`

After: `default-src 'self'; connect-src ipc: http://ipc.localhost; font-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'`

The old policy already allowed fonts from the app (a missing `font-src` falls back to `default-src 'self'`); this states the rule. A test pins it; `npm run test:look` proves the font is really drawn in the built app. No network request is made (a WebKit test checks every request is the app's own).

## Where the Codex list follows the plugin and where it differs

Follows: no chevrons; the icon after the name, a long name cut with "…" and its icon kept; lines beside open folders (nested, none when closed); the strip's order (New Folder, then New Note) at the list's left edge; new things go at the end of the last folder clicked; the open or closed state stays navigation state (machine settings, decision 23).

Differs, by ruling: an open empty folder says "Empty" (the plugin showed nothing, so it looked closed); the arrow keys are the standard tree keys and reordering moved to ⌥ plus the arrows (the plugin's arrows reordered, and nothing could be opened from the keyboard); the list is a real tree for a screen reader (the plugin announced only an icon label); a new folder or note is **named in place and created only on Return** (the plugin made "New Folder" or "New Note" and left you to rename it); creating into a closed folder opens it (in the plugin the new item could be invisible); with the mouse a folder opens and closes only by its icon, which has a 28 px square hit area; a note with no tag shows no icon.

## Hold points hit, and how they resolved

- **H1** (the survey): rulings in decision 56. The upright file first supplied was the combined `SNPro-Variable` (it has a `slnt` axis); `SNPro-VariableRegular` was supplied and checked.
- **H2** (the font in the built app): decision 57 (Arial, 20 px at 1.6).
- Not hit: no core, disk or close-path change; no new Rust command; no new dependency. One additive core change was reported and accepted: `createCodexFolder` takes an optional name (decision 58).
- **The intermittent test failure** (decisions 44, 55 and 60). `src/app/__tests__/sessionRecorder.test.ts` failed about once in a hundred runs. The cause was in the test: real file I/O under a fake clock, with a shared helper that waited a fixed real 20 ms (`test/helpers/scheduler.ts`), so under load a save or session file had not landed when the assertion read it. The old test failed 27 times in 40 runs under full CPU load, with the same two messages as the intermittent failures; the fixed test (it now waits until the file work itself is finished, `test/helpers/countingBackend.ts`) passed 200 of 200 solo runs and 200 of 200 under full load. The recorder was not at fault.

## Anything surprising

- **In a read-only project the Codex list could not open a note at all** (the click is answered by the drag gesture, which was not attached when read-only). Present in 1.1.0 and earlier; fixed (changelog).
- The keystroke tool types an "a" for characters it has no key for (`ƿ`), so the wynn lines in the built-app check are in the chapter file of the throwaway copy.
- SN Pro at 20 px shifts widths enough that two typing tests and one edge test assumed the old font's widths; they now measure.
- A Codex row answers only to pointer events (the drag gesture); the built-app check first needed one real mouse click. Return on a focused row (added with the tree keys) removed it; `test:look` uses no pointer.
- The font candidates panel (dev-only, compiled out of every other build) was shown at H2 and removed after the ruling.

## Tests

`npm test` (vitest, including the disk-safety suite, unchanged), `cargo test --workspace`, `npm run test:ui` (the new suites: `look`, `codex`, `strip`, `card`, `chars`), `npm run test:look` (built app, Mac). `test:quit` was not needed: the close path is untouched.

## Kenny's check (§5), to do on a fixture copy in the built app

1. Write a paragraph with bold, italic and `ð þ ƿ ȝ` in a chapter and judge the font.
2. Open and close folders in both Codex lists, by clicking the icon and with the keyboard.
3. Create a folder and a note from the strip on each side.
4. Open a Codex note in the context panel; resize the panel; close the note.
5. Use the special-characters button in the chapter, the context panel's note and a plot note.
