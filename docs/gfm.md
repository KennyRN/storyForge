# Brief 20, H1: the survey and mock-up

Written 7 November 2026, on branch `gfm` (from `main` at `739fe14`). Read only: no source changed. Mock-up: `docs/gfm-mockups/index.html`, picture `docs/gfm-mockups/mockup.png`. **Kenny's rulings so far:** `@lezer/markdown` with `@codemirror/language` is approved (not `@codemirror/lang-markdown`); the conversion (§1.7) and its fuzzer are dropped, with a conversion or Obsidian importer to Future; alias matching stays in; IMPORTANT's tint `#544f5a` stands, subject to the mock-up; the NOTE and TIP contrasts are accepted as they are.

## 1. Obsidian-only syntax in the code

| Syntax | Where | What it does |
|---|---|---|
| `%% %%` | `ui/editor/dressing.ts` (`scanComments`) and `dressingView.ts`; `core/wordCount.ts` (regex strip); `core/linkScan.ts`; `core/typing/protectedText.ts`; `core/linkRewriter.ts` (doc comment) | dimmed, not counted, links inside never reported, typing aids skip it |
| `==x==` | `dressing.ts` (`scanHighlights`), `dressingView.ts`, the colour setting `highlight-colour`, its purpose, the selection rule of decision 130 | drawn as a highlight |
| `[[X]]`, `![[X]]` | `core/linkScan.ts` (forms `wikilink`, `embed`), `core/linkRewriter.ts` (rewrites them, with `#heading`, `#^block`, `\|display`), `typing/protectedText.ts` | recognised for rename and protected from the aids; **not dressed or clickable today** |
| callouts `> [!x]` | nowhere | no code at all |
| `[text](path.md)` | `linkScan.ts` (forms `markdown`, `markdown-embed`), `linkRewriter.ts` | already supported, URL-encoded spaces included |

- **The reconciler** (`core/reconciler.ts`) and `reconciliation.ts` touch **no prose and no link syntax**: they match files by name, id and path, and recover or prune backstage entries. The only link-shaped thing in them is `linked-folders` frontmatter, which is a list of folder ids. Nothing to change.
- **Codex references in frontmatter** are stored paths (a chapter's PoV and location lists, the default PoV), re-pointed by `rekeyCodexNoteReferences` on a path match. The one Obsidian trace is `linkRewriter.ts`, which lists unquoted `[[X]]` values (YAML reads them as a nested list) as "not rewritten", and its check that `[[` or `](` may appear in unreadable frontmatter. Both are about files from the plugin era; they can stay as a safety net or be dropped once Kenny says no such file exists.
- **What the app writes into new notes and chapters:** nothing with syntax. A new chapter is created empty (`book.ts` `createChapter`: `createFile(path, "")`), a new Codex note is `options.content ?? ""` (`codex.ts:407`), and `createProject` seeds only folders, the series file, one book, one empty chapter and the tag registry. **There is no welcome text.** The "Welcome" notes found in two vaults are Obsidian's own stock notes. Section writes add `## Synopsis` and `## Description` headings only.

## 2. Counts in Kenny's projects (read only)

| Project | Wiki links | Embeds | `%%` | `==` | Callouts | `](….md)` | `<!--` | Aliases |
|---|---|---|---|---|---|---|---|---|
| Project A (a novel) | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| Project B (a copy of a series) | 1 | 0 | 0 | 0 | 0 | 1 | 2 | 0 |
| forgeForge vault | 2 | 0 | 1 | 0 | 0 | 1 | 12 | 0 |
| storyForge test vault | 0 | 0 | 1 | 9 lines | 0 | 0 | 3 | 6 notes |

- **Every hit is Obsidian's stock text, a plugin's generated block, or a synthetic fixture.** None is the author's writing. The conversion is dropped (Kenny); the one stray `[[create a link]]` is fixed by hand.
- **The one `](….md)` link is a web URL** (`https://help.obsidian.md/Plugins/Importer`, in a copied vault's Welcome note), not a relative project link. It is not evidence of the relative form (§4).
- **Test-vault fixtures to update, not writing to protect:** `_story-library/aaa/ch-a1.md` (the nine `==` lines, with the tests of §1.5) and `ch-a2.md` (`%%a hidden comment%%`, with §1.6's tests). They go or become HTML-comment cases when those tests are retired; `fixtures/build.mjs` regenerates the synthetic ones. The six aliased notes (`Jane`, `Windows`, `Sam` (`aliases: Sammy`), `NoNewline`, `Zoë Åberg — 日本語`, and `Retired` with `aliases: []`) are the alias tests' material.

## 3. The parser

- **Today the dressing is hand-written line scanning** (`dressing.ts`, 225 lines; `dressingView.ts`, 135). There is no markdown parser in the project (`package.json` has only `@codemirror/commands`, `search`, `state`, `view`).
- **Proposal: `@lezer/markdown` plus `@codemirror/language`**, as approved. `@lezer/markdown` exports the `GFM` extension set (tables, task lists, strikethrough, autolinks) and the `Footnote`-less base. `@codemirror/language` supplies `syntaxTree`, `ensureSyntaxTree` and the parse scheduling. I found **no need for `lang-markdown`**: the dressing needs only the tree, not its keymap, its fenced-code language loading or its completions. A `@lezer/highlight` dependency isn't needed either, since the dressing makes its own decorations from node names.
- **Footnotes aren't in the GFM set.** Proposal: a small custom `MarkdownConfig` (about 40 lines): a block parser for `[^id]: text` lines (with 4-space continuation) and an inline parser for `[^id]`, giving two node types. Dressing: the reference as superscript-like text in the link colour, the definition's `[^id]:` marker muted. No behaviour (no jumping between them) in this brief.
- **Alerts aren't a parser feature.** Proposal: no parser change. The tree gives a `Blockquote`; the dressing checks that its **first line matches `^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$`** and, if so, draws the box. Anything else after `> [!` is the ordinary quote. This is a display rule over an unchanged tree, so nothing saved changes.
- **GitHub's rules for alerts** (read from GitHub's docs on 7 November 2026): five types, syntax as above, "a Markdown extension based on the blockquote syntax", and **"alerts cannot be nested within other elements"** (so an alert inside a list or another quote is not one; I'd match that: only a top-level blockquote counts). **Not stated by GitHub:** case sensitivity, text after the marker on its line, unknown types (the docs show only uppercase and always put text on the next line). *(Superseded by § 8: GitHub was probed and the rules below are GitHub's own.)*
- **Moving other code onto the same parser (proposals, none built):**
  - **Word count:** a parse of the whole text is more than counting needs. Propose it **stays a regex** but strips HTML comments instead of `%%` (`<!--[\s\S]*?-->`), kept pure and cheap, since it runs on every keystroke and in `npm run check`.
  - **Link scan and rewriter:** these read **files that aren't open in an editor** and are tested by a fuzzer. Proposal: **don't move them in this brief.** Change the scan to recognise inline `[text](target)` only (dropping `[[ ]]`), keep its hand-written scanner, and keep the fuzzer. Moving the rewriter onto `@lezer/markdown` would be allowed only if the existing fuzzer (`linkRewriterFuzz.test.ts`) still proves that no byte outside the planned spans changes; I'd rather not risk that for a gain of exact code-span handling.
  - **Protected text:** this one benefits most (fences, code spans, link targets, URLs, HTML comments straight from the tree), but see the next point on lag.
- **What the typing aids do while the parse hasn't reached the caret.** The aids need an answer at once (a keystroke is acted on or not). Proposal: **ask the tree for the caret's position with a short budget (`ensureSyntaxTree(state, caret, ~20 ms)`); if it hasn't reached it, the aid does nothing for that keystroke** and the character stands exactly as typed. The cost is a missed correction on a very long, freshly opened chapter, never a wrong one; the rule that aids act only on text typed right now already means nothing is applied later. Until protected text moves onto the tree, **the current line-by-line scan stays as the cross-check**: an aid acts only when both agree it's outside protected text. A test types into a 200,000-word chapter right after opening.

## 4. The link form

- **Proposal: a path relative to the file holding the link, with spaces as `%20`**, e.g. `[Jane Harbour](../../Codex/Jane%20Harbour.md)` from a chapter two levels down, and `[Jane Harbour](Jane%20Harbour.md)` between two Codex notes in one folder. It works in any tool that follows relative links and needs no angle brackets (which are valid CommonMark but not universal).
- **What I could and couldn't check against GitHub:** GitHub's docs say relative links are relative to the current file and allow `./` and `../`; **they don't say anything about spaces, `%20` or angle brackets**, and I did not render a test file on GitHub, so `%20` working there is **unverified**. It is CommonMark-correct (a destination can't hold a raw space unless in angle brackets), and the rewriter already reads and writes `%20` (`linkScan`'s `markdown` form, its tests). Kenny or I can confirm by pushing one test file to a throwaway repo; I haven't done so.
- **The rewriter's tests** cover `[text](Codex/X.md)` and encoded spaces. The new work is: a relative path computed from the file's own folder (the tests use project-rooted paths), rewriting the link's **text** when it equals the old name, and dropping the `[[ ]]` forms. Hold point for the build: if a rename turns up a link form the planner can't classify, it's listed, never guessed.
- **`[[` insertion** writes exactly that link, with the entry's name (or the matched alias) as its text. A name containing `]`, `[` or `)` is escaped with a backslash, as CommonMark requires.

## 5. Alerts: tints and contrast

Measured as WCAG 2 contrast on flat sRGB: `--ef-fg` `#d3c6aa` on the tint, and the edge colour on the tint (decision 122; Kenny accepted the 4.45 floor for NOTE and TIP on 7 November 2026).

| Alert | Tint | `fg` on tint | Edge/icon on tint |
|---|---|---|---|
| NOTE | `bg_blue` `#3f5865` | 4.45 | 3.46 |
| TIP | `bg_green` `#48584e` | 4.47 | 3.77 |
| IMPORTANT | `#544f5a` (20% `--ef-purple` into `bg0`) | 4.70 | 3.44 |
| WARNING | `bg_yellow` `#55544a` | 4.51 | 4.18 |
| CAUTION | `bg_red` `#59464c` | 5.17 | 3.19 |

- **Everforest Soft Dark has no `bg_purple`**, hence the mix. 25% would give `fg` 4.34, under the floor; 20% stays level with the others.
- **These match the notice kinds'** (error 5.17, warning 4.51, information 4.45, success 4.47; the 5.23 and the swapped pair in `docs/colours.md` §7 were a slip, corrected in `739fe14`). Any test that pins these figures uses them and cites decision 122 and this ruling.
- The TIP and IMPORTANT **icons are stand-ins until Kenny supplies his own (H2)**.

## 6. Proposals

- **Tables:** off the caret's line, the cell text in the body face, the pipes and the alignment row muted (`--purpose-text-muted`), with a header row in bold. **Source stays editable text:** no grid, no column alignment drawn; the mock-up shows a gridded rendering, which is the more ambitious option, so Kenny can choose between "muted pipes only" (my recommendation, safe with proportional fonts) and the grid.
- **Task boxes:** drawn as a box glyph in place of `[ ]` / `[x]`, a done item's text struck and muted. **Ticking by click: not in this brief (recommendation).** It would be a write from a click, and an ordinary undoable edit would work, but it's easy to hit by accident in a prose editor; the keyboard (typing `x`) does the same.
- **The key to open the link at the caret:** **⌘-Return**, active only with the caret in a live link (a no-op elsewhere, so it never changes Return's normal use), with ⌘-click as the mouse route. Kenny rules.
- **The conversion:** dropped. **Images:** survey follows.
- **The image folder and Rust side (survey only, nothing built):**
  - *Showing:* `![alt](path)` where the path resolves to a file in a project folder; it would go through a read command like `read_cover` (name check, 10 MB, first-bytes check for PNG, JPEG, GIF, WebP) and draw from a `blob:` URL (the CSP's `img-src` already allows it). That is a new **read** command (`read_image(path)`), allowed by the rule for new commands, with the path checked by the guard's containment rules, never a free path from the window.
  - *Inserting by paste or drop:* writes a **new file into the project**, which is a new kind of write. A proposed folder `_story-library/images/` or a top-level `Images/` (un-prefixed like `Codex/`, so GitHub shows it), created only on the first insert, files named by content hash to avoid clashes. It needs a new guard operation row and a Rust command `save_image(bytes)` returning the name, and **it touches decision 14** (the frozen 0.17 layout): a new folder is a new path. This is a hold point for the build; I recommend **showing only in 1.12.0** and inserting in a later brief.
- **The chapter bar's vertical place:** centred in the 76 px strip (32 px from its top, the rail's centre on the strip's), shown at all sizes in the mock-up. Its rail spans the chapter box's width.

## 7. The mock-up

`docs/gfm-mockups/mockup.png`: a chapter with every dressed element and the caret on the last line (markers shown); the five alerts and a non-alert `[!SECRET]` quote; the `[[` suggestions (with an alias row); live and muted links and their tooltips; Obsidian syntax shown as plain text (no conversion notice, as ruled); and the chapter bar at 0%, about 50%, 100%, 150% and beyond 300%.
- **Honest limits:** it is a hand-built static page in the theme's colours, not the app's editor (nothing is built). In the 150% and beyond-300% rows the shortened rail is hidden behind the bar, so those two rows don't show the rail's shortening clearly; the real build draws the rail's end inside the bar's cut. The icons on the alerts are not drawn.

## Stops for Kenny's rulings
1. Footnotes by a small custom parser extension; alerts by a display rule over the blockquote (§3).
2. Alert strictness where GitHub is silent: uppercase only, nothing after the marker (§3).
3. Word count stays a regex; scan and rewriter stay hand-written; protected text moves onto the tree with the old scan as a cross-check (§3).
4. The link form: relative path with `%20`, to be confirmed on GitHub (§4).
5. Tables: muted pipes only, or a grid; task boxes without click-to-tick; the open-link key (§6).
6. Images: show only in 1.12.0, insert later (§6).
7. TIP and IMPORTANT icons (H2).

## 8. Round two (rulings of 7 November 2026, and what they found)

### 8.1 GitHub's rendering, probed
One file pushed to a private throwaway repo (`KennyRN/sf-gfm-probe-throwaway`) and read back as GitHub's own rendered HTML (`Accept: application/vnd.github.html+json`). **Match GitHub:**

| Case | GitHub renders |
|---|---|
| `> [!NOTE]` then a body line | an alert |
| `> [!note]` (lowercase) | **an alert: the marker is case-insensitive** |
| `> [!NOTE] text after the marker` | **a plain quote**, the marker as plain text |
| `> [!FOO]` (unknown type) | a plain quote |
| `> [!TIP]` alone, no body | **a plain quote** (an empty alert is not one) |
| an alert inside a list item | a plain quote (it can't nest) |
| an alert inside another quote | a plain quote |
| `[x](../Codex/Jane%20Harbour.md)` | a link |
| `[x](<../Codex/Jane Harbour.md>)` | a link (its href is the `%20` form) |
| `[x](../Codex/Jane Harbour.md)` (a raw space) | **not a link**, plain text |
| `[^1]` and `[^1]: …` | a footnote, with a back-link |

So **the display rule is: a top-level block quote whose first line is exactly `[!TYPE]` (any case, nothing else on the line) with at least one more line in the quote.** This replaces my uppercase-only proposal. The link form is **confirmed: a relative path with `%20`** (angle brackets also work, and the rewriter may read them, but the app writes `%20`; a raw space is never written or treated as a link). **The throwaway repo could not be deleted**: my token lacks the `delete_repo` scope, which needs an interactive `gh auth refresh -h github.com -s delete_repo`. It is private and holds only the probe file; Kenny can delete it in the repository's Settings, or run that command and `gh repo delete KennyRN/sf-gfm-probe-throwaway`.

### 8.2 Which actions move a file that can hold links
Files that hold links: chapters (`_story-library/<book>/<ch>.md`), Codex notes (`Codex/<name>.md`), and the fields' files: the synopsis (`_story-library/novel-<book>.md`), the series description (`_story-library/series.md`) and plot notes (`_backstage/storyforge/<book>/chapters/<ch>.md`). **A link in a field is relative to the file that stores the field.** The paths to a Codex note, from each:

| Written in | Link to a Codex note |
|---|---|
| a chapter | `../../Codex/X.md` |
| a Codex note | `X.md` |
| the synopsis (`novel-<book>.md`) or the series description | `../Codex/X.md` |
| a plot note (stored in the novel file) | `../Codex/X.md` |

| Action | Moves a file? | Do its outgoing links keep working? |
|---|---|---|
| Archive, unarchive, move a Codex item, rename or remove a Codex folder, convert a note to a folder | **No.** `codex.md` only: Codex folders are virtual, notes stay flat in `Codex/` | Yes, nothing moved |
| Reorder chapters or books, rename a book's or chapter's title | No (titles live in the sidecars and `series.md`; files keep their ids) | Yes |
| **Rename a Codex note** (`renameNote`) | Yes, but within `Codex/` | Yes: the folder is the same, so its own links still resolve. Incoming links are the rewriter's job (now `[text](path)` only) |
| Cross-book chapter move (found by the reconciler after the files move outside the app) | Yes, between `_story-library/<book>/` folders | Yes: same depth; its sidecars move with it |
| Book folder rename outside the app (reconciler) | Yes | Yes: same depth |
| A chapter or Codex note renamed outside the app | Yes, same folder | Yes for its own links; links *to* a renamed Codex note are not rewritten by the reconciler (it never writes prose), so they show as "no such entry" until the author fixes them |
| A file moved by the author **to a different depth** outside the app (a Codex note into a real subfolder, say) | Yes | **No.** The reconciler won't rewrite prose. |

**Fix proposed for the last row (and only that):** do nothing to the text. The links show muted as "no such entry", which is true, and the author sees them. **Optional, for Kenny:** the reconciliation summary could list the moved files whose relative links now point nowhere, so nothing is silent; it would write nothing. **Recovery copies** (`_sf-backup/recovery/…`) hold text copied out of its folder, so their relative links won't resolve; they are copies to read, not live files. One more place: **text shown away from its file** (the series tab's synopsis in the context panel, the read-only chapter text) is resolved from its source file, never from where it is drawn.

### 8.3 The rename and the old forms
`[[X]]`, embeds and unquoted `[[X]]` frontmatter values are no longer read by the rewriter (decision 157), so `LinkForm`'s `wikilink` and `embed`, the "unquoted" report and its test cases go. **The unreadable-frontmatter check stays**, and `linkRewriterFuzz.test.ts` must still pass.

### 8.4 Comments, protected text and the aids
- **The word count stays a regex** (HTML comments). **A test** compares it with the parser's comment spans across every fixture, with `<!--` inside code and an unclosed `<!--` among the cases; any disagreement is listed in the report.
- **Protected text uses only the parse tree at runtime.** The old line scan survives only in tests this release, as a check on the fixtures; disagreements listed. The 20 ms wait is accepted, **tested on a long chapter just after it opens.**

### 8.5 Tables, tasks, keys, images, icons
- **Tables:** muted pipes and alignment row for 1.12.0. **A grid goes to Future** (the mock-up's gridded table is withdrawn as an option). **No click-to-tick.**
- **⌘-Return opens a link.** I searched `src/` and `src-tauri/src/` for any ⌘/Mod-Enter or Return binding (CodeMirror key names, menu accelerators, `metaKey` with Enter) and found none, so it clashes with nothing today. CodeMirror's default keymap isn't searched here, so a test at build lists the live bindings to confirm.
- **Images: they move to an images brief.** `read_cover(target, filename)` takes only the series or a book code and an exact `cover.<ext>` name, and reads from that book's backstage folder. Reading a file named in a link's path would need a new Rust command, so by the ruling, showing and inserting both move to the images brief. Nothing in 1.12.0.
- **Icons (H2, supplied by Kenny, both Tabler 2.2, filled):** **TIP is `square-rounded-check`, IMPORTANT is `square-rounded-arrow-right`.** They are recorded in `Icon Licences.md` at the build; NOTE, WARNING and CAUTION keep the notice icons. They are final, not stand-ins. The SVG files were pasted into the session and are not saved in the repo yet; the build adds them to `kit/noticeIcons.ts`.

### 8.6 The chapter bar's vertical place
**Centred in the strip: the rail's top 32 px from the strip's top (the strip is 76 px, so 32 px above and below the 12 px rail), the bar 2 px inside it.** Centred keeps it equally clear of the chapter box above and the stats section below, whatever the window's height; nothing else lives in the strip. Aligned left and right with the chapter box.

### 8.7 The mock-up, fixed
Section 6 is redrawn at 2x with the rail's own end marked by a tick: at 150% the rail ends two thirds along and the bar runs on to the row's end; beyond 300% the rail is a third and the bar has the cut V. The earlier version hid the rail behind the bar.

## 9. As built, build stage 1 (the dressing)

- **The tree:** `core/markdownTree.ts` (`@lezer/markdown` with GFM, the footnote extension, indented code removed per decision 22); `ui/editor/dressingPlan.ts` plans the decorations from it (DOM-free, tested), `dressingView.ts` draws them and dispatches no change.
- **Alerts:** GitHub's rule as probed (§ 8.1), a display rule over a top-level block quote; the label and icon replace `[!TYPE]` away from the caret's line and the marker shows, muted, on it. TIP is `square-rounded-check` (the same shape as the success notice's) and IMPORTANT `square-rounded-arrow-right`, both Kenny's.
- **Bold italic** is one span on the inner text with both classes, so its colour setting still applies (`***x***`, `_**x**_`).
- **Retired:** `==highlight==` (dressing, `highlight-colour` setting, its purposes and CSS, its rows in Settings); the stored key is never read and stays in `project.md` through every write (`test/ui/gfm.ui.ts`, `settings.test.ts`).
- **Proof that the dressing changes no saved byte:** `test/ui/gfm.ui.ts` types a document holding every element into the chapter, a Codex note, the plot note, the synopsis and the series description, walks the caret over every line, and checks the saved file holds exactly what was typed; a chapter holding every element is opened and nothing is written.
- **Found:** the typing aids turn the `--` in a typed `<!--` into a dash, because protected text still reads lines, not the tree. Fixed in stage 2; the test types the comment line then.
- **Named type-style exceptions added** (`typeStyles.test.ts`): `.sf-code`, `.sf-codeblock` and `.sf-footnote-def` (font size, a fraction of the prose size), `.sf-table-head` and `.sf-alert-label` (font weight); and the embedded monospace face `--font-code` (Courier Prime).
- **Pictures from the built app** (`scripts/gfm-shots.mjs`, a throwaway copy with a temporary HOME; `screencapture -l` of its window only; the one key sent, Return on a focused Codex row, goes through the typing guard): `docs/gfm-mockups/chapter.png` and `codex-note.png` (the chapter on the left with every dressed element, a Codex note on the right with the five alerts, a `[!SECRET]` plain quote, and `==x==` and `[[x]]` as plain text).

### 9.1 The dressing's sizes, and the stage 1 look (7 November 2026)
Kenny's rulings: the table's pipes and alignment row take the colour of a hidden marker shown on the caret line (they already do, `rgb(157, 169, 160)`, the muted purpose; pinned now by `gfm.ui.ts`); alert icons are Tabler's native **24 px** in every editor; **the five type-style exceptions are accepted**; a new embedded font needs a ruling first next time. **The code face is Sono** (Kenny's choice, replacing Courier Prime for code; Courier Prime stays one of the Appearance fonts): the variable file is embedded unmodified (`fonts/sono/Sono-Variable.ttf`, weight axis 200 to 800, MONO axis 0 to 1), `font-variation-settings: "MONO" 1` pins the MONO axis, and the code rules set no weight, so they take the weight of the text around them (300 in the chapter, 700 inside bold). Its OFL licence is recorded in `Font Licences.md` and beside the file. **A new embedded font needs a ruling first, next time.**

The sizes are relative (em, of the Writing size), except the icon's native 24 px:

| Rule | Value |
|---|---|
| `.sf-heading-1` / `-2` / `-3` to `-6` | 1.5em, 1.25em, 1.1em |
| `.sf-code`, `.sf-codeblock` | font size 0.9em of the Writing size (inline code also has 0.2em of side padding and a 4px radius); weight inherited, MONO 1 |
| `.sf-footnote-def` | 0.9em |
| `.sf-alert-label` | weight 600 (the size is the line's own) |
| `.sf-table-head` | weight 600 |
| `.sf-alert-icon` | 24px (native) |
| alert box padding | 14px at the sides, 8px above the first line and below the last (px; the box's own spacing, not text) |

## 10. As built, build stage 2a (protected text on the tree)

- **Protected text reads the parse tree only** (`core/typing/protectedText.ts`; the editor passes its own incremental tree through `ui/editor/protection.ts`): inline and fenced code, link targets and titles, bare URLs and autolinks, HTML tags and comments, footnote labels, link-reference definitions and a table's alignment row. The old line scan is `test/legacy/lineScanProtectedText.ts`, used only by `protectedAgreement.test.ts`, which lists every disagreement on the fixtures (the two HTML comments, which only the tree knows).
- **The 20 ms wait:** `protectedAt` asks `ensureSyntaxTree` for the parse up to the caret within 20 ms; if it hasn't reached it, the aid (smart punctuation, name autocorrect, the shortcode popup) does nothing for that keystroke. Tested: a unit test with a 7 MB document and no budget (null), and `gfm.ui.ts` on a 4.5 MB chapter just opened (the apostrophe is straight or curled, never wrong, and curls once the parse has caught up).
- **Code is Sono** (embedded, MONO pinned to 1, weight inherited; sizes in § 9.1). Licence in `Font Licences.md`.
- **A consequence to rule on:** an unclosed construct the parser doesn't read as one is not protected until it is closed, so the apostrophe in `` `don't` `` and in a URL like `https://a.b/it's`, typed character by character, is curled before the closing backtick or the end of the URL, and the `--` of a `<!--` typed in the *middle* of a line becomes a dash before the closing `-->` (a comment starting its line, and an unclosed fenced block, are protected to the end, as the parser reads them). One ⌘Z undoes the aid's change. The old scan protected an unclosed opener to the caret. **Proposal, if Kenny wants it back:** the aids also treat an unclosed backtick, link target or `<!--` earlier on the caret's own line as protected to the caret, a small rule beside the tree, never replacing it.
- A table's alignment row is only a table's once its header row is above it, and the en dash rule now also skips a line made of only hyphens, spaces, pipes and colons (as the em dash rule already did), so `| - | - |` typed under a header isn't dashed on the way.

## 11. As built, stages 2b and 3 (links, the rename, the chapter length bar)

- **The rename and the old forms** (decision 157): `core/linkScan.ts` reads markdown links only (`[[wiki links]]`, embeds and `%%` are plain text; an HTML comment is protected, an unclosed one to the end) and each link carries where its text sits. `core/linkRewriter.ts` replaces only the file name in a link's path (so a relative link's directories and depth are untouched) and **the link's text follows when it is exactly the old name**; other text is kept. `ambiguous`, `unquotedFrontmatter` and `ambiguousLeft` are gone from the plan and the result and from the rename dialog. The unreadable-frontmatter check stays. `linkRewriterFuzz.test.ts` is rebuilt for the new forms (relative links, text following, HTML comments, `[[x]]` as plain text that never changes): 3,000 documents and 150 through the whole pipeline pass, so every byte outside the planned spans is unchanged.
- **Codex links** (`core/codexLinks.ts`, `core/codexLinkSource.ts`, `ui/editor/codexLinks.ts`): `[[` offers every entry that isn't archived, any type, matched on name or alias (accents and case ignored; names that start with the query first, aliases next, then the rest; at most eight); Tab writes the complete link, `[Sam](../../Codex/Sam.md)`, relative to the file the text is stored in (a plot note and the synopsis live in the novel file, so `../Codex/…`; the series description in `series.md`; a chapter `../../Codex/…`; a Codex note `Sam.md`), and the alias becomes the text; one ⌘Z gives back `[[sa`. Nothing is offered inside protected text or for a `[[` that was already there. A live link (a Codex entry, archived ones too, tooltip "an archived entry: it opens read-only") is drawn as a link and opens on **⌘-click** or **⌘-Return** with the caret in it; every other link is muted with its tooltip ("a chapter, not a Codex entry", "not a Codex entry", "no such entry", "the app doesn't open web links"). **⌘-Return** on a muted link does nothing; off a link it keeps CodeMirror's own meaning (a blank line); both tested. On the storytelling side an entry opens in the context panel (replacing what's there, no Back); on the library side in the Codex tab (an archived one in the Archive tab).
- **The chapter length bar** (`faces/chapterLengthBar.ts`, `overviews/bars.ts` `chapterLengthBarState`): in the strip under the chapter box, centred (rail 32px from the strip's top), 12px rail, 8px bar 2px in, radii 6px and 4px; no text and no tooltip, a name for the screen reader ("Chapter length: 1,200 of 2,500 words"); no chapter length means nothing shown; no words the rail only; any words at least 3px; overrun shortens the rail (never under a third, the padding aside) and the bar runs to the row's end; past three times the target the end is cut (a V, 4px deep, its corners softened). It reads the project's own word count and follows typing live. Its colour is the new setting `chapter-bar-colour` (`data` by default, written as the role name when one of the five is chosen), swatches under Settings ▸ Appearance ▸ storytelling mode; the rail is `bg0`.
- **Sono** is Kenny's own supplied file (`Fonts/Sono/Sono-VariableFont_MONO,wght.ttf` and its `OFL.txt`), embedded unmodified.

## 12. The unclosed-line rule (Kenny's ruling), and the picture set for his look

- **The rule** (`unclosedOnLine` in `core/typing/protectedText.ts`; applied by `protectedAt` and the pure `protectedRanges`): beside the tree, never in place of it, and only adding. On the caret's own line, from an **unclosed opener to the caret** is protected: a backtick (a run with no closing run of the same length), a link target (`](` with no `)`), `<!--` (no `-->`), and a bare web address being typed (`http://`, `https://` or `www.` to the caret with no space; `www.` must start a word). **The list is closed: adding to it needs a ruling.** It stops at the line's end. This **supersedes** § 10's note on the consequence: `` `don't` ``, `[t](u's)`, `https://a.b/it's` and a mid-line `<!-- 'x' -- y -->` are left as typed again, in the unit tests, `typing.ui.ts` and `npm run test:typing` (the built app).
- **Test names:** the planned-length field is looked up with `getByLabel("Chapter Length", { exact: true })`, and `gfm.ui.ts` checks that with the bar visible an exact lookup finds only the field (the bar's name is "Chapter length: 1,250 of 2,500 words", and a hidden bar has no name at all).
- **Pictures for Kenny's look**, from the built app (`scripts/gfm-shots.mjs`, on a throwaway copy, the window only), in `docs/gfm-mockups/look/`: `bar-0.png`, `bar-50.png`, `bar-100.png`, `bar-150.png`, `bar-over-300.png` (the chapter length bar against the 2,500-word plan at 0, 1,250, 2,500, 3,750 and 9,000 words), and `chapter.png` / `codex-note.png` (a table whose pipes and alignment row are in the muted marker colour, the five alerts with 24 px icons, and every other dressed element). The sweep waits for his look.
