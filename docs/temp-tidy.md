# Leftover temporary files (Fix 2)

Status: **H1 ruled (decision 39); built (§8 and §9).** The sections before §8 are the investigation as submitted. This says where the app writes a temporary file, what a leftover can hold, which guard change the tidy needs, how each kind would be treated, and where in opening it runs. The rules are decisions 18, 19, 24, 31 and 33 and the Fix 2 brief; section 7 lists the points I need ruled.

## 1. Every place the app writes a temporary file

**One pattern covers every write into a project.** Both backends make the temp name the same way, beside its target, hidden:

| Backend | Name | Source |
|---|---|---|
| Rust (the app) | `.<target name>.<id>.tmp`, `<id>` = process id, nanoseconds and a counter, in hex, run together (about 20 to 30 hex digits) | `temp_beside`, `unique_suffix`, `src-tauri/fs/src/ops.rs` |
| TypeScript node-fs (tests and the CLI check only) | `.<target name>.<12 hex>.tmp` | `src/backends/node-fs/index.ts` (three places) |

Neither is produced by anything else. Every temp is created with `create_new`, written whole, and `sync_all`'d **before** it is swapped or renamed in. So a leftover is either complete, or, only if the app died inside the write itself, partial. A partial file is not marked as such.

The Rust operations that make one, and what a leftover can hold:

| Operation | Where the temp sits | Leftover if the app dies... |
|---|---|---|
| `write_atomic` (write-file, write-binary, a frontmatter edit, `project.md`, a session file, backstage files) | beside the target | mid-write: **partial new version**. After the write, before the rename: **the complete new version**. The target is untouched in both. |
| `create_excl` (create-file, backup-create, recovery-create) | beside the target; a backup zip's is in `_sf-backup/`, a recovery file's in `_sf-backup/recovery/<dir>/` | mid-write: partial. After the write, before the link: complete new content. After the link, before the remove: **byte-identical to the target** (a second name for it). |
| `compare_write` with the atomic swap (prose saves, link rewrites) | beside the target | mid-write: partial new text. After the write, before the swap: **the complete new text, which exists nowhere else**. After the swap, before the remove: **the previous version of the file** (the swapped-out original, decision 24). |
| `compare_write` on a file system without the swap (`stat_checked_replace`) | beside the target | as above, without the swapped-out case |
| `keep_late_write` | none left: it links the temp to a recovery path, then removes the temp name | after the link, before the remove: identical to the recovery file |
| `retire` (into `.trash/`), `rename`, `create_folder` | none (renames, no temp) | nothing |

**Outside the project, so out of scope:** the machine settings (`<name>.json.<pid>.tmp` in the app's data folder, `machine.rs`) and the snapshot store's temp (`snapshotStore.ts`). They are never in a project folder.

**Where the project-side ones can sit:** `_story-library/<book>/` (chapters), `_story-library/` (series and novel files), `Codex/`, `notes/` (link rewrites), `_backstage/storyforge/**` (sidecars, history, `project.md`, sessions), `_sf-backup/` (zips) and `_sf-backup/recovery/**` (recovery files).

## 2. Can a partial file be told from a complete one?

Not from the file. There is no length prefix, trailer or marker, and the target (for a create) may not exist. The kinds that matter are not helped by it anyway: a prose temp that is partial is still the newest words there are, so it is treated like a complete one (moved into recovery, section 4). A zip can be checked (a zip's end record is at its end, so a truncated one fails to open), but a partial zip is only ever a partial copy of files that still exist, and is removed either way. **So the design needs no partial-or-complete test.**

## 3. The guard

Reading first. The window can read any path inside the root already (`read_bytes` guards only the root), so a temp can be read for comparison. What the window has no way to do is **find** one: the scan skips hidden names, so the index never lists them.

What the tidy has to do, against today's guard (`checkGuard` and its Rust twin):

| Needed | Today |
|---|---|
| List the app's own temp files | no operation: the scan skips hidden files |
| Create a recovery copy of a temp's content | `recovery-create` allows `_sf-backup/recovery/<dir>/<name>.md` (four or more parts, `.md`): **`_sf-backup/recovery/_temp/<name>.md` is already allowed.** No new row. |
| Remove a temp beside a chapter, a Codex note, a note, a library-root file | **refused**: those paths classify as `other` (a dotted `.tmp` name is neither a chapter nor a flat library-root file) |
| Remove a temp under `_backstage/` | `retire` is allowed there (it moves into `.trash/`) |
| Remove a temp under `_sf-backup/` | **refused**: `_sf-backup/` is create-only, always |

So the tidy **needs one new guard operation**, which the brief and ruling 4 of decision 31 say is a hold. I propose, for review:

- **`temp-remove`** (new). `{ op: "temp-remove", path }`. Allowed only when the path's final segment matches the app's temp pattern **exactly** (`^\.(.+)\.([0-9a-f]{12}|[0-9a-f]{16,40})\.tmp$`, the 12-digit form being the TypeScript backend's) and the path is inside one of `_story-library/`, `Codex/`, `notes/`, `_backstage/storyforge/` or `_sf-backup/`; refused everywhere else, including `.trash/`, `.obsidian/`, and any name that is merely similar. It removes one file; it cannot touch a directory or a symbolic link, and it refuses (not follows) a path that resolves outside the root (the existing containment check). Table rows: allow in each of the five folders; refuse for `.DS_Store`, an iCloud placeholder (`.Name.md.icloud`), a hidden file whose name is close to but not the pattern (`.x.tmp`, `.x.0g.tmp`, `x.tmp`), `.obsidian/…`, `.trash/…`, `_export/…`, a real backup (`20261023 - p.zip`), a recovery file, a chapter, and a `..` or absolute path.
- **Alternative:** add rows to `retire` instead (moving a matching temp into `.trash/`). It adds no operation, and it deletes nothing, but it widens `retire` (today "only backstage metadata is ever retired") and fills `.trash/` with partial zips. I recommend the new operation: it is narrower, and it is the one place the rule is stated.

And for listing, **one new read-only command**, `list_temp_leftovers`, which returns only `{ path, size, modifiedMs }` for names matching the same pattern inside the five folders, and nothing else (no general hidden-file listing reaches the window). It reads and writes nothing, so it is within "a new Rust command may only read". It lives next to the scan in `api.rs`, with a Rust test for the pattern shared with the guard row.

## 4. The treatment of each kind

A leftover's **kind** comes from its **target**: the temp's name minus the leading dot and the trailing `.<id>.tmp`, in the same folder.

| Leftover | How it is classified | Treatment |
|---|---|---|
| Under `_sf-backup/`, target ends `.zip` | a backup's temporary zip | **Removed.** Only ever a partial or duplicate copy of files that still exist. Never anything with a real backup name (the pattern requires the leading dot and the `.tmp`). |
| Byte-identical to the sibling target as it is now | any kind (a create's second name; a swapped-out original that equals the file) | **Removed.** Nothing in it is unique. |
| Target is a chapter or a Codex note (a prose temp), and it differs from the target | the new text never swapped in, or the old version after a swap | **Copied into recovery, then removed:** `_sf-backup/recovery/<book>/<name> <date> <time>.md` for a chapter, `recovery/_codex/` for a Codex note, named for the file it belonged to and when it was found, through the existing recovery path. The copy is the body only (frontmatter stripped, as every recovery file is). If the copy fails, the temp is left. |
| Target is a structural file (frontmatter, a sidecar, `project.md`, a session file, `series.md`, a novel file, a note under `notes/`), and it differs | complete new file never renamed in, or the old version | **Copied into recovery** under `_sf-backup/recovery/_temp/<name> <date> <time>.md` (whole file), then removed. |
| A leftover of a **recovery file** (target under `_sf-backup/recovery/`) | it is the author's text in transit, never complete elsewhere | **Never removed.** It is already in the recovery tree; it is left where it is and reported, because moving a file within `_sf-backup/` would need a rename that isn't allowed there. (The text is safe; it is only untidy.) |
| Anything the above can't classify (the target can't be read, an unknown folder, a non-UTF-8 file that isn't binary-safe to copy as `.md`) | | **Left where it is, and reported.** |

Prose and structural recovery copies go through `recovery-create`; the removal is `temp-remove`. **If the copy succeeded and the removal failed, the next open finds the temp again** and, finding a recovery copy of the same bytes, removes it (the "byte-identical" rule applies to recovery copies as well, by hash within the recovery folder named for the file), so a failure can't pile up copies. A **second open finds nothing to do**, by the same rule.

**Binary targets** (a cover image's temp, a `.zip`): a binary file can't be a `.md` recovery file. A cover's or other binary's temp that differs is **left and reported**.

## 5. Where in opening it runs

In `openProject`: **after the old-layout check and before reconciliation**, as proposed. Reasons: reconciliation and ensuring write, and they should not meet a stray temp; the scan has already happened, so the tidy asks `list_temp_leftovers` separately. It runs only when the project is **not read-only**; for a read-only project, if the listing finds any, the summary says so and moves nothing.

- **Age:** only files whose `modifiedMs` is at least **a minute older than the moment of this open**, so a save in flight, or a file just synced from another Mac, is never touched.
- **Summary:** the existing reconciliation summary gains a section: how many were removed, and each file moved into recovery with where it went, and anything left.
- **Quiet when there's nothing:** no leftovers, no listing result, no write, no summary section.

## 6. Tests (from the brief)

A fixture builder (`npm run fixture:leftovers`) makes a project with one planted leftover of every kind in section 4 and the decoys: an iCloud placeholder (`.Jane.md.icloud`), `.DS_Store`, a hidden file under `.obsidian/`, a hidden file whose name is close to but not the pattern, and a matching temp younger than a minute. Tests: each treatment does what it says; no decoy changes; the new guard rows pass in both guards with every existing row byte-identical; disk-safety operations for each treatment; a read-only project is byte-identical; a second open changes nothing; the pattern is the same in the TypeScript and Rust (a shared table test).

## 7. Questions for H1

1. **The new guard operation `temp-remove`** (section 3), or the alternative of rows on `retire`? I recommend the new operation.
2. **The new read-only command `list_temp_leftovers`**, returning only pattern-matching names, sizes and times? Without it nothing can find a temp.
3. **A prose or structural leftover that differs is copied into recovery and then removed** (the copy is what "moved into recovery" means, since a file can't be moved within `_sf-backup/` or out of a chapter folder without a rename the guard doesn't allow). Agreed, given decision 31's "never removed" is about the words surviving?
4. **A leftover of a recovery file is left where it is and reported**, never removed. Agreed?
5. **Binary leftovers** (covers) that differ are left and reported. Agreed?
6. **After a swap, a leftover holds the previous version**, which will usually match a backup. It is treated like any other differing prose temp (copied to recovery). That can mean an occasional recovery file with older text; I accept that over guessing which kind it is. Agreed?

## 8. H1 rulings (decision 39)

1. **`temp-remove`: approved** as one narrow new guard operation. The guard checks the name itself (`.<target>.<hex id>.tmp`, exactly) and the folder (beside storyForge's own files, or under `_sf-backup/`); never `.obsidian/`, `.trash/`, an iCloud placeholder, a hidden folder or a link that leaves the project. Rows in the shared table, including near-miss names; both guards pass them in one commit; existing rows byte-identical (only the table's `description` text names the new operation).
2. **`list_temp_leftovers`: approved.** Read-only; only pattern-matching names with sizes and times, from storyForge's folders and `_sf-backup/`; never follows a link out. On the window's allow-list; `test/tauriConfig.test.ts` updated. **The matching removal command:** the operation needs a command to reach it, so `remove_temp` was added beside it, granted by name like every other and refused in a read-only project. This is the one place the "a new Rust command may only read or reveal" rule is stretched, and only to carry the approved guard operation. Flagged for review.
3. **"Moved into recovery"** is, strictly in this order: copy (create-only, synced by the backend), read the copy back and confirm it matches byte for byte, confirm the leftover's size and modification time are unchanged since it was listed (checked inside Rust, at the moment of removal), only then remove it. If any step fails the leftover stays and the summary says so.
4. **A recovery file's own leftover** gets a visible name in the same recovery folder, through the same steps, and is reported. If a visible copy with the same bytes is already there, only the leftover is removed.
5. **Binary leftovers** are treated like structural ones: identical to the file beside it, removed; otherwise copied into `recovery/_temp/`, checked, removed. Genuinely unclassifiable leftovers stay, each reported once and remembered in machine settings (`leftovers/<sha256 of the project path>`).
6. **The summary labels each recovered copy:** newer than the file beside it (or nothing beside it) says plainly, first, that it may hold unsaved words; older is an earlier version, mentioned quietly. Modification times decide only the label; everything that differs is kept.

## 9. As built

- **Guard:** `temp-remove` in `guard.ts` and `guard.rs` (`is_temp_name`, five allowed roots, no hidden folder), with 40 new rows in `test/guard-spec/guard.json` (allows in each folder; refusals for near-miss names, `.DS_Store`, an iCloud placeholder, `.obsidian/`, `.trash/`, `_export/`, a real backup, a recovery file, a chapter, case variants, a traversal and a link).
- **Rust:** `Project::list_temp_leftovers` and `Project::remove_temp` (regular files only, never a link, with the size-and-time check), dispatched through `api.rs`; commands `list_temp_leftovers` and `remove_temp`.
- **TypeScript:** `Backend.listTempLeftovers` and `removeTemp` (Tauri, node-fs, memory, guarded); `src/core/tempTidy.ts` (the only caller of `removeTemp`, enforced by `test/architecture.test.ts`); `recovery.ts` gained the copy helper (it stays the only caller of `createRecovery`, which now accepts bytes); `openProject` runs the tidy as step 2b, after the layout check and before the snapshot and reconciliation, never in a read-only project, and returns `OpenedProject.leftovers`.
- **Copies** are whole-file, byte for byte (frontmatter included), named `<name> (leftover <yyyy-mm-dd hhmmss>).md` in `recovery/<book>/` (chapters), `recovery/_codex/`, `recovery/_temp/` (structural and binary; a binary's name keeps its extension before the `.md`, since the guard allows only `.md` recovery files), or the recovery file's own folder.
- **Summary:** the "Changes found when opening" dialog gained "Words that may not have been saved" (prose and recovery-file leftovers newer than the file beside them), "Other files that may not have been saved" (a history file or a cover, whose leftover can't hold words), "Earlier versions kept", "Tidied" and "Left where they are". A quiet open shows nothing.
- **Fixture:** `npm run fixture:leftovers [-- <folder>]` (default a fresh `storyForge leftovers fixture <time>` folder in the temporary directory, never the Desktop: decision 89) plants one leftover of every kind and the decoys (`test/helpers/leftovers.ts`, shared with the tests).

## 10. Kenny's check

The summary check with `npm run fixture:leftovers` was **waived by Kenny**, 26 October 2026. `npm run test:quit` passed on the 0.11.1 build with the Mac unlocked; the opening summary and a second open were also exercised in the built app against a fixture copy (a temporary HOME), automatically.
