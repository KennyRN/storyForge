# Brief 20 report: GitHub Flavored Markdown (1.12.0)

Branch `gfm`, from `main` after `v1.11.2`. The design, the H1 survey, every ruling and the as-built notes are in `docs/gfm.md` (§ 1 to § 12); the pictures in `docs/gfm-mockups/`.

## What was built
- **One parse** (`core/markdownTree.ts`): `@lezer/markdown` with GFM, a footnote extension, indented code off (decision 22); GitHub's alert rule, probed on a throwaway repository (since deleted by Kenny); comment spans.
- **The dressing** (`ui/editor/dressingPlan.ts`, `dressingView.ts`) in every editor: headings, bold/italic/bold italic (one span), strikethrough, code (Sono), quotes, lists, tasks, tables (muted pipes), scene breaks, footnotes, HTML comments, links (live, muted, tooltips), and the five alerts (24 px icons; TIP and IMPORTANT are Kenny's; IMPORTANT's tint is Everforest's purple mixed 20% into bg0). Display only: `test/ui/gfm.ui.ts` proves no saved byte changes in the chapter, a Codex note, the plot note, the synopsis and the description.
- **Retired:** `==highlight==` (dressing, setting, purposes; the stored key is never read and survives every write: tested), `[[ ]]`, embeds, `%%`. No conversion (ruled out).
- **Protected text and the aids:** the tree, with a 20 ms wait (null means the aid does nothing; tested on a 7 MB document and on a 4.5 MB chapter just opened) and the unclosed-line rule beside it (a closed list; tested per opener, per line end and for only adding). The old line scan is a test-only check (`protectedAgreement.test.ts`, every disagreement on the fixtures listed: two HTML comments).
- **Links:** `[[` with aliases (Tab, one ⌘Z), relative `%20` paths from the file a text is stored in, live and muted links, ⌘-click, ⌘-Return (tested on a live link, a muted link and off a link), following a link in the context panel or the Codex tab. The rename reads markdown links only; the link's text follows an exact old name; the rewriter's fuzzer is rebuilt (3,000 documents and 150 full-pipeline runs).
- **The chapter length bar** and its colour setting (`chapter-bar-colour`, `data` by default).

## Differences from the brief, and findings
- **The unclosed-line rule** was not in the brief: protected text reading only the parse tree curled the apostrophe in `` `don't` ``, a URL and a mid-line `<!--` as they were typed; Kenny ruled the rule in (§ 12).
- **A link in a field is relative to the file the field is stored in:** the plot note is in the novel file, so its links are `../Codex/…` (my H1 table said four levels; corrected).
- **The typing-smoke script** read the dressed text: after the caret leaves a line the dressing hides that line's markers, so the accessibility value no longer shows the backticks and brackets typed there. The app was right; the script now expects the dressed text (`whenLeft`).
- **A hidden chapter bar** had an accessible name that collided with a "Chapter Length" label lookup; a hidden bar has no name now, and the lookups are exact.
- **`ambiguous`, `unquotedFrontmatter` and `ambiguousLeft`** are gone from the rename plan, result and dialog (they existed only for `[[X]]`).
- **Named type-style exceptions** accepted by Kenny: `.sf-code`, `.sf-codeblock`, `.sf-footnote-def` (size), `.sf-table-head`, `.sf-alert-label` (weight).
- **Not done, by ruling:** images (their own brief), the conversion (Future), a table grid (Future), click-to-tick.

## Tests
See the release commit's message for the final counts. `npm test`, `cargo test --workspace`, the full `npm run test:ui`, and every built-app script three times (`test:quit`, `test:typing`, `test:look`, `test:fonts`, `test:cover`, `test:widths`, `test:settings-sync`).
