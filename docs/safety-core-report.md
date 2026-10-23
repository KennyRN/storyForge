# Safety core report (Brief 3)

The data core now has the five things that keep the author's words safe, and the order of opening and creating a project is a tested guarantee: the single prose write path, recovery files, backups, link rewriting on Codex rename, and reconciliation (match, then recover, then prune). Everything is TypeScript in `src/core/`, tested against fixtures. Verified by typecheck and 998 tests (a clean `npm ci` was run at the end of Brief 2; dependencies did not change in Brief 3). **Nothing has been run against a real vault, and none of it has been seen in an app** (waived: the first look is when the new engine goes in). There is still no interface, Tauri, Rust or file watcher.

## Size

| | End of Brief 2 (`2508f2d`) | End of Brief 3 |
|---|---|---|
| `src/`, excluding tests | 9,430 lines | 12,159 lines (about 2,160 of them the icon catalogue and SVGs, unchanged) |
| Test files | 44 | 53 |
| Tests | 727 | 998 |
| Guard table rows | 127 | 216 |
| Disk-safety operations | 117 (data layer) | 117 + 37 (safety core) |

New modules: `proseFile`, `proseWriter`, `recovery`, `backup`, `snapshot`, `reconciler`, `openProject`, `linkScan`, `linkRewriter` (in `src/core/`), `snapshotStore` (node-fs), and `test/architecture.test.ts`.

## What it guarantees, and how it is proved

- **One prose write path.** `ProseWriter` is the only caller of `proseWrite`; `linkRewriter` is the only caller of `linkRewrite` and `codexRename`; `backup.ts` and `recovery.ts` are the only callers of `createBackup` and `createRecovery`. The guard cannot see who calls, so `test/architecture.test.ts` scans `src/` for the calls and for imports (type-only imports grant nothing), and checks that reconciliation, backups, recovery, the snapshot and the index never import either writer.
- **Frontmatter byte for byte.** The writer carries the frontmatter block through untouched and restores the file's line endings; `serialise(parse(raw)) === raw` is tested over BOMs, CRLF, no trailing newline and unclosed fences. The disk-safety suite has a `prose` check: after any prose write the frontmatter section and line-ending style are byte-identical.
- **Never overwrite, never merge.** A conflict leaves the disk untouched, the author's body goes to a recovery file whose contents are tested to be exactly that text, and the session reloads. An outside change with unsaved text is recovered before it is reloaded; if recovery fails nothing is reloaded and the text stays in the editor.
- **A failed backup never costs typing.** The save goes ahead and the failure is reported once. The opposite holds for a rewrite: a failed pre-rewrite backup stops it with nothing changed.
- **Opening an up-to-date project writes nothing**: tested by hashing the folder after the first open and after the next two (with and without a snapshot). The first open of the fixture writes no chapter, Codex note, `notes/`, `_export/` or other residue.
- **Recover, then prune.** A `_pruned` file holding the entry's contents (chapter details, or the Codex note's type, folder membership, archive state and every reference to it) is created first; only if that succeeds is the entry removed and its sidecars retired to `.trash/`. If the recovery write fails nothing is pruned (tested).
- **`_sf-backup/` is create-only** through every route; the guard rows and a test try to overwrite, rename and retire a backup.
- **Link rewriting is minimal by proof.** Before each write the rewritten text is checked against the original: the body equals the original with exactly the planned spans replaced; the frontmatter parses to the original data with exactly the planned strings replaced and only lines that held a link may differ; otherwise the file is skipped and listed. The fuzzer builds 3,000 random documents (links in every form, code fences, inline code, comments, tables, CRLF, frontmatter with comments and lists) together with the text each must become, and checks the result byte for byte plus that every byte outside the planned spans is unchanged; a further 150 go through the whole apply (backup, rename, rewrite, re-key).

## How compare-then-write is atomic

Nothing in POSIX replaces a file only if it still has given contents, so no backend can make it truly atomic against writers outside the app. What exists, per the H1 ruling:

1. **Within the app** the comparison and the write are not separable: every write goes through `GuardedBackend`, which holds a per-path queue; the prose writer additionally serialises everything for a file (saves and outside changes).
2. **node-fs** (`writeTextIfUnchanged`): write the new text to a temp file beside the target and sync it; read the target's bytes and compare them with the UTF-8 of the expected text (so a file with bytes that aren't valid UTF-8 is a conflict, never silently rewritten); check that the target's device, inode, size and mtime are as they were when it was read; then atomically rename the temp file over it. Any difference removes the temp file and reports a conflict. Tests simulate an outside writer replacing or appending to the file between the comparison and the swap.
3. **What remains** is the window between that last identity check and the rename: microseconds, where an outside writer (Obsidian, iCloud) could be overwritten. This is the accepted risk of the H1 ruling, backed by recovery files and the session backup. The Rust backend (Brief 4) narrows it with an atomic swap.

## Differences from 0.17.1

Each is intended unless marked. Further detail is in `docs/safety-core.md` §13.

1. **Recover, then prune** replaces prune-at-load. 0.17.1 silently dropped a missing chapter's or note's details; now a rename is matched first, and anything else is written to a `_pruned` file before it is removed.
2. **Gates.** Nothing is matched, pruned or added for a book whose folder is missing, or empty while its details list chapters; for a missing Codex while `codex.md` lists notes; for backstage files that can't be read (a gate the brief did not list); or for an area holding iCloud placeholders (a book with any placeholder is gated whole). 0.17.1 would have pruned them.
3. **iCloud placeholders** (`.Name.md.icloud`) are recorded in the index as present but not downloaded: never missing, never matched, never pruned, never opened for editing, never read by a backup (listed as "not included"). Reading one rejects with a typed error.
4. **The bare-link rule.** `[[X]]` is rewritten only when `Codex/X.md` is the only markdown file in the project with that name (case-insensitive, Unicode-normalised; a placeholder with the same name counts). Stricter than Obsidian's resolution on purpose. Path-qualified and markdown links always count.
5. **Backup scope.** Session and automatic backups hold `_story-library/`, `Codex/`, `notes/` and `_backstage/` rather than the whole vault; it is one function (`inBackupScope`) if Kenny chooses the whole folder. Backups are never overwritten (0.17.1 overwrote a same-day automatic backup).
6. **A renamed book folder now also renames its `novel-<code>.md`.** *This is a 0.17.1 behaviour that turned out different from how the brief describes it* ("move the book's backstage folder, and rekey the series entry"): the old handler stopped there, which left the book's chapter details under the old code. See "Hold points" below.
7. **Codex rename** is real, and refuses a new name containing `[ ] # ^` (links can't carry them; the existing sanitiser allows them).
8. **Mixed line endings** in a chapter are normalised to the file's first line ending on its first save, as 0.17.1's continuous mode did (`parseChapterFile` / `serialiseChapterFile` are ported unchanged). A file with consistent endings, a BOM, no trailing newline, or frontmatter round-trips exactly. If this matters for imported manuscripts, say so and the writer can refuse such files instead.
9. **`createProject`** ignores any hidden entry in the folder (the brief said hidden folders and `.DS_Store`), because the `empty` fixture and real folders hold `.gitkeep`, `.obsidian/` and the like, and the index ignores them too.
10. **Guard.** `_sf-backup/` write, binary write, create and rename rows (placeholders from Brief 2) are now refused; `notes/` may be created (by `createProject`); `link-rewrite` is any `.md` under the three storyForge folders, including novel files and `series.md`.

## Prune-at-open functions

Removed, with their tests: `pruneMissingChapterEntries`, `stripMissingChapterRefs`, `pruneMissingChapterCodexRefs`, `pruneMissingCodexNotes`, `stripMissingCodexNoteRefs`, `reconcileMissingCodexNotes`, `reconcileExternalCodexChange`. Nothing was kept internally: the reconciler prunes through `handleChapterDelete` and `reconcileDelete`, which are older and unchanged. Also removed: `renameCodexNoteFile` and `CodexRenameUnavailableError` (replaced by `renameCodexNote`).

## Hold points

- **H1** (after `docs/safety-core.md`): six questions, all ruled (decision 21). Recorded in `docs/safety-core.md` §12.
- **Compare-then-write can't be atomic**: reported at H1 and ruled (an inode/size/mtime check now, an atomic swap in the Rust backend, the rest an accepted risk).
- **A 0.17.1 behaviour differed from the brief: the book-folder rename.** I did not stop; I made the smallest fix inside the new reconciler (rename `novel-<old>.md` to `novel-<new>.md` when the target is absent) because without it the "keep backstage files true" goal fails and the data is orphaned rather than lost. **If you would rather have the 0.17.1 behaviour or a different fix, say so; it is one block in `reconcileBookRenames`.** The cross-book chapter move the brief mentions exists in 0.17.1 and in Brief 2's port; nothing was missing.
- **The link-resolution rule and common forms.** No common form is left unhandled that the brief lists. Known and deliberate limits: indented code blocks are not treated as code (links in them are rewritten); an unquoted `related: [[Jane]]` in frontmatter is YAML for a nested list, not a link, so it is not rewritten (Obsidian writes these quoted); links through a note's `aliases` are not resolved; a frontmatter list holding a link is rewritten whole by the editor, so a list whose other items need re-quoting is skipped and listed rather than reformatted.
- **Nothing was added to the project's disk format.** The snapshot is stored where the caller says, outside the folder. The files this brief writes into the project are the 0.17 ones: `_sf-backup/` zips and recovery files, and the existing backstage files.

## Surprising

- **The fuzzer found a real bug.** A closing code fence in a file with CRLF line endings never closed, so every link after the first code block in a CRLF chapter was invisible to the scanner. Fixed, with a test.
- **Each chapter save re-syncs every live chapter's word count** in the book's `wordcount.md` (0.17.1's `recordChapterEdit` did, and still does). The disk-safety checks for the after-save hook therefore allow the whole `chapters` map in that file to change.
- **`insertChapterEntry` writes `archive:` as an empty list** into the destination book when a chapter moves between books (0.17.1 behaviour); the cross-book disk-safety operation allows it.
- **On macOS a different capitalisation of a path opens the same session** (the file system and the index agree), so "one file, one session" holds across spellings. On a case-sensitive file system those are different files; the index flags a pair as a collision and the prose writer refuses a file with a collision.
- **The `empty` fixture is not empty**: it holds a `.gitkeep`, which is why `createProject` ignores hidden entries.
- **A watcher-seen rename needs its evidence before the index changes**: `evidenceFromIndex(project, paths)` must be called before `applyChange`. Brief 4's watcher integration has to do that (or hand the reconciler the snapshot's evidence).

## Not done

- Anything that needs an interface, Tauri, Rust, the file watcher, app settings or the backup schedule's wiring (`isBackupDue` ships as a pure function); downloading iCloud placeholders; where the snapshot lives on disk; backup retention (backups accumulate; nothing in `_sf-backup/` is ever deleted).
- The real-vault check of Brief 2 stays waived. The first contact with a real vault will be when the new engine goes in; `npm run check -- <copy>` is still the way to learn whether a real vault holds YAML the editor refuses.
