# Story shape (Brief 8) – design

Status: **for H1 review.** Nothing is implemented. Branch `shape`, from `main` at `66eb275` (0.11.1, Fix 2 merged).

## 1. Findings from the survey (§0)

### 1.1 What Brief 2 already ported (`src/core/`)

| Reference function | Exists | Where | Notes |
|---|---|---|---|
| `readChapterPlot`, `writeChapterPlot` | yes | `book.ts` | write trims, empty clears the key, stamps `chapter-id`/`chapter-title` if absent |
| `writeChapterPov`, `writeChapterLocation` | yes | `book.ts` | take `CodexRef {path, name}[]`; empty clears |
| `writeDefaultPov` | yes | `book.ts` | `default-pov-path` / `default-pov-name` |
| `readBookSynopsis`, `writeBookSynopsis` | yes | `book.ts` | via `sectionBody.ts`, `updateText` |
| `readSeriesDescription`, `writeSeriesDescription` | yes | `series.ts` | same |
| `writeBookCoverImage`, `writeSeriesCoverImage` | yes | `book.ts`, `series.ts` | already retire the old cover, but **only when the extension differs** |
| `plotCardTier.ts` | yes | | `bar / collapsed / extended`, `nextPlotCardTier` |
| Codex entries by type (for pickers) | yes | `codex.ts` (`getCodexEntriesByType`) | |

Nothing is missing at the data layer. The gaps are below.

### 1.2 Gaps and hold-point findings

**G1 – Codex renames do not rekey PoV, location or default-PoV references. This is a named hold point (§8).**
References are stored as `{path, name}` (`pov`, `location`, `default-pov-path`, `default-pov-name`). `rekeyCodexNotePath` (`codex.ts`) rekeys only `Codex.md`'s own order/archive/folders/types, and `linkRewriter` rewrites wikilinks (and frontmatter strings that are links), which these path strings are not. So after a rename, a chapter's PoV would show as *missing*.
*Proposed fix (needs your ruling):* extend `OpenedProject.renameNote`'s rekey step to also rewrite `chapters.*.pov`, `chapters.*.location` and `default-pov-*` in every `novel-*.md`, through `modifyBookFrontmatter` (minimal edits, only the matching refs, `name` updated to the new title, `path` to the new path). It writes only keys 0.17 already has, in files rename already touches (the rekey is already a post-rename step), and the same step handles Codex moves and archive/prune (`rekeyCodexNotePath(…, null)` → ref left as-is and shown missing, never dropped). It adds a core test and a disk-safety operation. I will not build this until you rule on it.

**G2 – Section writes do not refuse duplicate headings (boundary 3).**
`upsertSection` / `extractSection` use `indexOf(header)`, so `## Synopsis` inside, say, `### Synopsis` or a second `## Synopsis` is matched by first occurrence, and a heading match inside text (`## Synopsis notes`) is also hit. *Proposed:* new strict variants in `sectionBody.ts` (the old functions unchanged): match only a line that is exactly `## Synopsis` (trailing spaces allowed); if zero matches, append; if one, replace up to the next line starting `## ` (or `# `); if more than one, **refuse**. The section writers move to the strict variants. This is a behaviour change to ported writers, not to their callers; I'm listing it rather than treating it as a hold, because the old behaviour on a single clean heading is identical, but say if you want it held.

**G3 – Cover replacement is not always retired.** The existing writers retire the previous file only if the name differs; with the same extension they overwrite in place (`writeBinary`). Boundary 4 forbids that. Covers will go through a new Rust command (§6), which retires first, always.

**G4 – No compare-then-write for these fields.** `updateText` and `modifyFrontmatter` run read-modify-write under one lock, so they are atomic with respect to the app, but they do not know what the *field* held when the author started editing. §2.7's conflict rule needs a "last seen" value per field (§5).

**G5 – Plot notes are written through `writeChapterPlot`, which stamps `chapter-id` and `chapter-title` into the entry if absent.** That is existing 0.17.1 behaviour and a key the layout already has; noted for the report.

## 2. Card sizes, chevron and size control (§2.1)

- Per-card size: `PlotCardTier`, using the ported `nextPlotCardTier` (extended → collapsed → bar → extended). An absent entry means extended.
- **Chevron:** a `<button>` at the end of the card header. `aria-label` names the *next* size ("Show plot note", "Collapse to bar", "Show all details"), `aria-expanded` reflects extended/collapsed. The bar itself still opens the chapter.
- **Size control:** a three-option segmented control (bar / collapsed / extended) in the header, `role="radiogroup"`. It sets every card and persists them. When sizes are mixed, none is selected (`aria-checked` false on all). Choosing one writes a full map.
- **Storage:** machine settings, per project, key `cardTiers`, `{ "<bookFolder>/<file>": "bar" | "collapsed" }` (extended not stored, as in the plugin's map). Not in `project.md`. A read-once import of the plugin's stored map from `data.json` is **proposed but optional**; I'd skip it unless you want it (the plugin's keys are per-pane and the map would need guessing which pane).
- Held in the model with the other navigation state, and cleaned of entries for chapters that no longer exist when read.

## 3. Plot notes (§2.2)

A `<textarea>` that auto-grows (height set from `scrollHeight` on input; `overflow: hidden`). Committed on `blur` through the field-commit mechanism (§5). Trailing whitespace is trimmed at commit only. The existing writer uses `.trim()`, so leading whitespace is lost today. Brief §2.2 requires leading spaces to round-trip, so the new write path uses `trimEnd()` and the core test asserts it. This is a change in `writeChapterPlot` (leading-whitespace now kept); flagged as a behaviour change. Empty (after trimEnd and whitespace-only check) clears the key. Round-tripping multi-line, quotes, colons, `#`, emoji depends on the frontmatter editor's block-scalar/quoted output; the fuzzer is extended to multi-line plot strings with those characters. If any case cannot be rewritten minimally, that is the first hold ("a YAML construct").

The tooltip cache from Brief 6 is invalidated on commit.

## 4. PoV and location rows, Codex picker, default PoV (§2.3, §2.4)

- **Rows** (extended size): *PoV*, *Location*, *Length*. Each ref is a button showing `name`; clicking opens the note in the workspace as the codex tab does (via the model's existing open-Codex route, decision 29).
- **Missing:** a ref whose `path` is not a file in the index renders muted, with a "missing" suffix and a tooltip naming the stored path. It stays in the list and on disk. Removing it is the author's act in the picker.
- **Picker** (`src/ui/kit/codexPicker.ts`, new, since none exists): a dialog or popover with a filterable checklist of Codex entries of one type (person for PoV, place for Location), `multi` or `single`. Empty state: "No people in the Codex yet" / "No places…" (lexicon to check against `docs/text-labels.md`). Keyboard: arrows, space, return, escape. Returns the chosen `CodexRef[]` in the order selected (existing refs keep their order; missing refs not unchecked stay).
- **Default PoV** row in the header: single choice, person entries, writes `writeDefaultPov`. A chapter with no PoV shows the default, muted, with a "default" label; never written into the chapter.
- **Library side codex tab** unchanged.

## 5. Field commit, conflicts and recovery (boundary 2, §2.7, §2.8)

One small class, `FieldCommitter` in `src/ui/overviews/`, used by plot notes, synopsis, description (and the planned-length fields, §5.3).

1. On focus it records `seen` = the field's current on-disk value (read from the index/file).
2. On blur (or Return for single-line) it calls `commit(text)`.
3. `commit` calls a core function that takes `expected` (the `seen` value) and `next`: inside the same lock it re-reads the field, and if the current value is not equal to `expected` it **does not write**; it returns `conflict` with the current value.
4. On `conflict` or refusal (duplicate heading, unreadable frontmatter, guard refusal) the author's text is written to a recovery file, the field shows the on-disk value, and a sticky notice (kit/notices) says so.
5. While the field is focused, outside changes do not touch it; while not focused it refreshes with the overview's existing debounced refresh.

*Core:* a new module `src/core/fieldWriter.ts` (adding a core module; the brief says "unless the design doc shows one is needed" — it is needed for the shared compare step and the recovery write). It exports `writeFieldChecked(project, kind, target, expected, next)` where `kind` is `plot | synopsis | description`, delegating to the existing writers inside a transaction-equivalent check, and returns `written | unchanged | conflict | refused`. It calls `createRecovery`; `test/architecture.test.ts` is extended so `fieldWriter.ts` may call it (allow-list addition, not a loosening of any rule for other callers).

*Recovery file:* create-only, under `_sf-backup/recovery/<book>/` for plot notes (`<book>/` = the book folder name) and `recovery/_fields/` for synopsis and description. Name: `<target>--<plot|synopsis|description>--<timestamp>.md`, holding the author's text exactly, in line with how existing recovery files are named (to confirm against `recovery.ts` when I build; I'd follow its function rather than invent naming).

### 5.3 Commit on close

A new stage at the head of the close path in `appLife.ts`: `commitFocusedFields()`: if the focused element belongs to a `FieldCommitter` (or the planned-length field), commit it, wait for it, then send `close_progress`. Anything that cannot land goes to recovery and the close continues. Placed before the editor flush as §2.8 says. Tested at the window level (a request-close while a plot note is focused and dirty) and through `npm run test:quit` with a new check that a typed plot note reaches `novel-<code>.md` on all five routes. **This commit touches the close path, so `npm run test:quit` runs before it.**

## 6. Covers (§2.6)

- **Commands (new, for ruling):**
  - `pick_cover(target)` where `target` is `{kind: "series"}` or `{kind: "book", code}`. Rust opens the Mac's open panel limited to images, reads the chosen file itself, validates it, retires any existing cover (always, even if the same name), writes `cover.<ext>` into the target's backstage folder through the guard, and updates `cover-image` (through the same frontmatter path as other writes). Returns `{ok, filename}` or `cancelled`. The window never sees the path.
  - `read_cover(target)` read-only: returns the bytes of the current cover for that target, size-capped, after resolving `cover-image` from the index inside Rust, so the window never names a path. Window shows it via a blob URL, cached until the file's mtime changes.
  - `clear_cover(target)` retires the cover and clears the key. (Alternative: reuse existing `retire` plus `modifyFrontmatter`; I'd prefer the one command so the two steps are in one place. Needs ruling like `remove_temp`.)
- **Allowed types:** PNG, JPEG, GIF, WebP, checked by **magic bytes**, not extension. SVG excluded (scriptable). Extension on disk normalised: `png`, `jpg`, `gif`, `webp`.
- **Size limit:** 10 MB for choosing; 10 MB cap on read.
- **Guard:** reuses the existing writes under `_backstage/storyforge/<book>/` and `_backstage/storyforge/_series/` and `retire`. No new guard operation or row is expected; the disk-safety test asserts a cover write lands only in the book or series backstage folder. If the guard needs a row, that is added, never altered.
- **Read-only project:** all three commands refused in Rust; the cover boxes render disabled and no panel opens.
- **Window allow-list** updated and `test/tauriConfig.test.ts` with it; an architecture test fixes who in TypeScript may call the commands.
- **Placeholder** for a missing, unreadable or unrecognised image.

## 7. Synopsis and description (§2.7)

- Text areas committed through `FieldCommitter`, written as a section (§1.2 G2).
- **Empty field:** *removes the section* (heading and text), and leaves the rest of the file byte-identical. Rationale: an empty heading is clutter in Obsidian, and the old `upsertSection` would have left a bare heading. (Alternative on request: leave the empty heading.) This changes the old writers' behaviour for empty input; flagged.
- **Series description** goes in the series overview header; **novel synopsis** in the novel overview's header and the series overview, where a novel's synopsis is read-only there? **Proposed:** editable in both places, since both use the same committer (the synopsis's second copy refreshes without taking focus, as the planned-length fields do).

## 8. Overview headers (§2.4, §2.5)

Reuse Brief 6's layer. Novel header order per §2.4. Series overview: cover and description side by side, then per novel: cover, numbered title, bar, synopsis; unplaced novels without a bar. Read-only projects: all text areas `readonly`, pickers and chevron-independent controls disabled, but card sizes still change (navigation state, not project data).

## 9. Tests (as §6 of the brief, plus)

- Core: plot round-trip including leading spaces; strict section writes (duplicate refused, other text byte-identical, empty removes the section); `writeFieldChecked` conflict → recovery file, disk file untouched; references follow a rename (**after G1 is ruled on**); default PoV never written into a chapter.
- Disk-safety: each write touches only its own file; conflict leaves the file byte-identical.
- Rust: cover picker refuses non-image, over-limit, wrong magic, bad target; always retires.
- WebKit: as the brief lists.

## 10. Commit plan

Unchanged from the brief (§5), with the G1 rekey as its own commit before commit 4 if you rule for it, and `fieldWriter.ts` landing with commit 3 (plot notes).

## 11. Questions for H1

1. **G1:** extend rename to rekey chapter PoV/location and the default PoV (my proposal), or something else? This is the hold point, so I stop here until you answer.
2. **G2:** strict section matching and refusal on duplicates, changing the ported writers' edge behaviour (single clean heading unchanged). OK?
3. **Plot notes keep leading whitespace** (writer changes from `trim()` to `trimEnd()`). OK?
4. **Empty synopsis/description removes the section**, or leaves an empty heading?
5. **Covers:** three commands (`pick_cover`, `read_cover`, `clear_cover`); PNG/JPEG/GIF/WebP by magic bytes; 10 MB limit. OK?
6. **New core module `fieldWriter.ts`** and its architecture-test allow-list entry for `createRecovery`. OK?
7. **Synopsis editable in both the novel and series overviews**, or novel overview only?
8. Skip importing the plugin's stored card sizes? (I'd skip.)

## 12. H1 rulings (decision 42, on `9bf3a80`)

The survey is accepted. These supersede anything above that differs.

1. **Rename rekeys PoV, location and default PoV.** Approved (finishes decision 10).
   - Match on the stored `path` (case- and Unicode-insensitive), never the name. Update both `path` and `name` to the new path and title.
   - The old single-key forms (`pov-path`/`pov-name`, `location-path`/`location-name`) are updated in place, not converted.
   - Part of the announced rename: the plan counts the novel files whose references change; the pre-rewrite backup covers them.
   - Compare-then-write, minimal edits. A novel file that can't be rewritten (unreadable frontmatter, or changed since the plan) is skipped and listed; its references show as missing.
   - Archiving or pruning a note leaves references as they are (shown missing, never dropped).
   - Renames found at open: if the reconciler already rekeys `Codex.md`, it updates these references the same way and the summary says so. **If the reconciler writes no rekeys today, hold.**
   - Its own commit before commit 4, with a core test, a disk-safety operation and a test through reconciliation.
2. **Strict section matching.** A heading matches only a line exactly `## Synopsis` / `## Description` (trailing spaces and CRLF allowed). A section runs to the next line starting `# ` or `## `. More than one match: refuse the write and recover the text. The reader uses the same rule; a duplicated heading shows the field read-only with a notice. Old loose functions removed if nothing else calls them.
3. **Plot notes keep leading whitespace;** trim the end only. Fuzzer extended to multi-line notes starting with spaces.
4. **An empty synopsis/description removes the section** (heading and text); everything else byte-identical.
5. **Covers: two Rust commands, YAML stays in TypeScript.**
   - `pick_cover(target)`: target is the series or a book code. Open panel; PNG/JPEG/GIF/WebP by first bytes, up to 10 MB; write under a temporary name and sync; retire any existing `cover.<png|jpg|gif|webp>` to `.trash/` always; move the new image in as `cover.<ext>`, create-only. Failure before the last step leaves the old cover. Returns the filename; TypeScript sets `cover-image` (a failure there gives a notice).
   - `read_cover(target, filename)`: read-only; filename must match `cover.<png|jpg|gif|webp>` exactly; only from that target's backstage folder; capped at 10 MB.
   - No `clear_cover`: TypeScript clears `cover-image`, then the file is retired through the existing `retire`.
   - Refusals name the accepted types; HEIC suggests exporting as JPEG.
   - Both on the allow-list, with an architecture test fixing who may call them; both refused in a read-only project.
6. **`fieldWriter.ts` approved**, with its `createRecovery` allow-list entry. Comparison inside the same lock as the write; an unchanged value writes nothing. Recovery follows `recovery.ts` naming: plot notes under `recovery/<book>/`, named so they can't be mistaken for chapter text; synopsis and description under a new `recovery/_fields/`. Planned lengths are committed on close too, but a conflict on one only shows a notice, no recovery file.
7. **Synopsis editable in both overviews,** same committer; the other copy refreshes without taking focus.
8. **Plugin card sizes are not imported.**

Also: stamping `chapter-id`/`chapter-title` when a plot note is written is fine (0.17.1 behaviour, gives stable ids for session files). A picker still open at quit is discarded.

Next: commit 2 (card sizes); rekey in its own commit before commit 4; the close-commit step runs `npm run test:quit` before it is committed.
