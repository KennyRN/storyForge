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
- **Comparison with 1.6.0** (decision 101, step 2): the built 1.6.0 from `main` was built (version read from the bundle: 1.6.0) and `test:fonts` was started on it, but **the screen was locked when it started and the script refused** (nothing was typed or driven). Not yet run.
