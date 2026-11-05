# Brief 17: the colour round (decision 122)

H1: a short survey and a mock-up. Read only; nothing in `src/` has changed. Branch `looks`, from `main` at `v1.9.0`. This is reported together with `docs/type-styles.md` (Brief 18), at one stop (decision 124).
Mock-up: `docs/colours-mockups/` (`mockup.html`, a throwaway page that borrows the app's theme and the proposed tokens; `colours-mockup-top.png` and `-bottom.png`; and three small WebKit experiments).

## 1. The focused-selection bug

- **Measured in the preview** (WebKit, the chapter editor, ⌘A): focused, `.cm-selectionBackground` is `rgb(215, 212, 240)` = `#d7d4f0`; unfocused it is `rgb(92, 63, 79)` = the app's own `--purpose-selection`. So it is the wrong way round: the app's colour shows only without focus.
- **Why:** CodeMirror's base theme has `&light.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground { background: #d7d4f0 }` (the editor isn't declared dark). The app's rule, `.sf-editor .cm-focused .cm-selectionBackground` (`editor.css:47`, and the same in `context.css:23` and `overviews.css:53`), has three classes against CodeMirror's five plus its generated scope class, so CodeMirror wins whenever the editor has focus.
- **The fix:** state the app's rule with the same path and the surface's class in front (for example `.sf-editor .cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground`), so it outweighs CodeMirror's in all three surfaces; unfocused (`.cm-editor:not(.cm-focused)`) it takes `bg2`. A regression test measures the computed colour with focus in each surface.

## 2. The browser's own selection without focus (WebKit)

Three small experiments, pictures in `docs/colours-mockups/webkit-*.png` (a text box, an editable div, plain page text, each with `::selection` set to the plum):
- **Page text** (not editable) draws its selection with `::selection` whatever has focus (`webkit-page-text-selection.png`).
- **A text box** that loses focus **draws no selection at all** (`webkit-input-selection-blurred.png`): there is no grey to colour. So "neutral bg2 without focus" has nothing to apply to for the Settings boxes and the rename box; it applies to the CodeMirror surfaces (which draw their own selection layer) and to page text when the window is inactive.
- **Proposal:** `::selection { background: <chosen colour> }` (as now, from the setting) and `::selection:window-inactive { background: bg2 }` (WebKit supports the pseudo-class). I **could not prove `:window-inactive`** here: Playwright can't deactivate a window. It will be checked in the built app at Kenny's look.

## 3. Find matches

Proposed (picture: the "find" row of the mock-up): every match a `bg2` fill with a 1 px dashed muted outline; the current match the same fill with a 2 px **orange** outline. Distinct from the selection (a solid colour fill with no outline), from highlights (solid fill, dark text) and the current from the rest. One note: orange is also one of the five highlight colours, but a highlight is a fill and this is an outline, so they don't read alike; if Kenny prefers, the outline can be the accent green.

## 4. `==highlight==`: Obsidian's rules

**Not verified, and I'd rather say so.** I have no network and no Obsidian here, and the formatForge plugin has no `==` parser to read. What I can propose is the common rule set (markdown-it's `mark`, which Obsidian's behaves like in the cases I know): inline only, never across a blank line; non-empty; the opening `==` is not followed by a space and the closing not preceded by one; not inside code, a link target or a comment; `===` and a lone `==` don't open one; emphasis may sit inside, touching or nested.
**A request for Kenny:** please try these in Obsidian and tell me what it draws, and I will match it exactly (they are also the tests): `==a b==`, `== a b ==`, `==a==b==`, `==a\n\nb==` (across a paragraph), `==**a**==`, `**==a==**`, `` `==a==` ``, `==a *b* c==`, `===a===`.

## 5. A selection over a highlight

CodeMirror draws the selection in a layer **behind** the text; a highlight is a solid background on the text, so it sits above the selection and hides it (option C in the mock-up).
- **Option A (recommended):** the dressing splits the highlight at the selection's edges (it already re-runs on selection changes, since it hides markers on the caret's line); the selected part loses its fill and its dark text, so the selection layer shows and the text is `fg`. The highlight "opens" under the selection, as in the mock-up.
- **Option B:** the highlight keeps its fill, and the selection shows as a 3 px underline in the selection colour. Keeps the colour, but a selection is then easy to miss and the selection colour setting reads weakly.

## 6. The dressing in the field editors

The plot note, synopsis and description are small CodeMirror editors (`overviews/fieldCommitter.ts`); adding `prose()` is the same extension the chapter editor and the context panel's text already run.
- It is **display only** (decorations): the document, the caret, line wrapping, undo, the typing aids and `FieldState`'s compare-then-write do not change.
- What changes for the author: the `*` and `==` markers are hidden away from the caret's line, so text on other lines is slightly narrower than the raw text; a line may wrap differently from when the caret was on it (as in the chapter). Nothing to ask for.
- A test proves a field's saved text is byte-identical with and without the dressing.

## 7. Every notice, placed

(`src/ui/editor/saveNotices.ts`, `model.ts`, `menu.ts`, `settings.ts`, `cover.ts` and the others; 32 call sites.) All sit in the brief's kinds; **nothing is unplaced.**
- **Error:** the save conflict, refusal and error notices; the recovery-failed one (pinned); "changed on disk while you had unsaved text"; the field save problems; "the cover image was saved, but could not be recorded"; "Could not …" from `guard`, Codex actions and the new-order save; "Could not open …"; "Could not show the file in Finder"; "The cover of … could not be shown"; "Writing sessions couldn't be saved".
- **Warning:** "Open a project first."; the read-only refusals; "This project has no novel yet."; "That item isn't showing…"; the read-only project notice (sticky); the newer-format notice (sticky; red edge becomes yellow); "The backup before saving … failed" (sticky); the settings file unreadable or gone; "not a storyForge project"; the duplicate heading; the typing-settings refusals.
- **Information:** "… had mixed line endings, so they were made consistent."; "Changed … It had been changed to …" (decision 99); offers such as "Stop correcting…?".
- **Success:** "Backed up N files to …".
- **The notices' buttons** (Reveal, Dismiss, Close and Reopen, Stop correcting) are quiet buttons in `grey2` (`--purpose-text-muted`). Measured on each tint: **3.62 (error), 3.13 (warning), 3.10 (information), 3.08 (success)**, all under 4.5. **Proposal:** the buttons' text takes `fg` inside a notice (5.23, 4.51, 4.47, 4.45, the same as the notices' own text, so no new exception is created). The picture shows them in `fg`.
- **A value to confirm:** the four tint colours are not in the theme file yet. Yellow `#55544a`, green `#48584e` and blue `#3f5865` (and `bg_visual` `#5c3f4f`) reproduce every figure in the brief exactly. For `bg_red` I worked back from the brief's two figures (fg 5.17, edge 3.19) and `#59464c` is a value that reproduces both; **please confirm it against the palette** (it isn't in the repo and I can't reach it).

## 8. The key names

Existing colour keys in `project.md`: `data-colour`, `codex-colour` (British `colour`, a role name). The five new ones follow: `selection-colour`, `highlight-colour`, `bold-colour`, `italic-colour`, `bold-italic-colour`. Confirmed: no clash with an existing key.

## 9. The mock-up

`docs/colours-mockups/colours-mockup-top.png` and `colours-mockup-bottom.png` (from `mockup.html`), drawn with the app's theme (not the real editor, which can't show settings that don't exist yet): the chapter editor's paragraph with bold, italic, bold italic and a highlight and a selection across it, in each of the five selection colours, and unfocused; the highlight in its five colours; emphasis in colours; a find in progress; the three ways of a selection over a highlight; the plot note with the dressing; one notice of each kind, sticky and transient, with **stand-in icons** (outline circle with a mark, a triangle, an information circle, a tick); the read-only banner in `fg`; an invalid size box; and the Appearance page's Text colours group with its sample line.

## 10. Questions for Kenny

1. **`bg_red`:** is `#59464c` right? (§7)
2. **Highlight and selection:** option A (recommended), or B? (§5)
3. **Find matches:** the orange outline for the current match, or the accent green? (§3)
4. **Obsidian's `==` rules:** please try the nine cases in §4 and tell me what it does.
5. **The notices' buttons in `fg`** (§7): yes?
6. **The four notice icons (H2):** please send them. The stand-ins in the mock-up are mine; the commit that puts yours in waits for them.

## 11. As built (1.10.0)

The H1 rulings (decision 125): `bg_red` is `#59464c` (confirmed against Everforest's published Soft Dark palette); a selection over a highlight is option A; the current find match has an orange outline; the notices' buttons are in `fg`; Kenny's four notice icons are used (no stand-ins); the Obsidian `==` results are pending (only the plain `==x==` is confirmed), so the other rules are the proposed ones, marked unconfirmed.

- **Commits:** the tokens and purposes; the selection, find look and the five settings with their Settings group; `==highlight==`; the emphasis colours; the field editors' dressing; the four kinds of notice with the banner and invalid-box fixes; the icons' licence line; these docs. The version and the changelog are in Brief 18's last commit (decision 124).
- **A change from the H1:** the unfocused grey for page text and text boxes uses `html[data-window="inactive"] ::selection` (the app sets `data-window` from the window's focus and blur), **not** WebKit's `::selection:window-inactive`: the production CSS minifier (lightningcss) rejects that pseudo-class, and the release-build test caught it. To be checked in the built app at Kenny's look: a selection while the window isn't active.
- **Which surfaces draw which selection:** the chapter editor and Codex notes draw CodeMirror's selection layer (the bug was there; fixed and measured). The context panel's read-only text also draws CodeMirror's layer. The plot note, synopsis and description have no layer (no `drawSelection`) and use the browser's own selection, which already took `::selection`; a blurred text box draws no selection at all in WebKit.
- **Find:** `.cm-searchMatch` is a bg2 fill with a 1 px dashed `grey1` outline, `.cm-searchMatch-selected` a 2 px orange outline.
- **Settings:** `SELECTION_COLOURS`, `HIGHLIGHT_COLOURS`, `EMPHASIS_COLOURS` in `app/settings.ts`; the page gets `data-selection-colour`, `data-highlight-colour`, `data-bold-colour`, `data-italic-colour` and `data-bold-italic-colour`, mapped to purposes in `theme/purposes.css`.
- **Highlight rules (unconfirmed):** one line; the opening `==` not preceded or followed by `=` and not followed by a space; the closing not preceded by a space and not followed by `=`; non-empty; neither marker inside code, a link or a URL; no nesting. Tested in `dressing.test.ts`; to be matched to Kenny's Obsidian results.
- **Notices:** every one of the 32 call sites has a kind, found by making `kind` required. Placed as in §7; none was left over. The icon names are Error, Warning, Information and Done. Two behaviours changed by intent and their tests were updated to pick a notice by its text: the "cover could not be shown" notice is an error, so an alert (the fixtures' own cover files raise it), and non-sticky warnings are `status`.
- **Not tested as a built app:** the notices, selections and dressing are tested in the WebKit preview; the built-app scripts `test:settings-sync`, `test:typing` and `test:look` run in the sweep.
