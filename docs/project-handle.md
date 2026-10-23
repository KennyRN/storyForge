# The project handle (design for review — Brief 2, H1)

Status: **proposal, no implementation yet.** Written from a read of the 0.17.1 data layer at `plugin-harness-final`. Section 9 lists the questions I'd like answered before I write code.

## 1. What the data layer uses from Obsidian today

Measured over the modules Brief 2 ports (call counts are occurrences in source):

| Obsidian surface | Used for | Where |
|---|---|---|
| `metadataCache.getCache(path).frontmatter` | **synchronous** frontmatter reads | `series` ×1, `book` ×1, `codex` ×1, `tagRegistry` ×1 (each is the single read-helper of that module) |
| `vault.getAbstractFileByPath` | existence, file/folder lookup, listing via `.children` | everywhere (~45) |
| `vault.read` / `cachedRead` | body reads | `series`, `book`, `chapterSidecar`, `history` |
| `vault.create` / `createFolder` / `modify` / `modifyBinary` / `createBinary` / `rename` | writes | `writeGuard` (all but two), plus `book.createChapter` (`vault.create(path, "")`) and `book`/`codex` folder creation (these deliberately bypass the guard today) |
| `fileManager.processFrontMatter` | every frontmatter write | `writeGuard` ×2, `chapterSidecar` ×1 |
| `fileManager.renameFile` | **link-updating** rename | `linkRewriter.renameCodexNote` (Brief 3; refused in Brief 2) |
| `fileManager.trashFile` | the only delete | `writeGuard.deleteBackstagePath` only |
| `vault.adapter.list` / `exists` | on-disk truth when the vault index is stale | `codex` ×4 (`reconcileMissingCodexNotes` and its helpers) |
| `workspace.getLeaf().openFile` | interface | `book.createChapter` ×1 |
| `vault.on("rename"/"delete")` | event wiring | `reconciliation` (to be dropped, §7) |

Two findings the brief asked me to verify:

- **Chapter and book-folder "renames" do not rely on link updating.** The data layer never renames a chapter or book folder file itself: `renameChapterTitle` / `renameBookTitle` change a title in frontmatter, and the file/folder renames in `reconciliation.ts` are *reactions* to a rename done elsewhere (they re-key `novel.md`/`series.md` entries and move sidecars with `renameBackstagePath`, which is a plain `vault.rename`, no link updating). The only link-updating call in the whole layer is `renameCodexNoteFile`. So the brief's claim in §3.6 holds.
- **`trashFile` is not a fixed behaviour.** Obsidian's `FileManager.trashFile` obeys the user's *Files & Links → Deleted files* setting: system trash, `.trash/` inside the vault, or permanent delete. I haven't verified which of the three is Obsidian's default. So "move to `.trash/` inside the project root" is **not** what 0.17.1 always did; it is one of three behaviours depending on a setting. I'm flagging this as the brief's hold condition ("hold if it differs"). **Proposal:** treat it as a documented difference and proceed with `.trash/` retire, because (a) the only caller deletes regenerable backstage sidecars (`wordcount`, chapter sidecars, `story-details/`), never prose; (b) an in-project `.trash/` is the only option that works the same on every platform and keeps the app from needing the OS trash. If you'd rather I stop, say so.

### Cache-lag workarounds (brief §3.1)

Code written around Obsidian's cache not updating synchronously after `processFrontMatter`:

- `book.syncAllBookReferenceFields(app, booksOverride?, sequenceOverride?)` and `reorderSeriesBooks`: pass values just written instead of re-reading (`book.ts` ~525–575).
- `series.ensureAllSeriesBookEntries` / `writeSeriesBookTitle` return the fresh entry so callers don't re-read (`series.ts` ~230, ~285).
- `tagRegistry.ensureTagRegistryFile` returns the seeded shape directly, and `loadCodexTypesIntoRegistry(app, prefetched?)` takes it (`tagRegistry.ts` ~141).
- `book.chapterEntryForWrite`: a comment about spreading vs mutating the live object from `processFrontMatter` (an Obsidian write-back quirk, not a lag).
- `codex.ts`: `adapter.list`/`exists` used because the vault index goes stale after Finder deletes.

Plan: with a write-through index none of the *lag* workarounds is needed, but they are harmless return values and optional parameters. I'll remove each only when its callers show it is dead, and list every one in the report. The `adapter` workarounds disappear with the port (the index is rebuilt from a scan and `applyChange`).

## 2. Layers

```
data layer (series, book, codex, …)          src/core/…
        │  uses only
        ▼
Project                                       src/core/project.ts
  ├─ index   : ProjectIndex   (sync reads)    src/core/index/…
  ├─ fs      : GuardedBackend (async writes)  src/core/backend/guarded.ts
  └─ frontmatter module (parse / mutate)      src/core/frontmatter.ts
        │  fs calls go through
        ▼
Guard (rule table)  →  Backend interface      src/core/backend/{types,guard}.ts
                              │ implemented by
                              ▼
                       NodeFsBackend           src/backends/node-fs/
```

- The data layer receives a `Project` (what `app` was). It cannot reach the raw backend or skip the guard: `Project` only exposes the guarded wrapper.
- **Write-through is done by `Project`, not by the backend.** A `Project` write is: guard check → backend write → parse the new text (frontmatter, word count, hash) → update the index → resolve. So the index is correct before the caller's `await` returns, and the backend stays a dumb file-system adapter (important for Brief 4, where the Rust side is the backend).

## 3. The index

```ts
type Kind = "file" | "folder";
interface IndexEntry {
  path: string;          // project-relative, "/" separators, on-disk spelling (NFC-normalised for lookups only)
  kind: Kind;
  size: number;          // files
  mtimeMs: number;
  // markdown files only:
  frontmatter?: FrontmatterRecord | null;   // parsed (read-only snapshot); null = no/invalid frontmatter
  frontmatterError?: string;
  wordCount?: number;    // body only (after frontmatter), using core/wordCount rules
  hash?: string;         // sha-256 of the full file bytes, hex
}
interface ProjectIndex {
  get(path: string): IndexEntry | undefined;           // case-insensitive, NFC
  exists(path: string): boolean;
  list(folder: string): IndexEntry[];                  // direct children, stable order (name, case-insensitive)
  frontmatter(path: string): FrontmatterRecord | null; // sync
  wordCount(path: string): number;
  collisions(): Collision[];                           // groups of ≥2 entries that fold to the same key
  applyChange(c: Change): Promise<void>;               // {created|modified|deleted|renamed}; index only
}
```

- **Build:** `openProject(backend)` runs one recursive scan, reads every `.md` file once (for frontmatter, word count, hash) with bounded concurrency, and skips hidden folders. The skip list is `.obsidian/`, `.git/`, `.trash/` and any other dot-folder; nothing in the ported modules reads inside them (the one reader that does — backups — is Brief 3 and will use the backend directly).
- **Lookup key:** `path.normalize("NFC").toLowerCase()` per segment. Unicode case-folding beyond `toLowerCase` (e.g. `ß`) is not attempted; collisions *that this key misses but a case-insensitive file system treats as equal* can't occur on APFS/NTFS for these inputs except for exotic folds — noted as an accepted limit.
- **Collisions:** every colliding entry is stored (keyed by exact on-disk path), `get()` for the folded path returns the first by on-disk-path order and sets `entry.collision = true`; `collisions()` lists the groups. Nothing is merged or dropped; the CLI check (§5.4 of the brief) prints them. Data-layer code that would act on a collided path throws `PathCollisionError` rather than guess.
- **Write-through details:** `Project.writeText(path, text)` re-parses `text`; renames move the entry (and children, for folders); retire removes the entry and adds the `.trash/` entry only if it is under the project root and not hidden (it is hidden, so: removed only).
- **`applyChange`** re-reads the file from the backend (or removes the entry). It never writes. Until Brief 4 only tests call it.
- **Large files:** the whole file is read once at scan to hash and count. A manuscript chapter is ≤ a few hundred KB; fine. Hash/word-count of binary files (covers) are skipped (`size` only).
- **Frontmatter shape served to readers:** a plain JS object produced by the same parser the writer uses (see §5), so reads and writes agree. This replaces `metadataCache.getCache(path)?.frontmatter`. Obsidian's cache differs in details (it drops keys with `null`/empty? it keeps them; parses dates as strings) — the YAML core schema we use is the same for every value the code reads (strings, numbers, booleans, arrays, maps, `null`). I'll add fixtures for `null` and numeric-looking values to prove it.

## 4. The backend

```ts
interface Backend {
  scan(): AsyncIterable<ScanEntry>;                           // recursive, includes hidden so caller can skip
  readText(path): Promise<string>;                            // UTF-8, BOM stripped, text returned as-is (CRLF kept)
  readBinary(path): Promise<Uint8Array>;
  writeText(path, text): Promise<void>;                       // atomic: temp file beside target, fsync, rename
  writeBinary(path, data): Promise<void>;                     // same
  createFile(path, text | data): Promise<void>;               // fails if exists
  createFolder(path): Promise<void>;                          // idempotent mkdir -p
  rename(from, to): Promise<void>;                            // fails if `to` exists
  retire(path): Promise<void>;                                // move into <root>/.trash/, never overwrite
  stat(path): Promise<Stat | null>;
}
```

- **No `delete`.** `retire` moves to `.trash/<original path>`; if that exists it appends ` (2)`, ` (3)`… (Obsidian's `.trash` does the same). The retired file's index entry is removed.
- **Line endings:** `Project.writeText` is given the *new frontmatter-edited text* built from the old text, so CRLF/LF/no-trailing-newline are preserved by construction (§5). New files are `\n`. The backend never transcodes.
- **Per-path serialisation** (today's `enqueueBackstageWrite`): the `GuardedBackend` keeps a `Map<normalisedPath, Promise>` chain; every mutating call on a path (and the destination of a rename) queues behind the previous one. This is a guarantee of the guarded layer, so it holds for any backend.
- **Atomic write:** temp name `.<name>.<random>.tmp` in the same directory, `fsync`, `rename` over the target. A crash leaves the old file or the new file, plus at worst a `.tmp` that the scan ignores (dot-prefixed).
- **Errors:** `BackendError` with a `code` (`ENOENT`, `EEXIST`, …) so the data layer can keep today's behaviours such as "create threw because the file already exists → modify".

## 5. Frontmatter module (`src/core/frontmatter.ts`)

**Library: [`yaml`](https://github.com/eemeli/yaml) 2.9.1 (ISC licence, no runtime dependencies).** Its `Document` API parses to a tree that retains comments, scalar quoting style and block/flow style, and re-emits unchanged nodes verbatim. Licence record: ISC permits use/modification with the notice retained — I'll add it to `Code Attributions.md`.

```ts
interface FrontmatterDoc {
  raw: string;              // the whole file text, untouched
  eol: "\n" | "\r\n";       // detected from the opening fence
  bom: boolean;
  hasFrontmatter: boolean;
  data: FrontmatterRecord;  // parsed snapshot
}
parseFile(text): FrontmatterDoc | ParseError
editFrontmatter(text, (fm) => void): string     // returns the new full text
```

**How a mutation stays minimal** (the data layer keeps its `(fm) => { fm.key = … }` callback style, so ported code doesn't change shape):

1. Split the file into `---` fence / YAML block / rest, remembering the exact fence text, the EOL, and the body bytes. The body is never parsed or reformatted.
2. Parse the YAML block with `parseDocument` (core schema, `uniqueKeys` on, `merge` off). Take `before = doc.toJS()`.
3. Run the callback on `after = structuredClone(before)`.
4. Diff `before → after` **recursively down to leaf values**: for each changed path call `doc.setIn(path, value)` / `doc.deleteIn(path)` / `doc.addIn`. Arrays whose length or contents changed are replaced as a whole sequence at that key (the sequence nodes' own item formatting is regenerated; the rest of the document is not touched). Keys the callback didn't change are never visited, so unknown keys, comments, quoting and key order are not rewritten.
5. `doc.toString({ lineWidth: 0 })` for the block, join EOL-converted to the detected EOL, re-attach fences and body. If the callback changed nothing the original string is returned byte-for-byte (so no write happens).
6. Self-check on every edit (cheap, always on): re-parse the produced text and assert `toJS()` equals `after`; assert that the text outside the block is byte-identical; if either fails, throw `FrontmatterRoundTripError` and write nothing.

**Constructs I will refuse (hold-and-report conditions, thrown as `UnsupportedYamlError`, no write):** anchors/aliases/merge keys, custom tags, multiple documents, duplicate keys, non-string map keys, a frontmatter block that doesn't parse. 0.17.1 files never contain these (the app writes plain maps/lists/scalars), but a hand-edited `series.md` could; refusing is safer than guessing. I'll add each to the fixtures.

**Known limitations to expect (will be recorded in the report):** (a) a *modified* block sequence is re-emitted in the library's default style (indent 2, `- ` items, quoting only where needed), so its own lines can change style even when only one item changed; (b) a value that changes type or quoting need (e.g. `"1"` → `1`) takes the library's style; (c) a comment attached directly to a replaced scalar may be dropped — comments elsewhere survive.

**Frontmatter dates:** nothing in the data layer relies on date typing, so the core schema (no timestamp coercion) is used.

## 6. The write guard at the boundary

The guard lives in `GuardedBackend` and takes an **operation**, not a path:

```ts
type GuardOp =
  | { op: "write-file"; path } | { op: "write-binary"; path }
  | { op: "create-file"; path } | { op: "create-folder"; path }
  | { op: "rename"; from; to } | { op: "retire"; path }
  | { op: "frontmatter-edit"; path; keys?: string[] }   // keys only for codex alias edits
```

Rules (identical to today's, minus `_export/`, plus the explicit allowances that today are *implicit* because some call sites bypass the guard):

- `_backstage/storyforge/**`: write, create, folder, rename (both ends inside), retire, frontmatter-edit — allow.
- `_story-library/<flat file>.md|json|…` (series.md, novel-<code>.md, any flat file with an extension at the root): write/frontmatter-edit/create — allow. **Chapter files** (`_story-library/<code>/*.md`): **create-file only, and only if absent** (today's `createChapter` does this unguarded); every other op — refuse. Creating the root folder and `<code>/` folders: allow.
- `Codex/*.md`: **create-file only if absent**; `frontmatter-edit` allowed **only when `keys` is exactly `["aliases"]`** (today's `modifyCodexNoteAliases`); everything else — refuse. `renameCodexNoteFile` is refused at the data layer (§3.6) and the guard has no Codex rename row.
- `_sf-backup/**`: **create-only** (Brief 3, `docs/safety-core.md` §13): backups and recovery files are created through `backup-create` and `recovery-create`; every other route (write, binary write, generic create, rename, retire) is refused.
- `_export/**`: **refuse** all ops (allowance removed).
- Path normalisation exactly as `normalizeVaultPath` (absolute paths, NUL, `..` escaping the root → refuse). I'll port it unchanged and additionally refuse paths whose case-/NFC-folded form hits a protected root through a different spelling (e.g. `_STORY-LIBRARY/ch.md` on a case-insensitive file system) — a hardening, listed as a behaviour difference.
- Hidden paths (`.git`, `.obsidian`, `.trash` as a *target*): refuse except `retire`'s own move into `.trash/` which the backend does itself.

**Spec table:** `test/guard-spec/guard.json`, an array of
`{ "id": "…", "op": "create-file", "path": "_story-library/ABC/ch1.md", "expect": "allow" | "refuse", "reason": "…" }`
(`rename` rows carry `from`/`to`; alias rows carry `keys`). Each of today's guard tests (`writeGuard.test.ts`: 12 `it` blocks, several of them looping over path lists) becomes at least one row; adversarial ones (`..`, absolute, `Codex/../x`, case games) are rows too. The TypeScript guard is tested by iterating the file; the Rust guard in Brief 4 loads the same file.

## 7. Porting notes that affect the design

- `Project` replaces `App` in signatures. File handles (`TFile`, `TFolder`) become `IndexEntry`/path strings; `TFile.basename/name/extension` become small helpers in `core/paths`.
- `book.createChapter`: stops opening a leaf; returns `{ path, filename }` (it already does) and the caller opens it. It creates the empty file via `fs.createFile(path, "")` (guard: create-file-if-absent in a library folder).
- `reconciliation.ts`: keep `handleChapterRename`, `handleChapterDelete`, `handleBookFolderRename`, `handleCodexNoteRename/Delete` as exported functions taking `(project, oldPath, newPath)`; drop `registerReconciliationEvents`. They only edit backstage metadata, so they pass the guard; they will be called by Brief 3/4's watcher.
- `codex.reconcileMissingCodexNotes` and friends currently ask `adapter.list` for disk truth: replace with `project.index.list("Codex")` (the scan/`applyChange` is the disk truth).
- `history` records via the backend (`writeText` on `_backstage/storyforge/…`), reading chapter text through `fs.readText` rather than `cachedRead`.
- `registerCodexType`, `tagFilterMode`, `createIdeaChapter`: deleted as the brief says.
- Word counts: `wordCount()` applied to the *body after frontmatter*. I'll check 0.17.1's callers: some count the whole file (`countWords(raw)` in `main.ts`'s `recomputeChapter`, which I'll check against the history recorder), so I'll compare each ported call site against the old input and keep it identical.

## 8. Test strategy

- Unit tests per module (frontmatter, index, guard table, node-fs backend) against temp directories.
- Each ported module's existing tests are re-pointed from the Obsidian stub to fixture copies (`copyFixture(name)` → temp dir → `openProject`). The hand-built fake `App` objects in today's tests disappear.
- Disk-safety suite per §5.2 of the brief: wrap the backend in a recorder that logs every mutating call; for each data-layer operation compare checksums and per-file line diffs against an expected-change list, then rescan and compare to the write-through index.

## 9. Questions for review

1. **`trashFile` → `retire` into `.trash/`** (§1): accept as a documented difference, or stop?
2. **Guard hardening for case/NFC games** (§6): acceptable as an additional refusal, or must the guard stay byte-for-byte as today?
3. **Refusing YAML constructs** (anchors, tags, duplicate keys): fine to refuse rather than attempt?
4. **Modified block sequences re-styled** (§5 limitation a): acceptable under "only that key's lines change"? (The *key's lines* change; nothing else does.)
5. **Index scans read every markdown body** for the hash/word count. OK for projects of a few thousand files; alternatively compute hashes lazily. I'd keep it eager now (Brief 4 can optimise).

## 10. Rulings at H1 (Kenny, passed on by Claude) and how they change the design

1. **`retire` → `.trash/` inside the project: accepted**, as an intended behaviour difference to record in the core report. Never overwrite inside `.trash/`: an existing name gives the incoming file a unique name (`name (2).ext`). Only backstage sidecars are ever retired.
2. **Case / Unicode / separator variants of protected folders are refused** by the guard, and get rows in `test/guard-spec/guard.json` (case variants, NFC/NFD variants, mixed separators) so the Rust guard inherits them.
3. **Unsupported or broken YAML is "unreadable", not empty.** The index marks the file `frontmatterError`; the data layer treats it as *unavailable* (a read helper returns an explicit "unreadable" result, never `{}`/defaults); every write to it fails with a typed `UnreadableFrontmatterError` and the disk is untouched; the CLI check reports it.
4. **Lists may be rewritten whole; maps must be edited path by path.** Consequences for §5:
   - The edit is **spliced into the original text**: each changed path is mapped to its source range in the original file and only that range is replaced. Untouched entries (and everything else in the file) keep their original bytes. This replaces the earlier plan of letting the library re-stringify the document, which would normalise unchanged parts.
   - Generated text (new keys, replaced lists) is styled to match 0.17.1's output: 2-space indent, block sequences indented under their key, plain scalars unless quoting is needed, double quotes when it is.
   - No change → the original string is returned and nothing is written.
   - Disk-safety test: change one chapter's entry in a `chapters` map and assert only that entry's lines differ.
5. **Eager reading only inside storyForge's own folders:** `_story-library/`, `Codex/`, `notes/`, `_backstage/storyforge/` (markdown bodies are read, hashed and word-counted). Everywhere else the index holds path, kind and size only; no body or attachment is read, and no frontmatter is available for files outside those folders. The CLI check reports scan duration.

## 11. As built (differences from the design above)

- `Project` also has `updateText` (whole-file read-modify-write under one lock, used for generated backstage files), `isFile`/`isFolder`/`list`/`entry`, and `modifyFrontmatter` is generic over the frontmatter type. `Project.createFolder` skips the backend call when the index already has the folder.
- `IndexEntry` gained `name`, `basename` and `extension` so ported code could keep using `.name`/`.basename`/`.extension`.
- The guard decides over `GuardOp` values and the `GuardedBackend` exposes a `transaction` (read-modify-write under one lock) whose writes are checked at the moment they happen, so the Codex alias rule is enforced against the keys the edit actually changed.
- The content hash is a dependency-free SHA-256 (`core/hash.ts`), so the core runs unchanged in Node and a webview.
- The frontmatter module also exports `editYamlText`/`parseYamlText`/`stringifyYamlText` for whole-file YAML documents (word-count history), `splitFrontmatterSection`, `stringifyFrontmatterBlock` and `changedTopLevelKeys`.
- Null values are written as an empty value (`key:`), like 0.17.1's default files; setting a key to `undefined` removes it.
