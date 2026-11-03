# Fix 6: settings changed elsewhere, the report

**Built app: storyForge 1.6.1, built from branch `settings-sync` (not yet merged; `main` is at `v1.6.0` plus the Fix 6 design doc's parent).** The design is `docs/settings-sync.md` (rulings and "As built" at its end); decisions 96 to 99.

## What was built

- Re-read of `project.md` on an outside change, applied in place; the open Settings dialog follows (not under a text box being typed in).
- Every settings write checked against the file inside the transaction; the author's value wins and a fading, non-red notice names the setting and the value it replaced.
- An unreadable, deleted or newer `project.md` mid-session: told once, settings writes refused (newer: sticky notice with "Close and Reopen"), the rest of the project carries on.
- No change to Rust, the core, the prose writer, the field writers, the close path or the disk format; no dependency or network request.

## What applies when

| Setting | On an outside change |
|---|---|
| Codex colour, the Appearance keys, `story-kind`, highlight, numbering, typing switches and lists, the characters button, `show-session-readout`, `session-min-shown-minutes`, `session-editing-wpm` | At once |
| `automatic-backup`, its frequency | At the next 30-minute check |
| `session-idle-minutes` | From the next session (the recorder's timer reads it live, the tracker keeps the one it began with; no recorded figure is wrong) |
| `layout`, `auto-focus` | At the next open |

## Results

- `npm run build` clean; `npm test` 1654 passed; `npm run test:ui` 412 passed, 1 skipped (before the version bump; no source changed since).
- Built app 1.6.1 (version read from the bundle's `Info.plist`), through the guard, under `caffeinate -u`, window-only pictures:
  - `test:settings-sync` (new, `scripts/settings-sync-smoke.mjs`): PASS. With the app open, a plain overwrite of `project.md` switched on the session readout and the green Codex colour at once; deleting the file left both in place and the file was not recreated. Pictures: `docs/settings-sync-shots/` (`sync-before`, `sync-after-outside-edit`, `sync-after-delete`).
  - `test:quit`: PASS on every route. `test:look`: PASS. `test:typing`: PASS.
  - **`test:fonts`: FAIL, twice, on one check:** "Fraunces' Wonk changes the drawing" (the picture of the Codex list with Wonk on is identical to the one with it off). Every other check in the script passed, including the control that the same configuration photographs the same twice. That script writes `project.md` before each launch and never changes it while the app runs, so the new code has nothing to act on, but I have not shown that it is unrelated: the same check has not been run on the 1.6.0 build in this session. Unresolved.
- Not run: the Rust tests (nothing in Rust changed), `test:cover`, `test:widths`.

## Holds

None hit. The one thing that would have needed Rust and core changes (a true mid-session read-only flip) was ruled out (option C is not part of this fix).

## Kenny's check (decision 101)

**Done, no issues.** Kenny used an Appearance setting in place of a typing aid: the app followed the outside edit, and the notice appeared when he changed the same setting in the app.

(What was asked for, for the record:)

Not yet done. In the built app on a fixture copy: change a setting in `project.md` with a text editor while the app is open (for example `codex-colour: green`) and watch the window follow; then change the same setting in Settings while the file holds another value, and read the notice.

## The drag test (decision 100)

- **Message:** `TypeError: Cannot read properties of null (reading 'x')` at `storytelling.ui.ts:203`, the first line after `boundingBox()` of the "Sam" row. The failure is before any mouse move, so nothing was dragged and `codex.md` was not written: **the fault was in the test, not the app.**
- **Cause:** `boundingBox()` doesn't wait. `openProject` returns when the editors exist, and under load the Codex list isn't always drawn yet, so the row has no box.
- **Runs, before the fix:** 30 alone: 30 passed. 30 under CPU load (one busy loop per core): 29 passed, 1 failed with the message above.
- **Fix** (`150ecf8`, test only, nothing weakened): the test waits for both rows to be visible before it reads their boxes; the drag and its assertion are unchanged. **After the fix:** 30 alone: 30 passed; 30 under load: 30 passed.
- **Two full `npm run test:ui` runs** (on the branch, after the fix): the first 412 passed, 1 skipped. The second had 1 failure, in my own new test `settingsSync.ui.ts` ("an outside change to the Codex colour applies at once"): `Expected "green", Received "text"`. **Cause, also a test race:** the helper called `touch` without waiting and emitted the batch at once, so the window sometimes re-read the file before the file was written. Fixed (the helper awaits the write before the window is told), then the whole file run 15 times alone (105 of 105 passed) and 15 times under load (105 of 105 passed).

## Commit 4: how each part was tested

| Behaviour | Core test (`src/app/__tests__/settings.test.ts`) | WebKit test (`test/ui/settingsSync.ui.ts`, outside edits by writing the file and emitting `watch-batch`) |
|---|---|---|
| Unreadable file: settings writes refused, then accepted when it reads again | yes (`ReadOnlyProjectError` while frozen; values apply and writes work after) | the notice appears once (a second unreadable edit doesn't repeat it), the dialog's controls switch off, and on again with the new value when the file reads |
| Deleted file: last values stay, notice once | the last values stay (`absent`); a change afterwards writes the marker and that key only | the notice appears once and the Codex colour stays |
| Newer format: writes refused from the moment it is seen | yes; the file is not changed | a sticky notice with "Close and Reopen" still showing after 7 seconds |
| Close and Reopen | – | in the preview: the button runs the close and the project reopens read-only, and `project.md` is byte for byte what it was |

**Close and Reopen has not been tried in the built app.** `test:settings-sync` covers the readout following an outside edit and a deletion only. The unreadable and newer notices are tested in the preview only.

## The data.json carry-over (decision 100)

The first write after a deletion carries over only values whose source is the plugin's `data.json`. `loadSettings` re-derives exactly the same values from `data.json` at the next open (a key in `project.md` wins, otherwise `data.json`, otherwise the default), so the next open shows what the window did. Values that came from the deleted `project.md` are not carried over, and the next open shows their defaults, which is what the deleted-file notice says. Covered by "after the file was deleted, a change creates it with the marker and that key only".

## Fraunces Softness and Wonk (decision 101)

- **Trace:** `loadSettings` reads `appearance-codex-soft` and `-wonk` through `FIELDS` into `values` (unchanged by Fix 6); `applyLook` in `ui/app.ts` runs on the `settings` and `project` topics and calls `applyAppearance`, which sets `--ap-codex-var` from `variationFor(font, soft, wonk)`. The re-read only changes keys whose value differs, so an open with the keys already in the file touches nothing.
- **Unit test** (`2c7c832`): a project opened with Fraunces, Softness 40 and Wonk on reads both and `variationFor` gives `"SOFT" 40, "WONK" 1`, by `loadSettings`, by `refreshSettings`, and through `openProject`. It passes on this branch, so **it did not find a fault in the read path** (it wasn't shown failing, since there was nothing to fix).
- **Comparison with 1.6.0** (decision 102, run with the screen unlocked, under `caffeinate -u`): `test:fonts` on the built **1.6.0 from `main`**: PASS. After rebuilding the branch as **1.6.1** (branch `settings-sync`, `f07004b` and earlier): the first attempt was refused ("the app's window … never appeared", nothing driven; the first launch of a fresh build), the second PASS, with "Fraunces' Wonk changes the drawing" ok. So the two earlier failures (1.6.1 built at `fc30755`) did not reproduce on either build, and **there is no regression**. The cause of those two failures is not proven; the likeliest is that the check photographs a region of the screen, and the Mac was about to lock (the lock refused the next run), so both pictures were the same. The check stays as it is; it is not changed because 1.6.0 passes.

## Built-app results on 1.6.1 (branch `settings-sync`, `f07004b`), through the guard, under `caffeinate -u`

| Check | Result |
|---|---|
| `test:fonts` | PASS (second attempt, see above) |
| `test:settings-sync` (extended, see below) | PASS |
| `test:quit` (after Close and Reopen was driven) | PASS, every route |
| `test:cover` | PASS |
| `test:widths` | PASS, after a script fix: the widths group moved to Settings' "This Mac" page in 1.6.0, so the script failed with "Settings did not show the widths group"; it now chooses that page by its accessibility action |
| Rust tests (`cargo test --workspace`) | all passed, once |
| `npm run build`, `npm test` | clean; 1656 passed |
| `npm run test:ui` (one full run, after all the fixes) | 412 passed, 1 skipped, 0 failed |

## The extended `test:settings-sync`

With the app open on a fixture copy (temporary `HOME`): a plain overwrite switches the session readout on and the Codex colour to green at once; text typed in a chapter (every key through the typing guard) reaches the chapter file; unreadable YAML written from outside gives the notice once (a second unreadable edit gives no second notice), and the open Settings dialog's controls are disabled, then enabled again once the file reads; a newer `format-version` written from outside gives the sticky notice, still there after 6.5 seconds; **Close and Reopen is pressed by its accessibility action** (not a click); the project comes back read-only (the read-only notice), the typed text is in the chapter, and `project.md` is byte for byte what was written. Pictures (window only): `docs/settings-sync-shots/` (`sync-newer-notice`, `sync-reopened-read-only`, `sync-unreadable-settings`, and the earlier three).

- **Order differs from decision 102:** the unreadable stage runs before the newer-format stage. Afterwards the project is read-only, and "a settings change is refused" would then be true for the wrong reason.
- **The shortcut ⌘, can't be posted** by the key helper (only a letter or digit with modifiers; reported, not worked round), so Settings is opened by pressing the "Settings…" menu item by its accessibility action, after the same guard check as a key. The dialog is closed through its "Done" button (Escape doesn't close it).
- **Close and Reopen has now been tried in the built app.** The sticky newer-format notice draws with the sticky style's red edge (the existing style for sticky notices); decision 99's "not red" was for the fading notice. Say if you want the sticky one changed.

## Decision 103: Wonk removed, and what the "failures" really were

- **Wonk removed** (`da5b343`): see the changelog. Fraunces is drawn with Wonk off always; an `appearance-<part>-wonk` key on disk is never read or rewritten, and a change to it from outside applies nothing (unit tests, and a WebKit test that checks `project.md` is byte for byte unchanged). `test:fonts` lost its Wonk check, refuses a locked, dimmed or sleeping screen, and measures a size step before it will report a weight or Softness comparison as failed.
- **The `test:typing` refusal, the `test:widths` "window never appeared", the earlier `test:fonts` Wonk failures, and three `test:ui` failures in a 12-minute run all came from one cause of mine:** the CPU-load runs for the drag test (decision 100) started one busy loop per core as shell subshells, and their clean-up (`kill` of the loops' process ids) did not stop them. **Thirty busy loops ran for about four and a half hours** (load average about 41), through every built-app run after the drag test. Found when `uptime` showed the load and `ps` showed the loops; all killed (nothing else was touched); load fell to about 2.
- **What the load did:** with the Mac starved, key timing and undo grouping changed, so in the plot-note stage the second ⌘Z took back only the word and left "sam", and "~th" typed straight after a letter is not a shortcode: no popup, Tab moved focus to a button ("The Storm: Part Two"). The picture of that moment showed `Jane and Sam. sam~th`. It is not a person-visible app fault: **I did not need Kenny's by-hand `~th`**, because the original, unchanged `test:typing` then passed three times in a row on the quiet Mac (a script change I made meanwhile was reverted, `1025c3d`).
- **First launch after a fresh build:** the window appeared **0.4 s after the launch, on the first launch and on the second** (`test:widths` now prints it). The "never appeared" refusals were the starved machine (or the locked screen), not a slow first launch, so the script's wait is unchanged.
- **`caffeinate`:** `man caffeinate` confirms that `-u` without `-t` holds only 5 seconds. The rule in `AGENTS.md` is now `caffeinate -d -i -s -u` for builds and runs.
- **Results on a quiet Mac, built 1.6.1, branch `settings-sync`:** `test:quit`, `test:look`, `test:typing`, `test:fonts` (three passes in a row on the quiet Mac, after the loops were killed), `test:cover`, `test:widths` (0.4 s first-launch window) and `test:settings-sync` (with the deleted-file stage) all PASS; `cargo test --workspace` passed earlier and nothing in Rust has changed since; `npm run build` clean; `npm test` 1656 passed; **`npm run test:ui` 413 passed, 1 skipped, 0 failed (5.7 minutes)**.
- **Lesson kept:** any load generator I start is stopped by killing its process group, and checked with `ps` afterwards.
