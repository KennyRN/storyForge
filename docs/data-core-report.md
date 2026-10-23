# Data core report (Brief 2)

The data layer is a plain TypeScript library over a folder of markdown. Nothing in the repository imports `obsidian`, and it is no longer a dependency. Verified by typecheck, 727 tests (including a 117-operation disk-safety suite and a fuzzed frontmatter editor), and by running the layer over synthetic fixtures. **Nothing has been run against a real vault**: that check (§ "Not done") is waiting for you.

## Size

| | Start of Brief 2 (`3a8a720`) | End |
|---|---|---|
| `src/`, excluding tests | 12,611 lines | 9,430 lines (7,901 in `src/core/`, of which about 2,100 are the icon catalogue and SVGs) |
| Test files | 37 (340 tests) | 44 (727 tests) |
| Guard rule rows | 12 test blocks | 127 rows in `test/guard-spec/guard.json` |

## The YAML library

**`yaml` 2.9.1 (Eemeli Aro), ISC licence**, recorded in `Code Attributions.md`. It is used for parsing, for source ranges, and to generate the text of new or changed values. It is **not** used to re-emit the document: an edit is mapped back to source ranges in the original text and only those ranges are replaced, because re-stringifying (even with this library) normalises unchanged parts. That is the rule you set at H1 for maps ("only the changed paths"), and for lists ("whole list rewritten is fine, in 0.17.1's style").

What was found, and fixed, while testing it:
- Replacing a block scalar (`|`, `>`) mis-sized the replaced range. Found by probing; fixed; tested.
- Edits at the same position were applied in the wrong order when a null-valued key was given a scalar and a key was also appended (deleting the end of a nested map overlapped the append). Found by a fuzzer (3,000 random documents with comments and blank lines, plus 1,000 CRLF ones); fixed; the fuzzer now passes with every untouched entry byte-identical.

Constructs that **cannot be round-tripped** (and so are refused, as you ruled): anchors, aliases, explicit tags, duplicate keys, non-string keys, `<<` merge keys, multiple documents, a top level that isn't a map, and anything that doesn't parse. The file is indexed as unreadable, reported by the check, treated as *unavailable* by the data layer (a read throws `UnreadableFrontmatterError`, never returns "empty"), and every write to it is refused with the disk untouched.

Known limits of the minimal rewrite (all safe: the result is verified to read back as intended, or the edit is refused):
- A **list that changes is rewritten whole**, in the default style (2-space indent, `- ` items under the key); comments *inside* that list are lost.
- A comment on the same line as an **empty key** (`items: # note`) ends up after the last item of the list the key gains.
- A comment directly attached to a **replaced scalar** survives when it trails the value on the same line, but not when the value changes into a list or map.
- A scalar changed to a type that needs different quoting takes the library's quoting.
- Two-spaces-after-colon or similar hand formatting inside a pair that *is* changed is normalised; outside changed pairs it is never touched.

## Behaviour differences from 0.17.1

Each is intended unless marked.

1. **Retire to `.trash/` instead of `trashFile`** (your ruling). `fileManager.trashFile` obeyed Obsidian's "Deleted files" setting (system trash, Obsidian's `.trash/`, or permanent delete). The only caller deleted backstage files that can be regenerated. Now `retire` always moves the file into `.trash/` inside the project root, and never overwrites: a name already there gives the incoming file `name (2).ext`.
2. **Guard**: the `_export/` allowance is removed; case, Unicode-normalisation and separator variants of protected folders are refused (`_Story-Library/…`, NFD spellings, `\` as a separator); drive-letter paths are refused. The 0.17.1 guard let some call sites skip it (creating chapters, creating the Codex and library folders); those are now explicit rows: a chapter or Codex note may be **created if absent**, never overwritten, renamed, retired or edited.
3. **Codex renaming is refused** (`CodexRenameUnavailableError`, and the guard has no Codex rename row). A blank, unchanged, or self-resolving name is still a quiet no-op, as before.
4. **Unreadable frontmatter** is "unavailable" (see above). 0.17.1 handed whatever Obsidian's parser produced to the code, which could treat it as empty and write defaults over the real contents.
5. **Minimal rewrites.** `processFrontMatter` re-dumped the whole frontmatter (losing comments and quoting); edits now touch only what changed. Writes are **skipped when nothing changes** (history files, `codex.md` pruning, sidecars) where 0.17.1 rewrote identical content.
6. **Unknown keys survive in more places**: inside Codex folder entries, in the word-count history file, and in chapter sidecars' frontmatter (0.17.1 rebuilt those from the keys it knew).
7. **Null values** are written as an empty value (`key:`), like 0.17.1's default files. Setting a key to `undefined` removes it. *I did not check how Obsidian's dump treated `undefined`; the cases in the code (clearing a planned length, say) are removals, which is what this does.*
8. **Chapter creation** no longer opens the new file (it returns `{ filename, chapterId, path }`); `createContinuingChapter` has no `openFile` option; `createIdeaChapter`, `registerCodexType` and its sibling-type machinery, and `tagFilterMode` are removed, as the brief listed.
9. **Codex "ghosts" are gone.** 0.17.1 asked `vault.adapter` for what was really on disk because Obsidian's index went stale after Finder deletes. The index is built from a scan and kept current by write-through and `applyChange`, so that machinery is deleted; its tests became "the name is reusable once the index is told the file was deleted".
10. **Word counts come from the index** (`countWords` over the whole file, the same function) instead of reading each chapter during `recordChapterEdit`. They are only as fresh as the index: a file changed outside the app must reach the index through `applyChange`.
11. **`renameChapterSidecar`** renames, then updates its `chapter` key, as two locked steps instead of one nested lock.
12. **A pre-0.17 layout is refused** at open (`LegacyLayoutError`, naming `storytellingForge 0.17.1`). The plugin used to migrate it.
13. **What no longer happens on load.** 0.17.1's `main.ts` ran, at layout-ready, `ensureEagerFolders`, first-run book and chapter seeding, `ensureSeriesFile`, `ensureTagRegistryFile` + `loadCodexTypesIntoRegistry`, pruning of missing Codex notes and chapter references, `ensureAllSeriesBookEntries`, `syncAllBookReferenceFields` and per-book `ensureAllChapterEntries`/`pruneMissingChapterEntries`. All of those functions exist, ported and tested, but **nothing calls them when a project opens**. Brief 4 has to decide what runs at open. In particular `CODEX_TYPES` (the live Codex type list, process-wide state as in the plugin) only reflects `tag-registry.md` after `loadCodexTypesIntoRegistry(project)` is called.
14. **`backup.ts` is gone.** It imported Obsidian; backups are the next piece of work. Its code and tests are at `plugin-harness-final`.

## Code that relied on the cache lagging behind writes

All of it was written to dodge Obsidian's metadata cache not updating synchronously after `processFrontMatter`. With a write-through index it is unnecessary but harmless, so it was **kept** (removing it would change signatures for no gain) with its comments corrected:
- `syncAllBookReferenceFields(project, booksOverride?, sequenceOverride?)` and `reorderSeriesBooks` pass the values just written;
- `ensureAllSeriesBookEntries` and `writeSeriesBookTitle` return the fresh entry/id;
- `ensureTagRegistryFile` returns the seed instead of re-reading, and `loadCodexTypesIntoRegistry(project, prefetched?)` accepts it.

Removed because dead with the index: the `adapter.list`/`adapter.exists` ghost handling in `codex.ts`. Not a lag workaround but an Obsidian write-back quirk (mutate the live object `processFrontMatter` handed over): a comment in `book.ts` and one test ("keeps chapter identity on the same object"), re-written to check the resulting file instead.

## `trashFile`

Described under difference 1. It differed from "retire to `.trash/`" only in that Obsidian chose the destination from a user setting; your ruling made the in-project `.trash/` the single behaviour. No hold was needed beyond the H1 question.

## Hold points

- **H1** (after the design doc): all five questions answered. The design was updated with the rulings (`docs/project-handle.md` §10) and the as-built differences (§11).
- **YAML that can't be rewritten minimally**: no construct needed a hold. The ones that can't be done safely are refused (above); the limits that remain are safe-and-listed.
- **Tests that can't be ported faithfully**: none were dropped. Four kinds were *adapted* because they tested Obsidian itself, each noted in the test: ghost-index cases (§9), the live-object identity case (above), `trashedPaths` checks (now "the file is under `.trash/`"), and the Codex rename cases (now "refused", since renaming is no longer offered). The stats-tooltip test went with `StatsPanel`, which was interface code.
- **`trashFile` differing from retire**: addressed at H1.
- **Chapter/folder renames relying on link updating**: they don't (checked at H1; reconciliation only re-keys metadata and moves backstage sidecars).

## Surprising

- The fixtures initially held an unquoted `title: Book #`. In YAML that is `Book` plus a comment, and the numbering code silently showed "Book " — the plugin's files always quote such values, and the writer here quotes them too (a test pins it).
- Obsidian's DOM extensions were a hidden dependency of the "DOM-only" helpers (`dragReorder`, `inkSlider` used `setCssStyles`, `createDiv`, `addClass`…). They now use plain DOM.
- The icon catalogue (`iconRegistry`, `icons`) is part of reading the tag registry, so it moved into `src/core/`; the Obsidian-specific `addIcon` registration went with the shell.
- The whole-file YAML history files (`wordcount.md`) are not frontmatter; the editor handles both (`editYamlText`).
- `CODEX_TYPES` is global mutable state shared by every `Project` in a process, exactly as in the plugin. Two projects open at once would share it.
- The fuzzer found two real bugs in code the unit tests had passed. It stays in the suite.

## Left in place that you may expect to be gone

`src/layout.ts`, `src/storytellingCenter.ts`, `src/view/codexOpenTarget.ts` and the `view/` DOM helpers (all Obsidian-free, with their tests); `AUDIT.md`, `docs/full-audit-2026-08-05.md` and `docs/text-labels.md` (not on any list); `fflate` in `package.json` (not Obsidian-specific; backups will need it).

## Not done

- **The real-vault check: waived by Kenny.** `npm run check -- <folder>` has not been run on anything real; the first real-vault contact will be when the new engine replaces Obsidian. It remains the way to learn whether a real vault holds YAML the editor refuses, and how long the eager scan takes.
- Merged to `main` and pushed after the waiver.
