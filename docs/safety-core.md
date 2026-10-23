# The safety core: design (Brief 3)

Status: **for review at H1. Nothing here is implemented.** Section 11 lists the questions I need ruled on. Everything is TypeScript in `src/core/`, tested against fixtures; no interface, Tauri, Rust or watcher.

## 1. Principles carried over

- Disk format frozen (decision 14). The only new store, the session snapshot, lives outside the project.
- Prose is written only by the **prose writer** (typing) and the **link rewriter** (Codex rename). Reconciliation, opening, backups and recovery never write prose.
- Never overwrite, never merge: the disk wins; the author's text goes to recovery.
- Nothing is deleted. Removal is `retire` to `.trash/` (backstage sidecars) and pruning a backstage *entry* only after its contents are in a `_pruned` recovery file.
- `_sf-backup/` is create-only.

## 2. Backend and guard additions

### 2.1 Backend

Two new operations on `Backend`, kept deliberately narrow:

```ts
/** Writes `text` only if the file's current text equals `expected`. Resolves "written" or "conflict". */
writeTextIfUnchanged(path: string, expected: string, text: string): Promise<"written" | "conflict">;
/** Create-if-absent, exclusive. (Already `createFile`; recovery/backup use it.) */
```

`rename` already exists and is exclusive. Recovery and backup files use the existing `createFile`; the guard distinguishes them by path (§2.2).

`GuardedBackend` gains typed entry points rather than a generic "op" argument, so the architecture test (§2.3) can grep for them:

| Method | Guard op | Callers allowed |
|---|---|---|
| `proseWrite(path, expected, text)` | `prose-write` | `src/core/proseWriter.ts` only |
| `linkRewrite(path, expected, text)` | `link-rewrite` | `src/core/linkRewriter.ts` only |
| `codexRename(from, to)` | `codex-rename` | `src/core/linkRewriter.ts` only |
| `createBackup(path, bytes)` | `backup-create` | `src/core/backup.ts` only |
| `createRecovery(path, text)` | `recovery-create` | `src/core/recovery.ts` only |

The existing `modify*`/`write*` paths keep their current rules; they still refuse chapter and Codex-note overwrites.

### 2.2 Guard rows (§3.8 of the brief)

- **prose-write**: existing file at `_story-library/<book>/<name>.md` (placed or unplaced chapters) or `Codex/<name>.md`. Refused: archived (decided from the index, see §3.4), `notes/`, anything deeper than one level, non-`.md`, and every case/NFD/separator variant of the protected folders.
- **link-rewrite**: existing `.md` in `_story-library/**`, `Codex/**`, `notes/**`.
- **backup-create**: `_sf-backup/<name>.zip`, exactly one level, absent.
- **recovery-create**: `_sf-backup/recovery/**.md`, absent.
- **codex-rename**: `Codex/*.md` to `Codex/*.md`, destination absent.

"Archived" is not visible in a path, so the guard takes an `isArchived(path)` predicate from the project at construction (the index knows from frontmatter and `codex.md`). The guard spec table gains a column for that fact so the Rust guard can be given the same input.

### 2.3 Architecture test

A vitest test scans every non-test file under `src/` for the five method names above and for imports of `proseWriter`/`linkRewriter`/`backup`/`recovery`, and fails unless each appears only in its permitted file (and the barrel is not re-exporting the raw methods). Test files and `test/` are exempt but must go through the public APIs.

## 3. The prose writer (`proseWriter.ts`)

### 3.1 Sessions

`ProseWriter.open(project, path)` returns a `ProseSession` or throws a typed `ProseRefused` (archived, `notes/`, out of scope, unreadable frontmatter, iCloud placeholder). One file, one session: a second `open` returns the existing session. Keys are compared with the index's case-insensitive NFC lookup.

A session holds `lastKnownText` (raw, whole file), `frontmatterBlock` (the exact leading bytes up to and including the closing `---` line and its newline, or `""`), `body`, `dirty`. It exposes `body`, `setBody()`, `onDiskChange`, `save()`; never the frontmatter.

### 3.2 Rebuilding the file

Port of `serialiseChapterFile`: `frontmatterBlock + body`, with the file's line-ending style (LF/CRLF) preserved and the trailing-newline convention of the original body. A test pins that `serialise(split(text)) === text` for every fixture and fuzzed input, so an unedited session round-trips byte-identically.

### 3.3 Saving

Per-file serial queue (the same mechanism as `GuardedBackend`'s per-path queue, shared so saves and disk-change handling never interleave). Debounce is 2 s after the last `setBody`, via an injected clock/timer so tests are deterministic. `flushAll()` bypasses the debounce.

Steps as in the brief §3.1. Result type:

```ts
type SaveResult =
  | { kind: "saved" }
  | { kind: "conflict"; recoveryPath: string }          // disk won, session reloaded
  | { kind: "refused"; reason: string; recoveryPath: string }
  | { kind: "error"; error: Error; recoveryPath?: string } // recovered if this was a flush
  | { kind: "recovery-failed"; error: Error }            // text stays in the session
```

If `createRecovery` fails, nothing else happens to the session: the text stays, and the result says so.

### 3.4 Archived

A save re-checks archived status from the index immediately before the write (inside the queue). If the chapter became archived (or its Codex note did) since the session opened, the save is refused and recovered. The guard's `isArchived` is the backstop.

### 3.5 Outside changes: `decideDiskChange`

Ported verbatim from the 0.17.1 history (`manuscriptSync.ts`): `diskText === lastKnownText` → ignore (own echo or no change); not dirty → reload; dirty → recover then reload. Recovery failure → no reload, report. After a reload of a chapter, the after-save hook runs.

`minimalReplacement` (also in that file) is a editor concern (cursor-preserving diff for the interface); it is ported only if the interface needs it in Brief 5, and is out of scope here unless you say otherwise.

### 3.6 After-save hook

`proseWriter.onChapterChanged(listener)`; listeners run in registration order, each in try/catch so one failing subscriber can't block another or the save. Built-in subscribers: fingerprint sidecar update and `recordChapterEdit` (word count from the index, which write-through has just refreshed). Codex notes emit no event. Hook failures are reported in the result, never turned into save failures.

## 4. Recovery files (`recovery.ts`)

Paths as in the brief §3.2. Timestamp is local time `yyyy-mm-dd hhmmss`. Name clashes get ` 2`, ` 3`… decided by an exclusive create loop (create fails with EEXIST → next suffix), not by checking first. `_pruned` files are:

```
# Pruned: <what> from <where> because <why> (<timestamp>)
<yaml of exactly what was removed>
```

The `.md` is not frontmatter-delimited, so it cannot be mistaken for a chapter.

## 5. Backups (`backup.ts`)

Port of 0.17.1 `backup.ts` onto `Backend`: fflate zip builders, same filenames, store-not-deflate for pre-compressed extensions, exclusions as listed. File lists come from `backend.scan`, not the index, so hidden folders are covered for the full backup.

- **Scope** for session/automatic: `_story-library/`, `Codex/`, `notes/`, `_backstage/` and their cover images. One function, `backupScope(entries)`, so changing it is a one-line decision.
- **Kinds:** `session`, `automatic`, `full`, `pre-rewrite` (explicit file list + the renamed note).
- **Single flight:** one in-process promise; a second request awaits and reuses it. (A *different kind* requested while one runs also waits and reuses, which is a deliberate simplification: say if a full backup must never be satisfied by a scope backup, and I'll queue it instead.)
- **Due:** pure `isBackupDue(mode, lastBackupAt, now)` for `every-open`/`daily`/`weekly`.
- **iCloud placeholders:** listed in the result's `notIncluded`, never read.
- A zip is built in memory, then created exclusively; a name clash gets ` 2`. Memory use is the project size; fine for a manuscript, flagged for Brief 4 if the full backup meets large media.

## 6. The session snapshot (`snapshotStore.ts`)

```ts
interface SnapshotStore { load(projectRoot: string): Promise<Snapshot | null>; save(projectRoot: string, s: Snapshot): Promise<void>; }
```

Node-fs implementation takes a folder; one file per project, named by the SHA-256 of the absolute root path, written atomically (temp + rename).

```json
{ "version": 1, "root": "/abs/path", "savedAt": "ISO-8601",
  "files": [ { "path": "_story-library/ccd/01 Intro.md", "hash": "…", "kind": "chapter", "opening": "…", "closing": "…" },
             { "path": "Codex/Mira.md", "hash": "…", "kind": "codex" } ] }
```

Hash is the index's body hash. Opening/closing fingerprints are copied from the fingerprint sidecars at save time. Load rejects a wrong version, a root mismatch, or bad JSON as "no snapshot". Save never throws into the caller (returns a result); a failure is only reported. Debounce is the caller's (Brief 4 wires it); the core exposes `Project.snapshot()` and `saveSnapshot()`.

## 7. Reconciliation (`reconciler.ts`)

Input `{ vanished: string[], appeared: string[] }`, plus an evidence source: `knownHashes(path)` (live index during a session, snapshot at open) and the fingerprint sidecars (read from the index, since sidecars are backstage and survive the chapter's disappearance).

1. **Gates first** (§3.5): per book, `unavailable` if the folder is missing, or empty while the novel file lists chapters; `Codex/` missing while `codex.md` lists entries. Gated areas are skipped wholesale: no matching, pruning or adding there, and all vanished paths in a gated area are excluded from the change set.
2. **Placeholders** are filtered out of both sets before anything else: a `.Name.md.icloud` stub is "present, not downloaded" for `Name.md`.
3. **Book folder renames**: a vanished library folder and an appeared one with identical chapter filename sets (non-empty) → move the backstage folder, rekey the series entry. Their chapters then drop out of the change set.
4. **Tier 1** then **tier 2** matching with the one-to-one-both-ways test; empty body hash (hash of empty/whitespace body) and empty fingerprints are never evidence. Tier 2 breaks fingerprint ties with the closing fingerprint, still requiring uniqueness.
5. **Actions** for matches use the existing handlers (`reconcileRename`, the cross-book move, Codex rename rekey). *I need to confirm during implementation that the 0.17.1 cross-book move path exists in today's `reconciliation.ts`; if it does not, that is a hold.*
6. **Unmatched vanished** → recover-then-prune; **unmatched appeared** chapters → new unplaced entries (via `ensureAllChapterEntries`, only for ungated books, only after the above). Unmatched Codex appearances: nothing.
7. The result is a `ReconcileSummary` with `matched[{tier,from,to}]`, `pruned[{what,recoveryPath}]`, `ambiguous[{vanished,candidates}]`, `added`, `gated`, `skipped`, `snapshot: "used" | "missing"`.

Prune never touches prose: it edits `codex.md` / novel files and retires sidecars only.

## 8. Opening and creating (`openProject.ts`)

`openProject(root, { backend, snapshotStore, guard options })` follows the seven steps of the brief verbatim. "Writes nothing unless needed" is achieved because every ensure function already skips no-op writes (Brief 2, difference 5); a test hashes the whole folder before and after a second open. One project per process is a module-level latch released by `project.close()`. Prune-at-open functions (`pruneMissingChapterEntries`, `pruneMissingCodexNotes`, `pruneMissingChapterCodexRefs`) are removed from the public surface; any part the reconciler needs is internalised in `reconciler.ts`, and the rest deleted with their tests rewritten against the reconciler.

`createProject(root, { seriesTitle, standalone })` requires emptiness ignoring hidden folders and `.DS_Store`, then calls the existing seeders in the 0.17.1 order.

## 9. Link rewriting (`linkRewriter.ts`)

**Plan** (pure reads): tokenise each markdown file once with a small scanner that tracks fenced code (``` and ~~~, with length rules), indented-code is *not* treated as code (matches Obsidian), inline code spans, and `%%…%%` comments; and separates frontmatter. Link candidates are matched only outside those regions. Forms: wikilinks and embeds with optional `#heading`/`#^block`/`|display` in any combination; path-qualified `Codex/X`, with or without `.md`; markdown links `[t](Codex/X.md)` with `%20`-style encoding and the angle-bracket form `<Codex/X.md>`; wikilinks inside frontmatter string values.

Resolution: path-qualified always counts; bare counts only if `Codex/X.md` is the sole project file with that case-insensitive NFC basename (basename of *any* extension-less target? No: markdown files only, as the brief says), else ambiguous. Plan output: old/new names, per-file spans `{start,end,old,new}`, ambiguous list, outside-folder count (read-only, other markdown), and each file's hash.

**Apply**: as in the brief, steps 1 to 6. Before each write, the minimality check rebuilds `original` from `result` by reverse-applying the planned spans and compares; any mismatch refuses the write. Frontmatter spans go through `editFrontmatter` and the check runs on the whole file. Writes use `linkRewrite` (compare-then-write against the planned text), so a file that changes between the hash check and the write is also caught and reported as skipped.

If the apply fails after the rename (some files rewritten, a later step throws), the result lists exactly what was and wasn't done and the backup path; there is no rollback (nothing is overwritten from backup automatically). The rekey of backstage files runs even if some rewrites were skipped, because the note itself has been renamed.

## 10. How compare-then-write is made atomic on node-fs

POSIX offers no "replace this file if it still has this content" call. The node-fs implementation does the following inside the per-path queue:

1. Write the new text to a temp file in the same directory and `fsync` it.
2. Read the target, compare with `expected` (byte-wise, after the same decoding `readText` uses).
3. If equal, `rename(temp, target)` (atomic replace); otherwise delete the temp and return `"conflict"`.

Within this app, nothing else can touch the file between steps 2 and 3 (the queue serialises every write path through one `GuardedBackend`). Against an **external** writer (Obsidian, Dropbox, iCloud) there remains a window of two syscalls (read, rename) in which an outside write would be overwritten. I do not think this can be closed from Node. This is the brief's hold point ("the backend can't make compare-then-write atomic"), so I am reporting it now rather than later; see question 1.

## 11. Questions for H1

1. **Atomicity.** Accept "atomic against the app, a two-syscall window against external writers" for the TS backend, and require the Rust backend (Brief 4) to close it with an atomic swap (`renamex_np(RENAME_SWAP)` on APFS, verify the displaced content, swap back on mismatch)? Or add a stat check (mtime+size+inode) just before the rename to narrow the window further in TS? I recommend the stat check now, Rust swap later.
2. **Backup scope** is as the brief says (differs from 0.17.1); that is Kenny's confirmation, not mine. I'll build it as a one-function definition.
3. **Single-flight across kinds** (§5): reuse any running backup, or queue a *full* backup behind a scope one? I recommend queueing.
4. **`minimalReplacement`** (§3.5): leave for Brief 5, or port now?
5. **Archived detection for the guard** (§2.2) via a predicate injected from the project. Acceptable, or should the guard re-read frontmatter itself?
6. **Cross-book move** (§7.5): I will check whether it still exists in `reconciliation.ts`; if it only existed in the removed UI path, do you want it rebuilt (small behaviour addition) or treated as a hold?
