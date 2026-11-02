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

## Kenny's check

Not yet done. In the built app on a fixture copy: change a setting in `project.md` with a text editor while the app is open (for example `codex-colour: green`) and watch the window follow; then change the same setting in Settings while the file holds another value, and read the notice.
