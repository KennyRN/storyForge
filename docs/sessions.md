# Writing sessions (Brief 7)

Status: **H1 ruled (decision 35); §10 records the rulings, and the text below is as ruled.** Decision 34 and the brief's §2 are the rules; this is the design that carries them out.

## 1. The parts

| Part | Where | What it is |
|---|---|---|
| The tracker | `src/core/sessions.ts` (pure) | The session state machine, the classification and the figures maths. The clock is passed in. No I/O. |
| The session files | `src/core/sessionFiles.ts` | Format, reader, writer. Uses the Project handle's guarded writes. |
| The recorder | `src/app/sessionRecorder.ts` | Owns one tracker per open project: the idle timer, the checkpoint, the in-progress record, wake and focus handling, and the close step. |
| The author-edit feed | `ProseWriter` / `ProseSession` (additive) and `editor.ts` | Tells the recorder about the author's own edits, and about reloads. |
| The interface | `history/`, `stats.ts`, settings screen | The sessions list, average pace, the storytelling figures, the live readout, the settings. |

## 2. What counts as an edit, and how author edits are told from reloads

Today every author change reaches the core through one funnel: the editor's update listener calls `ProseSession.setBody(body)`, and skips transactions annotated `fromWriter` (a reload from disk, applied as the minimal replacement). That distinction already exists, so the feed needs no guessing:

- `setBody(body, origin?)` gains an optional **origin** — `"type" | "delete" | "paste" | "drop" | "cut" | "undo" | "redo" | "other"` — which `editor.ts` takes from CodeMirror's user-event annotation on the transaction (`input.type`, `input.type.compose` for IME and dictation, `delete.*`, `input.paste`, `input.drop`, `delete.cut`, `undo`, `redo`). An edit with no origin is treated as typing, so a test covers every input path (typing, IME and dictation, paste, drop, cut, undo, redo) to stop a paste slipping through unflagged. It changes nothing about saving.
- `ProseWriter.onAuthorEdit(listener)` is a new observer, called synchronously from `setBody` with `{ session, origin, body, at }`. Like `onSaveResult` (decision 26) it can never change an outcome: whatever a listener throws is caught and logged.
- A **reload** is `ProseSession`'s existing `onReload` event. The recorder subscribes to it for each chapter session it has seen an edit in. Reloads are never edits: they move the chapter's baseline (§4), not the session's net.
- **Link rewrites, reconciliation, opening, backups and recovery** never call `setBody`, so they can't produce an edit. A link rewrite reaches an open editor as a reload, so it is a baseline shift too.
- **Only chapters.** The listener ignores `session.kind === "codex"`. Archived chapters and read-only projects never have a session (`ProseWriter.open` refuses them), so they have no `setBody`.
- Not edits, so thinking time: caret moves, scrolling, selecting, finding, switching apps. None of these reach `setBody`.

This is an additive change to a kept module (`proseWriter.ts`), in the same shape as `onSaveResult`. **It needs your ruling (§10, question 1).**

## 3. The session, and time

A session is `{ start, lastEdit, chapters, unreliable }`.

- **First edit with no session running** starts one; `start` is that edit's time.
- **Each edit** sets `lastEdit` and restarts the idle limit **from its full length**.
- **It ends at `lastEdit`**, never at the moment the limit ran out, when:
  - the idle limit passes (a timer set for `lastEdit + limit`);
  - the project closes, or any quit route Fix 1 catches ends the app (§8);
  - the window becomes active again or the Mac wakes (`visibilitychange`, window focus) and `now − lastEdit` is more than the limit.
- **The limit is judged against the clock.** When the timer fires — including a timer that sleep delayed — the recorder compares `Date.now()` with `lastEdit + limit` before doing anything; it never trusts the timer's own count. A session whose limit has passed ends at `lastEdit` however late it notices.
- **One session spans every chapter written in**, across novels.
- **Changing the idle limit** affects the next session: a running session keeps the limit it started with.
- **The clock is passed in** (`now: number`, epoch milliseconds) to every tracker function, so tests drive time.

### Recording times

`start` and `end` are stored **to the second, with the UTC offset the Mac had at that instant**, for example `2026-10-25T01:30:12+01:00` and `2026-10-25T01:55:40+00:00`. Length is the difference of the two instants, so the hour that repeats on 25 October 2026 (clocks back at 02:00 BST to 01:00 GMT) is handled by the offsets, not by wall-clock arithmetic. A session from 01:30 BST to 01:20 GMT (50 minutes later) has the right length.

The **day** is England-local, by the rule the history already uses: `todayISOInEngland(new Date(start))`. It is stored (`day:`) so readers never recompute it, and so the heatmaps and the sessions always agree. The Mac's own zone only decides the offset text.

## 4. Counting words

The existing counter is `countWords` (`wordCount.ts`): the body with `%% comments %%` removed, then runs of non-whitespace. Session totals use exactly this function and no other.

**Per keystroke, tracking does O(1) work** — it stores the new body (a reference to a string the editor already built), stamps `lastEdit`, and re-arms the idle timer. It does **not** count words per keystroke. Words are counted only:

- at a **checkpoint** (§6, at most every 5 s while editing);
- when the **live readout** asks (at most once a second, only if it is on);
- at the **session's end**;
- for a **paste, drop, undo or redo**, to decide whether it makes the session unreliable (§5); and
- on a **reload**.

Why not an incremental local count: `%% … %%` comments make word counting non-local. Typing one `%` can swallow the rest of a chapter into a comment, or release it. A local count would be wrong in exactly those cases, and "agrees with the existing counter" would be a promise I couldn't keep. A full count of a 10,000-word chapter costs about a millisecond or two (the report measures it), so doing it a few times a minute is free, and doing it never per keystroke is what keeps typing untouched.

**Per-chapter net** is `count(latest body) − baseline`. The baseline is set at the chapter's first edit in the session, to the count of the body *before* that edit (the first `setBody` call carries the new body; the previous body is `session.body` just before, which the feed passes). A **reload** that lands in a chapter the session has touched changes its body without an edit: the recorder counts the body just before and just after it and **adds the difference to the baseline**, so the reload moves neither the chapter's net nor the session's. The session total is the sum over chapters. (A disk-wins conflict that replaces the author's unsaved text with the disk's is such a reload. Those words stay in the session's net though they were sent to a recovery file. That is a rare edge and I'd leave it.)

## 5. The three kinds

- **Unreliable (stored).** A single event whose origin is `paste` or `drop` that **adds more than 30 words** marks the session unreliable. "Adds" is the event's **net**: words in the new body minus words in the previous body, via `countWords` (so a paste that replaces 40 words with 45 adds 5). The threshold, 30, is a constant in `sessions.ts`, not a setting. Typing, deleting, cutting, **undo and redo** never mark a session (they restore the author's own words, and a delete undone in the same session nets to zero anyway); many small pastes don't add up to one. Accepted limit: deleting a large passage, pausing past the idle limit, then undoing it hands the restored words to the next session.
- **Editing (worked out when shown).** Net ≤ 0, **or** — when the setting is on — pace below the threshold.
- **Short (worked out when shown).** Length below the minimum shown.

| | Listed | Storytelling figures | Pace averages |
|---|---|---|---|
| Unreliable | yes, labelled | no | no |
| Editing | yes, labelled | no | no |
| Short | no | yes, unless also unreliable or editing | no |

**Pace** is `net ÷ length in minutes`. A session of zero length has no pace, is short, and (with net ≤ 0) editing.

## 6. The session file

### Path and naming

`_backstage/storyforge/sessions/<YYYY-MM>-<computer>.md`, by the **session's day**. `<computer>` is a random 8-character lowercase base-36 identifier created once and kept in machine settings under a new key, `computer-id`. It is never the Mac's name. Two Macs therefore never write one file.

### Format

YAML frontmatter, readable in Obsidian, and a one-line body that says what the file is. Example:

```markdown
---
sessions-format: 1
computer: k7x2q9ab
sessions:
  - id: 20261025T013012+0100
    start: 2026-10-25T01:30:12+01:00
    end: 2026-10-25T01:55:40+00:00
    day: 2026-10-25
    net: 612
    chapters:
      - path: aaa/ch-a1.md
        id: c-a1k3
        net: 412
      - path: aaa/ch-a2.md
        id: c-a2m8
        net: 200
    unreliable: false
    recovered: false
---
Writing sessions recorded by storyForge on one computer for one month. Safe to read; storyForge rewrites this file when a session ends.
```

- `id` is the start instant in compact form plus offset. Reading de-duplicates by `id` (a file synced twice, or an interrupted write retried).
- `chapters[].path` is `<book code>/<chapter filename>` as it was at the time, and `chapters[].id` is the chapter's stable `chapter-id` when it has one (absent otherwise). The names keep the file readable in Obsidian; the id survives renames, so the history view shows current names and a chapter's sessions can be listed later.
- **Unknown keys are kept**, at the top level and inside each session and chapter entry: the writer parses to objects and writes those back.
- The list is rewritten **whole** on each append (the frontmatter editor's rule for a changed list, decision 18). A month holds at most a few hundred entries, about 100 bytes each.

### Writing and reading

- **Writing** uses the Project handle's existing guarded path, `project.modifyFrontmatter(path, content, fn)`, which reads, edits minimally and writes compare-then-write, creating the file (and `sessions/`, via `createFolder`) when absent — exactly as `project.md` is written. **No new guard operation and no new guard row are needed:** the folder is inside `_backstage/storyforge/`, which the `backstage` path class already allows for create-folder, create-file, write-file and frontmatter-edit, in both guards. The guard doesn't restrict by sub-folder, so "this touches only its own session file" is held by the writer being the only caller and by a disk-safety test. If the review wants a guard row that names the sessions folder, it is an additive row for an existing operation, in both guards in one commit.
- **A conflict** (the file changed under us; another app instance, or a sync) re-reads and retries once; if it still conflicts the session stays in the in-progress record and is retried at the next end or open.
- **An unreadable file** (frontmatter the editor can't round-trip) is **never rewritten.** It is unavailable, not empty. The session goes to a fresh sibling, `<YYYY-MM>-<computer>-2.md`, `-3.md`…, and the history view says that a session file couldn't be read, naming it.
- **Reading** takes every `*.md` in the folder from every computer, merges by `start`, and de-duplicates by `id`. It uses the index (the scan already holds `_backstage/storyforge/` bodies). It is lazy: the history view and the stats panel ask for it when they draw, and the result is cached until a batch touches the folder.
- **Backups** cover `_backstage/`, so nothing changes there. The plugin never reads this folder. `format-version` stays 1.

## 7. The storytelling figures

Computed when shown, never stored. For a book and a day:

```
storytelling(day) = history net(day) − Σ over that day's unreliable and editing sessions of the session's net in that book's chapters
```

The history's day net comes from `wordcount.md` (`BookWordStats.daily`), untouched. Per-chapter nets are why this works per book: the stats panel shows the selected book's figures, the history view's "all novels" sums them. Weeks are sums of the adjusted days (`weeklyNetsFromDaily` over the adjusted `DayNet[]`), so the week and the day can't disagree. Today/this-week in the stats panel use the same function. Pace averages use only sessions that are none of short, editing or unreliable, and the **average is total net ÷ total minutes** across them (time-weighted), not a mean of paces, so a ten-minute burst doesn't weigh like a three-hour afternoon. The history view shows how many sessions the average is drawn from.

Excluding an editing session can raise a figure (it removes a net loss). Words changed outside the app belong to no session and stay. Chapter, novel and series counts and every bar are untouched: this function is only called by the history view and the stats panel's today/week figures.

### The midnight mismatch

The history splits a day at **save time** (`recordChapterEdit` is called when the save lands, up to two seconds after the edit). A session belongs to the day it started. For a session that crosses England midnight:

- The words written after midnight were credited by the history to the **next** day, but my subtraction takes the whole net from the **start** day. So the start day is under-reported by the post-midnight net, and the next day over-reported by the same amount (only for an excluded session; a counted session needs no correction).
- The mismatch is at most **the net written after midnight in that one session**. An idle limit of 3 minutes lets a session run for hours, so it can be hundreds of words, rarely.
- A 2 s lag at the boundary can also move a few words across, whichever way I go.

**Ruled: store the per-day split.** The session is still listed on its start day, and counts as one session for length, pace and labels, but a session that crosses England midnight also stores `by-day:` (for example `2026-10-25: 300`, `2026-10-26: 312`), and each part is subtracted from its own day. The split point is the count taken just before the first edit after midnight (England-local). Only sessions that cross midnight store it. Unreliable and editing are judged on the whole session. The remaining mismatch is a couple of seconds of save lag at the boundary.

## 8. The session in progress, recovery, and the close path

- **While a session runs**, the recorder checkpoints it to the app's data folder (machine settings, key `session/<sha256 of the project path>`, written by the same `machine_set` command everything else uses), at most every **5 seconds**: on an edit, if 5 s have passed since the last checkpoint; and once more 5 s after the last edit if anything changed. A checkpoint is `{ id, start, lastEdit, chapters with baseline and net so far, unreliable, computer }`. Writing it needs a count of each touched chapter (§4). Nothing is written to the project.
- **At the next open**, before the history or stats are drawn: an in-progress record that is not the live session is finished at its `lastEdit` as of the checkpoint, with the net as of that checkpoint, marked `recovered: true`, written to its session file, and the record removed. It is the only write opening makes for sessions. If the project is read-only, or the write fails, the record is kept (so it is tried again), and nothing is written.
- **On every close and quit route** — project close, ⌘Q, the red button, the Dock, logout, the signals — the close path `teardown()` gets one more step, **after the editors are flushed and before the snapshot is saved**: `recorder.end("close")`. It counts the final chapters, writes the session file, and calls `closeProgress()` before and after (decision 33), so a slow write is progress, not silence. If the write fails the record stays and is recovered at the next open; the close carries on.
- **A forced recovery of unsaved text at the 5 s limit** doesn't change the session: the words it recovers are in `body`, counted as typed.
- **Read-only projects** (a newer format) get no recorder at all.
- **Failure is quiet and once.** If recording fails (checkpoint or file), typing continues, and one notice per project open says "Writing sessions couldn't be saved." The next failures that open say nothing. The typing path never awaits any of it: the feed returns immediately and the recorder works in its own tasks.

## 9. Settings, display and the interface

Preferences, so in `project.md` (decision 23), with the existing `FIELDS` table in `settings.ts`:

| Setting | `project.md` key | Default | Range, step |
|---|---|---|---|
| Session idle limit | `session-idle-minutes` | 3 | 1–30, step 1 |
| Minimum session shown | `session-min-shown-minutes` | 5 | 0–60, step 1 (0 shows all) |
| Count as editing below | `session-editing-wpm` | off (key absent) | 1–60 words per minute, step 1 |
| Show the current session in the stats panel | `show-session-readout` | off | on / off |

Out-of-range or malformed values in the file fall back to the default, as every other setting does. The settings screen gets a **Sessions** group (the first three) and a **Display** group (the fourth), the latter built to take more rows.

**History view.** Selecting a day lists that day's sessions beside the existing per-chapter breakdown: start–end times (shown with the offset they were stored with), length, net, pace, the chapters touched, and the words "editing", "unreliable" or "recovered". Short sessions aren't listed. The range's **average pace** is shown beside the totals. The day and week figures and the heatmaps become the storytelling figures. A note says when a session file couldn't be read.

**Live readout.** A quiet line in the stats panel while a session runs: elapsed time (m:ss, or h:mm:ss) and net words so far. Nothing between sessions. It redraws at most once a second, with no animation, no `aria-live`, and never takes focus.

## 10. H1 rulings (decision 35)

1. **The edit observer on `proseWriter.ts`: approved,** on the terms of `onSaveResult`: it can never change a write's outcome (anything it throws is caught and logged), it hears only author edits through `setBody` (reloads never reach it), and every CodeMirror input path supplies an origin, with a test.
2. **Lazy counting: approved, plus reloads** (§4). The cost of a paste on a 10,000-word chapter (two full counts) is reported; hold if it is noticeable while typing.
3. **Unreliable: a paste or drop adding more than 30 words, a constant. Undo and redo come out** (§5).
4. **Midnight: the per-day split is stored** (§7).
5. **Average pace: time-weighted**, with the number of sessions it is drawn from shown (§7).
6. **Chapter identity: the id is stored too,** when present (§6).
7. **No guard row** (§6). The disk-safety test that session writes land only in `sessions/` is the real protection.

Step 0 additions: a Rust unit test of the quit state (`src-tauri/src/quit_state.rs`: a termination mid-close joins it, no second close starts, macOS gets one reply); and the inert-editor test was proved by removing `inert` once and confirming the focus, find-panel and menu-undo checks each fail. (That proof found that a bare ⌘Z keypress in the browser preview reaches WebKit's own undo even when the editor is inert; the real app consumes ⌘Z with its Undo menu item, which acts only on a focused editor, so the test checks the menu route. Kenny's check should try ⌘Z under an overview in the real app.)

## 11. Brief 7 §0: the confirmations

- **Brief 5 — one note, never two editors.** Already covered by `test/ui/editor.ui.ts`: "opening a file that already has an editor focuses it, from either slot" and "asking for the same file twice at once opens it once, and its session stays alive". No new test.
- **Brief 6 — the plot-note tooltip.** The report's wording was loose: the tooltip is on the novel overview's chapter-card bars, not the history view. It had no text assertion; added in `test/ui/overviews.ui.ts`: the word count shows at once, the first paragraph joins it, and after an outside change to the novel file (an index change) the new first paragraph replaces it.
- **Brief 6 — the inert editor under an overview.** The existing test only checked the `inert` attribute. Added: with an overview showing, the editor can't take focus, and ⌘F, ⌘B, ⌘I, ⌘Z and ⇧⌘Z change nothing; and a save already due still lands underneath. `inert` is what removes the editor from the accessibility tree; the browser tests check the attribute, the behaviour and the absence of a focused element, and a screen reader's view is the browser's. (Both tests pass; the inert one was checked to fail when the attribute is removed.)

## 12. As built

What differs from the design above, or was settled while building it.

- **The tracker** is `src/core/sessions.ts`, with the maths in `src/core/sessionFigures.ts` and the files in `src/core/sessionFiles.ts`; the app-layer owner is `src/app/sessionRecorder.ts`. `SessionTracker.edit()` also ends a session whose idle limit had already passed (a sleep the timer never noticed) and starts the next, so the end is always the last edit.
- **Per-day split** is stored **per chapter** (`chapters[].by-day`), not once for the session, because the stats panel and the history view show one novel at a time and need each novel's part of each day. Only a session that crossed England midnight has it.
- **Machine settings** gained two names, in the Rust allow-list (`src-tauri/fs/src/machine.rs`, tested): `computer` (this Mac's random id) and `session/<sha256 of the project path>` (the session in progress, with any finished session that could not be written). No new command.
- **The checkpoint** is written at most every 5 s while editing (on an edit, and once more 5 s after the last edit if anything changed) and cleared when the session is written.
- **Failure** is reported once per open project as a transient notice ("Writing sessions couldn't be saved. Your writing is not affected.") and recording carries on. A session that could not be written is kept with the in-progress record and finished at the next open.
- **The close step** is in `AppController.teardown()`, after the editors are flushed (or force-recovered) and before the snapshot is saved, with `closeProgress()` before and after. Every route Fix 1 catches reaches it, and `npm run test:quit` now also checks that a session file was written by the close, not recovered.
- **The settings** are `session-idle-minutes` (1–30), `session-min-shown-minutes` (0–60), `session-editing-wpm` (1–60, absent when off) and `show-session-readout`. Turning the editing threshold off removes its key.
- **The history view** shows, for the selected novel, the storytelling figures for today, this week, the days and the weeks, the average pace with its number of sessions, and for a selected day its sessions (start–end as stored, length, words, pace, the chapters touched by current name, and the words "editing", "unreliable", "recovered"). Chapter names follow the chapter's id when it has one.
- **The live readout** is a quiet line in the stats panel ("session 12:34, 210 words"), redrawn once a second, hidden between sessions, no live region, no animation, never focused.
- **Not changed:** `wordcount.md` and the history core, the core word counter, the write guard (no new operation, no new row).

## 13. The covered editor refuses changes itself (decision 36)

While an overview covers the workspace the editor stays mounted (decision 28) and is `inert`. Brief 7's proof of that test found that WebKit's own undo still reached it in the browser preview, so the editor now refuses changes itself, whatever their source. Two walls in `src/ui/editor/editor.ts`, because CodeMirror's history commands skip transaction filters:

1. **Before it touches the page:** a `beforeinput` handler cancels every browser-originated input while covered.
2. **Whatever still reaches the view:** `dispatchTransactions` drops any transaction that changes the document and isn't a reload from disk (annotated `fromWriter`), so reloads, which must go on, still apply.

Inputs checked, with what stops each and where it is tested (`test/ui/overviews.ui.ts`, "under an overview the editor takes no focus…"):

| Input | Stopped by | Tested |
|---|---|---|
| Bare ⌘Z and ⇧⌘Z (WebKit's own undo and redo) | wall 1 | yes, by keypress; proved to fail with the guard removed |
| The Edit menu's Undo and Redo | `EditorHost.undo/redo` act only on a focused editor; an inert one has no focus | yes, the menu route |
| Typing, ⌘B, ⌘I, ⌘F | `inert` (no focus), and walls 1 and 2 | yes (focus, find panel, text unchanged) |
| Paste and drop | wall 1 (`insertFromPaste`, `insertFromDrop`), then wall 2 | wall 2 by a programmatic change; the browser events can't be synthesised as trusted input, so wall 1 for them is by construction |
| Spellcheck and autocorrect replacements, dictation, IME | wall 1 (`insertReplacementText`, `insertFromComposition`, `insertText`) | by construction, as above |
| Find and replace's Replace | the panel can't open while covered (`EditorHost.find` returns), and wall 2 would drop the change | find panel yes; replace by wall 2 |
| Any programmatic change (a dispatch from code) | wall 2 | yes |
| A reload from disk (an outside edit) | allowed: it is not the author's, and must apply | covered by the existing reload and overview tests |
| Saving what was already typed | unaffected: saving doesn't change the document | yes |

Not checked: input methods that bypass both the DOM and the view (none are known; the editor is the only writer to its document).
