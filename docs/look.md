# The look, round one (Brief 10): the survey

Status: **Hold point H1.** Nothing is implemented. This is the survey the brief asks for (§2), with proposals and the questions that need Kenny's ruling. Branch `look`, from `main` at `31d4772` (v1.1.0 is tagged and pushed). The Fix 4 follow-ups (decision 55) were accepted.

## 0. Things to settle before anything else

| # | Item | Why it matters |
|---|---|---|
| A | **The upright font file looks like the combined file.** The file named `SNPro-Variable.woff2` has axes `wght 200–900` **and `slnt −3–0`**, and carries italic named instances ("Thin Italic" … "Black Italic"). `SNPro-VariableItalic.woff2` is a different file: `wght` only, italic angle −9°, italic style bit set, so a real italic. The brief asks for `SNPro-VariableRegular` and says not to use the combined file. | Please confirm whether `SNPro-Variable.woff2` is the file you meant, or send `SNPro-VariableRegular.woff2`. I have **not** copied either into the repo. If the combined file is the only one available, it can still be made to draw upright (`slnt` stays at its default of 0, the italic comes from the other file), but its italic notes say it's unreliable in WebKit, so I would rather use the proper one. |
| B | **Four of the twelve starting characters are missing from SN Pro** (§1). | You decide what happens (§1.2). |
| C | **The arrow keys are already used in the Codex list** (§2.7). | The brief's → and ← collide with today's keyboard reordering. |
| D | **Licence file names.** The brief says "the licences file"; the repo has `Icon Licences.md` and `Theme Licences.md`. | Proposed: a new `Font Licences.md` in the same style, plus the OFL text shipped as `OFL.txt` in the app. |

Also owed from decision 50 (the earlier reload check): see the last section.

## 1. The font's coverage

Read from both files' own character maps (fontTools 4.60.2, run from a scratch virtual environment outside the repo; no dependency added). Both files are identical in coverage: 1,183 glyphs, 979 mapped characters.

### 1.1 What the files are

| | `SNPro-Variable.woff2` | `SNPro-VariableItalic.woff2` |
|---|---|---|
| Axes | `wght 200–900` (default 200), `slnt −3–0` | `wght 200–900` (default 200) |
| Real italic? | No (upright; the `slnt` axis is a slight slant) | **Yes**: italic angle −9°, italic bit set, STAT `ital` axis |
| Full weight axis? | **Yes**, Thin (200) to Black (900) | **Yes** |
| Layout features | `liga`, `calt`, `ss01`–`ss03`, `case`, `frac`, `onum`, `tnum`, `pnum`, `sups`, `subs`, … | the same |

Two practical points. The weight axis's default is 200 (Thin), so the `@font-face` rule must declare `font-weight: 200 900`, or the body would draw thin. And WebKit draws the italic from the italic file only if each file has its own `@font-face` rule (`font-style: normal` and `italic`), which is what the screenshots in this survey do; the page's own font check reported both faces `loaded`, so nothing was synthesised.

### 1.2 The coverage table

**Present** (both files): `æ Æ œ Œ ð Ð þ Þ` and all of the typing aids' output, `‘ ’ “ ” – — …`. All of Latin-1 (96 of 96). Also `ʒ ǽ ā ē ī ō ū ȳ ẽ § † ‡ • ° ½ × ·`.

| Character | Code point | In SN Pro? | Where it matters |
|---|---|---|---|
| **ƿ** (wynn) | U+01BF | **No** | Old English group in settings |
| **Ƿ** | U+01F7 | **No** | same |
| **ȝ** (yogh) | U+021D | **No** | same |
| **Ȝ** | U+021C | **No** | same |
| ſ (long s) | U+017F | No | Early Modern English |
| ĳ (ij ligature) | U+0133 | No | Dutch names |
| ĺ | U+013A | No | rare |
| ǣ, ǭ | U+01E3, U+01ED | No | Old English with macrons |
| ‑ (non-breaking hyphen) | U+2011 | No | rare |

| Block | Present | Missing |
|---|---|---|
| Latin-1 Supplement, U+00A0–00FF | 96 of 96 | none |
| Latin Extended-A, U+0100–017F | 125 of 128 | `ĳ` U+0133, `ĺ` U+013A, `ſ` U+017F |
| Latin Extended-B, U+0180–024F | 76 of 208 | 132: see below |
| Latin Extended Additional, U+1E00–1EFF | 164 of 256 | 92 |
| Combining marks, U+0300–036F | 26 of 112 | 86 |

The Latin Extended-B gap is large, but it is mostly African, Pinyin, IPA-adjacent and archaic letters. The ones a fantasy or historical writer might type are the four above, `ǣ`, `ǭ`, and some Pinyin vowels (`ǎ` and `ǔ` are in; `ǐ`, `ǒ` and the tone-marked `ǖ ǘ ǚ ǜ` are not). The full list of the 132 is in the scratch output of the tool; I can put it in this file if you want it.

**Don't work around a gap, you decide.** The four Old English letters are in the app's own "Old English" group in settings (`src/core/typing/defaults.ts`), so the app already offers characters its new font does not have. If left alone, WebKit falls back, per character, to the next font in the list. In the screenshot below that is visible: the italic `ƿ` and `ȝ` are drawn by a different, smaller face. Options:

1. **Accept the system fallback** and say so in `docs/look.md` and in the settings text beside the Old English group ("drawn in a different font"). Smallest change; the glyphs are always drawn, just not in SN Pro. *(My recommendation for round one.)*
2. **Name the fallback**: SN Pro, then the system serif (`ui-serif`, New York), so the four letters at least come from a face with the right feel, rather than whatever the system picks. Same effort as 1, more predictable. Could be combined with 1.
3. **Ship a second font** that has them (an OFL font with Old English letters). A new asset, and its licence, and the "font is used unmodified" rule applies to it too. Needs a ruling, and a hunt for a font that matches SN Pro's weight.
4. **Take the four letters out of the starting group** until a font has them. This changes decision 46's list; I'd not do this without being asked.

The same choice covers `ſ`, `ĳ`, `ǣ` and `ǭ`, should they appear in a name.

## 2. The plugin's Codex list (`plugin-harness-final`)

Read from `src/view/BottomPanel.ts`, `src/view/dragReorderTree.ts`, `src/view/inlineRename.ts`, `src/codex.ts`, `src/view/StoryForgeView.ts` and `styles.css`.

### 2.1 Names and icons
Each row is a flex line of `[ name ][ icon ]`: the name is created first, then the icon after it (`.sf-codex-row-content`, gap 4 px). A folder shows a generic folder icon; a **Lore folder** (a folder that is also a note) shows a folder icon *and then* its type icon. A file shows its type icon (none if it has no type). The name has `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` and `min-width: 0`; the icon has `margin-left: 6px` and does not shrink, so **a long name is cut with "…" and the icon stays**. The brief's rule is what the plugin did.
Indent is 10 px per level, applied inside the row so the row's hover fill spans the full width.

The plugin's CSS still contained a chevron (a rotating triangle), but `BottomPanel.ts` no longer created one. The final plugin list had **no chevrons**.

### 2.2 Folder lines
- A folder's children sit in `.sf-codex-folder-children`. Open folders draw a vertical guide line (`.sf-codex-folder-indicator`, 2 px, absolutely positioned at the content's left edge, with a rounded foot), nested folders draw nested lines.
- A closed folder's children are not rendered, so there is no line.
- **An open empty folder** draws no line (the line is added only "when there's something under it"). With no chevron, an **open empty folder looks exactly like a closed one**.
- Colour: the plugin used theme variables; the brief asks for a decoration grey.

### 2.3 Opening and closing
Click toggles a plain folder. For a Lore folder, clicking the **folder icon** toggles and clicking anywhere else opens its note. Click handling was bound to pointerdown/up (not `click`) because Obsidian swallowed the first click in an unfocused sidebar; not needed in the app. Open/closed state is kept per computer (`collapsedCodexFolderIds`), which maps to the app's machine settings (`model.nav.collapsedCodex`), so decision 23 holds.

### 2.4 Keyboard and screen readers
- Rows had `tabindex="0"` and `aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"`. **The arrows moved items**: ↑/↓ reorder among siblings, ← outdents to the grandparent, → nests into the previous sibling if it is a folder.
- **There was no keyboard way to open or close a folder, or to open a note** (no Enter or Space on a row), and no tree role, no `aria-expanded`, no `role="group"`. The only state announcement was an `aria-label` of "expand folder" or "collapse folder" on the folder's icon.
- The strip's buttons were spans made accessible with `tabindex 0`, `role="button"` and Enter/Space.

The app's list is already better: `role="tree"`, `role="treeitem"`, `aria-expanded` on folders and `role="group"` on children, with chevron icons that are `aria-hidden`.

### 2.5 The strip
`.sf-codex-side-actions`, a rail at the left edge of the pane, **New Folder on top, New Note beneath** (the order in the brief). Icons: folder-plus and plus-square. The tree is inset to the right of it (`--sf-codex-rail-inset`, about 40 px). The app's list today has these two buttons in a *header* on the storytelling side only (the order there is file then folder), and nothing on the library side.

### 2.6 Creating
- **New Folder:** a virtual folder named "New Folder" (made unique, "New Folder 2" and so on), appended to the **end of the target folder** (or the root). **Nothing opens, and the name is not typed in place**: you rename afterwards (the row's own inline rename, double-click or its context menu).
- **New Note:** a real file "New Note.md" (unique too), appended to the end of the target, and opened straight away (in the context panel when storytelling, otherwise the main leaf). **Not typed in place** either.
- **The target folder** is the last folder row you clicked (`activeCodexFolderId`), or the root if there isn't one or it has since gone. A later click on a *note* does not change it. The app copies this (`targetFolder` in `src/ui/faces/codexTree.ts`, a module variable, so both sides share it).
- One quirk worth fixing: the target is set when you click a folder to **close** it, so a new item can be made inside a closed folder and then can't be seen. The note opens; a new folder just seems not to have been made.

### 2.7 Where the app follows the plugin, and where it can't

| Matter | Plugin | Proposal |
|---|---|---|
| No chevrons, icon after name, truncation with icon kept | yes | Follow. |
| Guide lines, nested, open folders only | yes | Follow. Decoration grey from `grey0`/`grey1`, never for text. |
| Strip order, folder then note, on the left edge | yes | Follow, on both sides. |
| Target folder | last folder clicked, else root | Follow, **but open the target folder when something is created into it** so the new thing is visible. A small difference. |
| Name typed in place after creating | **no** | Follow (don't), unless you want it. Making it so is cheap with the existing inline rename, and nicer than "New Note 3"; **Question 3**. |
| An open empty folder | looks like a closed one | **Question 1.** |
| ←/→ open and close | no, they reorder | **Question 2.** |
| Screen reader | icon label only | Follow the app's existing tree roles, and add a spoken name that includes open/closed. Better than the plugin. |
| Reorder by drag, rename, set type, archive | yes | Kept as the app has them. |

**Question 1: an open empty folder.** Options: (a) show nothing, as the plugin did (the screen reader still says "open"); (b) show a short grey line with no text (a stub, so it reads as open); (c) show a faint "Empty" line, the guide line beside it. I recommend **(c)**: it is the only choice a sighted reader can't mistake, it stays out of the way, and it's one muted line. Whichever you choose, the folder's icon doesn't change.

**Question 2: the arrow keys.** The tree's keyboard reordering already uses ↑ ↓ ← → (shared with the plugin through `src/view/dragReorderTree.ts`), so I can't give → and ← the new meaning without moving it. Proposed, following the standard tree pattern: ↑ ↓ move between rows; → opens a closed folder (an open one moves to its first child); ← closes an open folder (or goes to the parent); Return opens a note or toggles a folder; **reordering moves to Option+arrows** (⌥↑ ⌥↓ move, ⌥← outdent, ⌥→ nest), with `aria-keyshortcuts` updated. No existing test uses the old keys (checked), but it is a visible change for anyone who used them. **Needs your ruling.**

**Question 3: name in place.** Should a new folder or note go straight into rename (its text selected), so you type the name at once? I'd recommend yes for the folder, and for a note too (the note has already opened, so you'd be typing the name in the list and then moving to the note; Escape keeps "New Note"). It is a difference from the plugin, so it's yours to decide.

## 3. Size and line height

18 px at 1.65 was chosen for New York (decision 26). SN Pro is a sans-serif with a larger x-height, so it looks larger at the same pixel size.

**Proposal: 17 px at 1.6**, with one size either side (16 and 18, same line height) and the current New York for comparison. All shots are WebKit, 2× resolution, at the app's real measure (`38em`) and the app's own dark palette, built from the upright and italic files with ligatures off, and include bold, italic, `ð þ ƿ ȝ`, curly quotes, dashes, an ellipsis, the capitals `Æ Þ Ð`, and the ligature check line. They are standalone pages, not the app: the font isn't wired in yet. The **built app** check is H2.

| Shot | File |
|---|---|
| New York 18 / 1.65 (today) | `docs/look-shots/newyork-18-1.65.png` |
| SN Pro 16 / 1.6 | `docs/look-shots/snpro-16-1.6.png` |
| **SN Pro 17 / 1.6 (proposal)** | `docs/look-shots/snpro-17-1.6.png` |
| SN Pro 18 / 1.6 | `docs/look-shots/snpro-18-1.6.png` |
| Ligatures on and off | `docs/look-shots/ligatures.png` |

What the shots show. At 17 px the line of text is about the same width as New York at 18 px (the measure is in `em`, so it follows the size), and the letters look similar in size to New York's (judge by eye; that's what the shots are for). The italic is a true italic (the `a` changes shape), bold comes from the weight axis. `ƿ` and `ȝ` are drawn by a fallback face: small and out of weight with the line around them, which is the gap in §1. The ligature page confirms the brief's worry: with the defaults, `->`, `=>` and `<-` become arrows and `✓✓` is joined; with `font-variant-ligatures: none` and `font-feature-settings: "liga" 0, "calt" 0` they are drawn as typed.

The Codex note in the context panel and the three fields would use the same family, with the panel's own size (those are smaller today; I'd keep their relative sizes, so a proportional step down from the chapter). The editor styles are already variables (`--font-prose`, `--prose-size`, `--prose-line`), so the change is small. Heading sizes in a note are in `em`, so they follow.

## 4. The security policy

`src-tauri/tauri.conf.json` today:

```
default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'
```

There is no `font-src`, so fonts fall back to `default-src 'self'`, which already allows fonts **from the app itself**. So **no change is needed to load the files**. I would still add `font-src 'self'` as an explicit statement of the policy, and add a test that keeps it in step (like the `img-src` one), because the brief allows exactly that rule and "fonts from the app" is easier to audit when it is written down. The change would be to insert `font-src 'self'; ` before `img-src`. That is the whole change; nothing wider. **I can only say it works once the built app has loaded the font** (the cover bug's lesson): that check is in the plan for commit 2.

## 5. How the special-characters button tracks "where the cursor last was"

(Decision 37 changes; docs/typing-aids.md §7 is the current description.)

- Today the button lives in the context panel's corner, shows only while the panel is blank, and targets the centre chapter (`model.editors.insertAtCursor` / `insertState`).
- **Proposed:** one small piece of state in the editor host, `lastWriting`, set **whenever any of the writing editors gains focus**: the chapter editor, a Codex note editor (either slot), or one of the field editors (plot note, synopsis, description). It stores *which editor* (a handle, not a path), not a position: the CodeMirror state keeps each editor's own selection, so "where the cursor last was" is the editor's selection at that moment, and it remains correct if focus has gone elsewhere (the button, a menu).
- **Insertion:** the host asks that editor to insert at its current selection (replacing it), as typing: `userEvent: "input.type"`, the same path as keystrokes, so the prose writer and the session recorder see it as typing in a chapter (never as a paste), a field's `FieldState` sees it as the author's text and `commitOnClose` is unaffected, and one ⌘Z undoes it. Afterwards the host focuses that editor with the caret after the character.
- **Not taking focus:** the button keeps `mousedown` default-prevented (as now), so clicking it never blurs a field, so a field isn't committed just by a click. Keyboard focus on the button does leave the field (unavoidable and fine, as the brief says); the field's own commit-on-blur is then as normal, and focus returns.
- **Greyed out** when `lastWriting` is: gone (the editor was destroyed, or its note was closed or its field's card unmounted: the handle reports `isConnected` false), covered by an overview (the editor is `inert`, which is what decision 36 uses), read-only (archived or a read-only project).
- **Before any editor has been focused:** target the open chapter if it is visible (not covered) and editable; otherwise greyed.
- The button moves to the new bottom row (§3.3) and is shown always, whether or not a note is open, so `mountCharactersButton` no longer depends on the lore panel being blank.

Risk to watch: the field editors are mounted and unmounted when the overview redraws. The handle must be dropped on unmount (an architecture-test-able rule) so the button can't insert into a ghost.

## 6. The plan, with what H2 needs

Commit 2 (SN Pro): the two files and `SNPro-OFL.txt` (as `OFL.txt` beside them) under an assets folder served by the app, `@font-face` rules for upright and italic with `font-weight: 200 900`, `font-display: block` so there is no flash of the fallback, `font-synthesis: none` on every SN Pro surface (WebKit must never fake a slant or bold), `font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0, "ss01" 0` in editors and fields, the CSP line, the licence entry, and a test of each: the font loaded in each surface, ligatures off, no network request. `font-family: "SN Pro"` then the system serif (per §1, option 2 if you pick it). Bundling `OFL.txt` with the app needs a resource entry in `tauri.conf.json`, not a command.

Open questions for you, in the order they'll bite:

1. Is `SNPro-Variable.woff2` the file you meant (§0 A)?
2. The four missing Old English letters, and the others: which option (§1.2)?
3. Open empty folder: (a), (b) or (c) (§2.7)?
4. Arrow keys: reordering to Option+arrows (§2.7)?
5. New items typed in place (§2.7)?
6. 17 px / 1.6 as the proposal, or 16 or 18 (§3)? (The final choice is at H2, in the built app.)
7. Open the target folder on create, so the new thing shows (§2.6)?

## 7. The line owed from decision 50

The "earlier read of your running app" (the reload check): in that session nothing of yours was read. The only contact was `pgrep -ix storyforge`, then a single `ps` of the command line of PID 10252, a process I did not start, to see that it was running and where from. I did not look at its windows, accessibility tree, files or data folder, and I left it alone until you quit it. That is within what you confirmed today.

## 8. Rulings at H1 (decision 56)

1. **Fonts:** `SNPro-VariableRegular` with `SNPro-VariableItalic`, unmodified, with `OFL.txt`, recorded in `Font Licences.md`. The combined `SNPro-Variable` is not used. (`SNPro-VariableRegular.woff2` was checked: `wght` axis only, 200–900, no `slnt`.)
2. **Missing characters:** `ƿ Ƿ ȝ Ȝ` stay in the starting set. **No fallback is named yet; Kenny will choose.** Until then **whatever the Mac substitutes is temporary** (the font stack is `"SN Pro"` then the system sans-serif, nothing more). Candidates are found among the Mac's built-in fonts and shown in the built app at H2 (§9). A second shipped font only if no built-in candidate works.
3. **An open empty folder:** a faint "Empty" line in muted text (`grey2`), announced as empty to screen readers (commit 3).
4. **Keyboard:** ↑ ↓ move, → opens or goes in, ← closes or goes to the parent, Return opens or closes. Reordering moves to ⌥ plus the arrows, named in the tooltips and docs (commit 3).
5. **Name in place:** a new folder or note is named in place straight away; the file or folder is created only when the name is confirmed, Escape cancels and creates nothing (nothing is created as "Untitled" and renamed, which would trigger the link rewrite). The rename rules apply (refused characters, collisions). No typing aids in the box (commit 3).
6. **Size:** 17 px at 1.6, provisionally. H2 is the first real check.
7. **Creating into a closed folder opens it.** New items go at the end of the last folder clicked.
8. **Security policy:** `font-src 'self'` added, with a test, proved in the built app.
9. **The button:** remembers the last-focused editor (not a position); greyed out when that editor is covered, read-only or gone (commit 6).

## 9. As built, commit 2 (SN Pro)

- **Files:** `src/ui/theme/fonts/SNPro-VariableRegular.woff2`, `SNPro-VariableItalic.woff2`, `OFL.txt`; `src/ui/theme/fonts.css` declares both faces (`font-weight: 200 900`, `font-display: block`). Vite emits them as hashed files in the app's `assets/`; `OFL.txt` is also a bundle resource (it is in `storyForge.app/Contents/Resources/`).
- **Where:** `--font-prose` is now `"SN Pro", var(--font-ui)`, used by the chapter and Codex-note editors, the plot-note, synopsis and description fields, and the Codex list (`.sf-codex-tree`). Everything else keeps the system sans-serif. `--prose-size` is 17 px and `--prose-line` 1.6.
- **Rules on those surfaces:** `font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0, "ss01" 0; font-synthesis: none`.
- **Policy:** `font-src 'self'` inserted before `img-src`; nothing else changed. The old policy had no `font-src` (fonts fell back to `default-src 'self'`), so this states the rule rather than widening it.
- **Tests:** `test/tauriConfig.test.ts` (font-src, the two files, the weight range, the licence and the resource); `test/releaseBuild.test.ts` (both font files are in the production bundle, the candidates panel is not); `test/ui/look.ui.ts` (7 WebKit tests: both faces load from the app and no request leaves it; the chapter and a Codex note at 17 px / 1.6 with ligatures off; the Codex list on both sides; the three fields; the rest of the interface unchanged); `npm run test:look` (the built app).
- **`npm run test:look`** starts the built app on a fixture copy with a temporary HOME and reads, through accessibility, the width each line really takes: ten `w` are 137 px in SN Pro and 127 in the system font at 17 px (163 for eleven in italic, where the system font does not change), 105 and 100 at 13 px, and `Jane` is 27 px against 29. The widths are measured from the shipped files in WebKit. It uses **one real mouse click** (`cliclick`, on a Codex row, which answers only to pointer events) until commit 3 makes Return open a row.
- **Typing test change:** the "near the window edge" test now fills a line with `x ` units instead of `abcd `, because it assumed how wide the old font's letters were (with SN Pro `~th` wrapped to a new line before the popup was measured).
- **Fallback candidates (decision 56, item 2).** The Mac's built-in fonts containing `ƿ Ƿ ȝ Ȝ ǣ` were found and shown in the built app (a local-only panel, now removed; the picture is `docs/look-shots/built/font-candidates.png`): Arial, Tahoma, Geneva, Lucida Grande, Microsoft Sans Serif, Times New Roman, Baskerville, Courier New. New York and San Francisco lack `ƿ Ƿ ȝ Ȝ`.

## 10. Rulings at H2 (decision 57) and as built, commit 3

**Rulings.** Commit 2 accepted. The fallback is **Arial**: the stack is `"SN Pro", Arial, <system sans-serif>`, so Arial draws only what SN Pro lacks (`ƿ Ƿ ȝ Ȝ ǣ` and the like). It is the only sans-serif candidate with a real italic and bold, which matters with synthesis off. **20 px at 1.6** for the chapter editor and Codex notes (workspace and context panel); the three fields (13 and 14 px) and the Codex list (13 px) keep their sizes. The dev-only candidates panel is **removed** (and its release-build test). `npm run test:look` uses the keyboard, not a click.

**The measure.** The editor's maximum width is `38em`, not pixels, so it follows the size: **646 px at 17 px and 760 px at 20 px, about 88 characters on a line at both** (measured in WebKit with SN Pro on running prose). The characters per line did not change; the column is 114 px wider. In the default window the centre column is narrower than that (about 450 px of text), so there the column, not the maximum, sets the line. Left as it was, as ruled.

**The Codex list, both sides** (`src/ui/faces/codexTree.ts`, `faces.css`; one list, mounted on both):
- No chevrons. The name comes first and the icon after it (a folder that is also a note: name, folder icon, type icon). A long name is cut with "…" and the icons never shrink.
- An open folder has a 2 px line (`--purpose-guide`, the decoration grey, never text) beside its contents; nested folders have nested lines; a closed folder has none. An open empty folder shows a faint **Empty** line in `--purpose-text-muted` (grey2) with the line beside it; to a screen reader it is a disabled tree item named "Empty folder".
- A proper tree: `role="tree"`, `treeitem` rows with `aria-level` and `aria-selected`, `aria-expanded` on folders only, `role="group"` around children. **One tab stop** (the row the keyboard was last on), kept across a redraw.
- **Keys:** ↑ ↓ move between rows, Home and End go to the first and last, → opens a closed folder or goes into an open one, ← closes an open folder or goes to the parent, Return (or Space) opens a note, or toggles a plain folder; on a folder that is also a note Return opens the note and → ← fold it. Clicking its folder icon folds it. **Reordering is ⌥ plus the arrows** (`aria-keyshortcuts`, and a tooltip on a keyboard-focused row: "⌥↑ ⌥↓ move this row, ⌥→ nest it, ⌥← bring it out"). The tooltip option `hover: false` was added to `attachTooltip`, so the hint shows on keyboard focus only.
- **Kept:** drag to reorder and nest, rename, the type picker, archive, convert to folder, and a second click closing the note on the storytelling side.
- Tests: `test/ui/codex.ui.ts` (10 tests on each side); two tests in `storytelling.ui.ts` follow the changes (the folder icon, not a chevron; ⌥↑ to reorder).
- **Not in this commit:** the strip's creation behaviour (naming in place, opening a closed target folder), which is commit 4. The existing buttons are unchanged.

**`npm run test:look`** now also reads the ink of wynn and yogh lines (put in the chapter on disk, because the keystroke tool types an "a" for a character like `ƿ`) and checks the italic line leans forward more than the upright one (3.4 px at 2× in the last run): Arial Italic is drawing them, not the upright (Arial's two have the same widths, so the slant is measured, not the width). Widths are for 20 px. It opens the Codex note with Return on a focused row: **no pointer is used**.

## 11. As built, commit 4 (the strip and naming in place)

- **The strip** (`codexTree.ts`, `faces.css`): a vertical toolbar of two quiet icon buttons at the left edge of the list, **New Folder above New Note**, with tooltips (also on keyboard focus), the accent focus ring, and ↑ ↓ moving between them. Both Codex lists use it, so it is on both sides; the buttons that used to sit in the pane's header are gone. Read-only projects disable both, with the reason as the tooltip.
- **Naming in place (decision 56, ruling 5):** the button puts a box at the end of the target folder (the last folder clicked or folded or unfolded from the keyboard, else the root), with the folder or note icon after it. **Nothing exists on disk until Return**; Escape creates nothing; a click elsewhere confirms a good name and otherwise creates nothing. So nothing is ever made as "New Note" and renamed, and no link rewrite is involved. The box is a plain input: **no typing aids** (decision 53).
- **The rules are the rename's:** a name must not be empty, must not contain `[ ] # ^ |` (`nameProblem`, the rename dialog's own), and, being a file name, must not contain `/ \ ? % * : | " < >` (a rename strips these quietly; here they are refused, so the name you confirm is the name you get). A note that is already there, found case and Unicode folded, refuses the name ("There is already a note called …"). A folder name only needs to be non-empty, as in a folder rename.
- **A closed target folder opens** when something is created into it, so the new thing shows.
- After a note is created it opens (context panel on the storytelling side, workspace on the library side); after a folder, the folder's row is focused.
- **One core change, additive:** `createCodexFolder(project, parent, name = "New Folder")` takes the name, so the folder is made with its real name rather than made and renamed. Its default is the old behaviour; nothing else in the core moved (a hold rule worth a ruling if you'd rather it did not).
- Tests: `test/ui/strip.ui.ts` (8 on each side); `storytelling.ui.ts`, `storyforge.ui.ts` and `codex.ui.ts` follow the new flow. `test:look` is unchanged and passes.

## 12. As built, commit 5 (the context panel's card and bottom row), and Kenny's icon rulings

- **The card:** with a note open, its editor pane is a card in the editor background (`--purpose-editor-bg`, the centre's own), 10 px radius, `overflow: hidden` so the corners clip the note, inside the panel's `bg_dim`. The margin on all four sides is `max(12px, 10%)` of the panel's width, as padding of the host (percentage padding is of the width even at the top and bottom), so it follows a resize. The note scrolls inside the card and its text wraps to the card's width. A read-only note keeps its banner inside the card. With no note open there is no card (the host is empty).
- **The bottom row** (`.sf-context-row`, 56 px at least) is below the host and always there; the card's bottom margin is measured from its top. The special-characters button sits at its right; its palette opens upwards. (The button still shows only while the panel is blank until commit 6.)
- **A fix found on the way:** in a read-only project the Codex list could not open notes at all, because the drag gesture that answers a click was not attached; a plain click handler now does it.
- **Icons (Kenny):** Tabler's filled folder is the Codex list's folder icon; Tabler's folder-plus and file-plus are the New Folder and New Note buttons (`Icon Licences.md`). **A note with no tag linked shows no icon.** A folder always shows its folder icon. **With the mouse a folder opens and closes only by its icon** (a folder that is also a note opens its note from the rest of the row); the keys are unchanged (Return toggles a plain folder). **Every icon sits next to the name, 1em after its end** (the name is only as wide as its text until it must be cut), with 6 px between a folder icon and a type icon.
- Tests: `test/ui/card.ui.ts` (7); `codex.ui.ts` and `strip.ui.ts` follow the icon rulings (the gap, no icon on an untagged note, the icon folds).
