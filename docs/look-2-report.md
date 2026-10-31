# Look, round two: report (Brief 11)

**Built app:** storyForge **1.3.0**, built from branch `look-2` (not `main`), reached through the `storyForge.app` link beside the repository (decision 66). The branch is not merged or pushed. `main` and the tag `v1.2.0` are 1.2.0; **`main` has not been rebuilt**: Brief 11 is mid-flight on its branch, so by the standing rule the rebuild of `main` waits until after the merge.

## What was built (commits 2 to 8)

| Commit | What |
|---|---|
| 1 | `docs/look-2.md`, the survey (H1) |
| 2 | Scrollbars hidden at rest; a thin bar while scrolling (`kit/scrollIndicator.ts`) |
| 3 | The seven dividing lines removed |
| 4 | The Codex list: 16 px, one colour, the inverted highlight, folder lines flush, a folder's own note drawn once, no heading |
| 5 | The strip's buttons as plain icons |
| 6 | The Codex colour setting (`codex-colour`), and yellow, aqua and purple in the theme |
| 7 | The project name and the novel's title in the green accent (storytelling side) |
| 8 | Docs, this report, the changelog, 1.3.0 |

## Lines removed and kept

**Removed (seven):** the navigator's bottom border; the stats' top border; the left header's bottom border; the read-only banner's bottom border; the find panel's bottom border; the library rail's right border (kept as a transparent 1 px, so the ink indicator stays); the splitter's line (kept as an invisible drag area with the resize cursor).
**Kept:** the window's own frame (the Mac's), control outlines (buttons, inputs, menus, dialogs, fields, cards, covers), the notice's red marker, focus rings (the splitter's green line on keyboard focus), the ink indicator and selected-tab marker, the Codex folder lines, the overviews' bar markers.

## Contrast table (Codex colour choices)

From the theme's own values; `bg_dim` is `#293136`. The ratio is the same as text on the panel and as the panel's colour on the choice (the highlight).

| Choice | Colour | Ratio | ≥ 4.5 |
|---|---|---|---|
| Text (`fg`, the default) | `#d3c6aa` | 7.83 | yes |
| Yellow | `#dbbc7f` | 7.25 | yes |
| Aqua | `#83c092` | 6.25 | yes |
| Purple | `#d699b6` | 5.73 | yes |
| Grey (`grey2`) | `#9da9a0` | 5.43 | yes |

All pass, so nothing was dropped. The theme's existing `fg`, `red`, `orange`, `green` and `blue` matched the supplied source: no mismatch. No `palette.md` exists in the repository.

## Screenshots (`docs/look-2-shots/`)

Built app (1.3.0, `npm run test:look -- --shots docs/look-2-shots`): `codex-storytelling-no-note.png` (panels without dividers, the green titles, the Codex list, the strip's icons), `codex-library.png` (the library side), the chapter at 30em, a Codex note in the context panel and in the workspace, and a plot note.
Browser preview, not the built app: `preview-codex-aqua-nested-highlight.png` (the list in aqua, with a nested highlight).
**Not captured in the built app:** the editor mid-scroll with its thin bar, and a built-app picture of a second Codex colour. The bar is covered by preview tests (it appears while scrolling, is gone after, and does not fade under reduced motion); the colour setting by preview tests on both sides. Kenny's check covers both in the real app.

## Hold points

- **H1** hit after commit 1 and resolved in decision 64.
- **The folder-note duplicate** was reproduced before commit 4, as ruled (decision 65): the app did list the note twice.
- No core, disk-format, close-path, Rust, dependency or keyboard/screen-reader hold was hit.

## Surprising

- **The duplicate came from the data.** The fixture's folder lists its own note in its `order`; the plugin never writes that (see `docs/look-2.md` §7).
- **`npm run test:look` needed new reference widths.** It measured the Codex list at 13 px; the list is 16 px, so the references were scaled (33 px for "Jane", 58 for "Harbour"). "Jane" tells SN Pro from the system font; "Harbour" (58 against about 60) is within the check's 2.5 px tolerance of both, so it adds little. The other surfaces are unchanged.
- **Aqua and the green titles are close in hue.** With aqua chosen the Codex list and the accent-green titles above it are hard to tell apart. Kenny's call.
- **An unexpected snag in a test:** a 1 px splitter can't be hovered by Playwright's `hover()` (it timed out); the test moves the real mouse to it instead.

## Tests

`npm test` 1,601; `npm run test:ui` 334 passed, 1 skipped (as before); the new preview suites are `scrollbars`, `dividers`, `codexlook` and `titles`, plus `codexFolderNote` and the settings cases in `npm test`; `cargo test --workspace` passes; `npm run test:look` passes on the 1.3.0 build. `test:quit` was not needed: the close path is untouched. The `test:cover` and `test:typing` scripts were not run, as nothing they cover changed.

## Kenny's check, in the built app, on a copy of a project

Brief 11 (§5):
1. Scroll a long chapter and a long Codex list: no bars at rest, a thin one while scrolling.
2. Look over the whole window for dividing lines, and resize the panels (mouse and keyboard).
3. In both Codex lists: a folder-note, nested highlights, hovering, and the new text size.
4. Change the Codex colour in settings, and back.
5. The novel title and project name in green (storytelling side).

Brief 10's (decision 63: not done; it covers the same areas):
6. Write a paragraph with bold, italic and `ð þ ƿ ȝ` in a chapter and judge the font.
7. Open and close folders in both Codex lists, by clicking the icon and with the keyboard.
8. Create a folder and a note from the strip on each side.
9. Open a Codex note in the context panel; resize the panel; close the note.
10. Use the special-characters button in the chapter, the context panel's note and a plot note.

## Definition of done: where it stands

- [x] Commits 1 to 8 on `look-2`, each passing.
- [ ] Merged to `main`, pushed, tagged `v1.3.0`, branch deleted: waits for Kenny's check.
- [x] Everything in §3 works, in the built app where the script reaches it, and in the preview tests on both sides.
- [x] No disk change beyond the one preference key; no core or close-path change; no network, Rust command or dependency.
- [x] Keyboard and screen-reader access intact (tested: the strip, the splitter, scrolling, the list's name).
- [ ] Kenny's check: done, or recorded as waived.
