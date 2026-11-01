# Fix 5: panel widths, report

**Built app: 1.5.0, branch `widths`** (not merged; `main` is v1.4.0). Commits: `476f310` (survey), `cb04c39` (stored widths), `ef1517b` (settings group), then this one (docs, version, the built-app check).

## What was built
- Three widths (the left panel on each side, the context panel), a same-width switch (on by default) and a unit (percent by default), in machine settings per project: `leftWidth` (storytelling side), `libraryWidth`, `loreWidth`, `widthUnit`, `widthsLinked`. `project.md` is never written.
- `ui/panelWidths.ts` (pure: limits, conversion, display widths, narrowing), the model's `setPanelWidthPx`, `commitTypedWidth`, `setWidthsLinked`, `setWidthUnit`, the shell drawing the panels from `displayWidths()` on change, flip and window resize, and the settings group `screens/widthsSettings.ts`.
- Narrowing is for display only: equally while linked, context panel first when not; stored figures never change.

## Limits and defaults as built
Left panel 200–640 px, context panel 280–640 px, shared range 280–640 px (percent bounds are the same limits at the window's width), workspace at least 360 px. Under 840 px wide the panels stay at their minimums and the workspace is narrower than 360 px. Default unit percent, switch on. Keyboard steps are 16 px (48 with Shift), stored in the current unit (so percent can land a pixel off).

## First open, per fixture
A project with no `widthUnit` stored reads its old pixel `leftWidth` (288 by default) for all three panels, linked, converted to percent at the window's width at open; the converted figures are saved by the next change. The `series` fixture has nothing stored, so it opens at 288 px for all three (measured in the built app: left 288, context 289). Existing tests that assumed a 400 px context panel (`test:look`) now store the old widths for their project, which also proves a pre-1.5.0 machine file reads correctly.

## Tests
- `npm test` 1,620 (panel-width unit tests: round-trips at 800–2560 px windows, narrowing, limits, never changing stored figures; a machine-settings parse test).
- `npm run test:ui` 359 passed, 1 skipped (the usual); 13 new tests in `test/ui/widths.ui.ts`, including byte-for-byte `project.md`. Four old tests that expected the old geometry (a 480 px maximum, panels that never narrow) were adapted without weakening what they check.
- Rust 20+ tests pass (unchanged); `test:quit` 10 of 10 on 1.5.0 (the close path wasn't touched; run as a control); `test:look`, `test:typing` pass; new `npm run test:widths` passes in the built app (through the typing guard; it sets the window size only on its own throwaway copy).
- The project folder stays byte-identical: tested in the preview and in the built app (`project.md` unchanged).

## Screenshots (`docs/widths-shots/`, built app 1.5.0)
`1-default-linked`, `2-settings-group`, `3-typed-30-percent`, `4-narrower-window-percent`.

## Findings
- **Crash reports from the smoke scripts' exits.** `look-smoke` and `typing-smoke` (and my first `widths-smoke`) start the test copy with its error output piped and then exit; each left a "quit unexpectedly" `abort()` report (same stack as 31 October on 1.4.0). With the pipe set to ignore, a full `test:widths` run left none; `test:quit` never did. Not an app fault, but `look-smoke` and `typing-smoke` should get the same one-line change (offered, not done).
- One full-screen capture was taken by mistake while debugging; deleted at once. Only window captures are used.

## Holds
None hit. The window-too-small case under 840 px is the one place the workspace minimum can't be kept (documented).

## Kenny's check (built app 1.5.0, on a copy of a project)
1. Drag a divider, then reopen settings and check the figure.
2. Type a width; check both sides and the context panel match.
3. Turn the switch off, set three different widths, flip sides, then turn it back on.
4. Switch the unit to percent, then snap the window between your two sizes.
5. Open a second project and check it keeps its own widths.
