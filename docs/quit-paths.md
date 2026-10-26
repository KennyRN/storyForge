# Quit paths (Fix 1)

Status: **H1 ruled (decision 31); fix built, see §8.** The sections before §8 are the investigation as submitted. It says how the app can be asked to end on macOS, which routes save first, why the others don't, what they lose, and the proposed fix.

## 1. How the app quits today

The one safe path is: Rust stops the quit, emits `close-requested` to the window, `AppController.shutdownAndQuit` flushes every open session (5 s limit, recovery for anything still unsaved, a link rewrite finishes first, a backup is abandoned cleanly), saves the snapshot, then calls the `quit_ready` command, and Rust sets `quit_ok` and exits. A 15 s watchdog in Rust quits anyway if the window never answers (`src-tauri/src/lib.rs`, `request_close`).

Three things start that path today:

1. **The app's own Quit menu item** (⌘Q). The predefined macOS Quit item was replaced by a custom one for this reason.
2. **`WindowEvent::CloseRequested`:** the red button and ⌘W.
3. **`RunEvent::ExitRequested` with no exit code**, which Tauri raises when the last window has closed or something asks the app to exit.

## 2. The routes

| Route | Reaches the safe path? | How I know |
|---|---|---|
| ⌘Q, storyForge ▸ Quit | **Yes** | Code: the custom menu item calls `request_close`. Existing tests cover the window half (`appLife.test.ts`, the preview's `close-requested`). Not driven here. |
| Red close button, ⌘W | **Yes** | Code: `CloseRequested` is prevented and calls `request_close`. Not driven here. |
| **Dock icon ▸ Quit** | **No** | Code, and driven (§3): an `osascript` quit, which is the same Apple event the Dock sends, ends the process with no `close requested` line and no save. |
| **Log out, restart, shut down** | **No** | Reasoned, not driven. macOS asks each app to quit with the same quit event as the Dock. Same cause as the Dock. |
| **`kill` (SIGTERM), also SIGHUP and Terminal's ⌃C** | **No** | Driven: `kill -TERM` ends the process with no log line. No signal handler exists. |
| Force Quit, `kill -9`, a crash, power loss | **Can't be caught** | Listed only to say so. |

## 3. Why the Dock route doesn't flush

The Dock's Quit, and a logout, send the app a quit Apple event. AppKit turns that into `[NSApp terminate:]`. `terminate:` asks the application delegate's `applicationShouldTerminate:` whether to go ahead; a delegate that doesn't implement it means "yes, now". Then AppKit calls `applicationWillTerminate:` and the process exits.

tao 0.37.1 (the window library under Tauri) installs a delegate that implements `applicationWillTerminate:` and **not** `applicationShouldTerminate:` (`tao-0.37.1/src/platform_impl/macos/app_delegate.rs`). `applicationWillTerminate:` runs after the decision, and all it does is raise the loop-destroyed event (`RunEvent::Exit`), which can't be stopped. So:

- `ExitRequested` is never raised on this route. The handler in `lib.rs` whose comment says "Cmd+Q and the Dock's Quit arrive here" is right for ⌘Q only because the custom menu item catches ⌘Q first. The Dock never reaches it.
- It isn't "the flush starts but isn't awaited". The window is never told. `close-requested` is never emitted.

The README says the fix needs "native macOS code beyond the platform module". That's right in kind: the fix is a delegate method, which is native code. It needs no new dependency (see §5).

**Driven check.** I launched the release build (0.10.0, a start screen with no project open, as I can't type into it from here) and ran: `osascript -e 'tell application id "io.github.kennyrn.storyforge" to quit'`, and separately `kill -TERM`. In both cases the process was gone within 4 seconds, and stderr, which prints `storyForge: close requested; asking the window to save` on the safe path, stayed empty. An idle launch stays alive and also prints nothing, so the empty log is the evidence that the safe path didn't run. I could not drive ⌘Q or the red button without accessibility permission for synthetic keystrokes, so I haven't seen the log line they should print. Seeing it is one of the things the fix's test needs.

## 4. What each failing route loses

On every uncaught route the process ends at once:

- **Typed text not yet saved.** Anything typed since the last autosave (up to 2 s), and any text in a save that was retrying. No recovery file is written, because the recovery path is part of the flush that doesn't run. Everything older is already on disk.
- **A link rewrite in progress** (a Codex rename) is cut off. Decision 24 says it always finishes first. On these routes that promise doesn't hold: some files may be rewritten and some not. The pre-rewrite backup exists (a rewrite never runs without it), so nothing is unrecoverable, but links can be half-updated. This is worse than the typing loss and the README doesn't mention it.
- **A backup in progress** is cut off. Decision 24 says it's abandoned cleanly: temporary file removed, no partial zip under a real name. A cut-off backup may leave its temporary file behind. **To check:** whether the next open tidies it. I haven't looked.
- **The window's size and position** aren't saved (`request_close` saves them). A cache-sized loss.
- **The session snapshot** isn't saved, so Obsidian renames made while the app is closed may be matched less well next time. It's a cache; losing it can cost a match, never cause a write.

Nothing else: the guard, the compare-then-write checks and the backups of earlier sessions are unaffected, and no file is left half-written (writes are atomic).

## 5. Proposed fix

One new route into the existing safe path, plus the signals. No change to how saving works.

**a. Implement `applicationShouldTerminate:` on tao's delegate** (covers the Dock, logout, restart, shutdown and the `quit` Apple event).
- It's added at start-up with the Objective-C runtime (`class_addMethod` on the delegate's class), in the macOS-only platform module (`storyforge-fs`'s `platform.rs`), behind a small API: `install_terminate_hook(callback)` and `reply_to_terminate(allow)`. The fs crate stays free of Tauri: the callback is a plain function that `lib.rs` supplies.
- **No new dependency:** the fs crate already depends on `objc2` for macOS. If it needs another `objc2` feature flag, I'll say so.
- The method returns "terminate now" if `quit_ok` is already set. Otherwise it **returns `NSTerminateLater`, calls `request_close`** (the same function ⌘Q uses), and remembers that a termination is pending.
- `quit_ready` then calls `replyToApplicationShouldTerminate:YES` before exiting if one is pending.
- **`NSTerminateLater` and not `NSTerminateCancel` is deliberate.** Cancel would also cancel a logout or shutdown, and macOS would tell the user the app refused. Later keeps the system waiting while we save, which is what it's for. If saving takes too long macOS shows its own "storyForge is preventing logout" prompt; the existing 5 s flush limit and 15 s watchdog still apply, and I'd propose making the watchdog reply too (so a hung window can't stall a logout past 15 s).
- If the delegate method is already there in a future tao, the hook has to cope: I'll check at start-up that the method was added, and log if not.

**b. Handle SIGTERM, SIGHUP and SIGINT.** A handler only sets an atomic flag (the only safe thing to do inside one). A small thread polls it and calls `request_close`. A second signal while closing is ignored; the watchdog covers a hang. `libc` is already a dependency on unix. Force-quit and `kill -9` stay uncatchable, and the README says so.

**c. Make a link rewrite in progress finish and a backup abandon cleanly on this path.** They already do on the safe path (`teardown`), so reaching it is enough. A test confirms it for the new routes.

**d. The README's "known gap" section** becomes a short note about force-quit only.

## 6. How each route will be tested

| Route | Test | Automated? |
|---|---|---|
| ⌘Q, red button, ⌘W | a smoke script (below) for the Quit menu and window close; the existing window-side tests | the window half yes; native keystrokes no |
| Dock Quit, logout, restart | **the quit Apple event** (`osascript … to quit`) stands for the Dock, and the same code path is what logout uses; the Dock and logout themselves can't be driven | the event yes; the Dock and logout are in Kenny's check |
| SIGTERM, SIGHUP | the smoke script | yes |
| Pending-termination reply | a Rust unit test on the hook's state machine (pending, reply once, reply when none is pending is a no-op) | yes |
| Text survives | WebKit test: type, send `close-requested` within the save delay, assert the text is on disk or in `_sf-backup/recovery/` | yes (exists in part; I'd extend it) |
| Rewrite finishes; backup abandoned cleanly | the existing teardown tests, plus one through `shutdownAndQuit` | yes |

**The smoke script** (`scripts/quit-smoke.mjs`, run on the Mac against the built app, not in CI): it starts the built app with `HOME` pointed at a temporary folder (so Kenny's real app data and recent projects are never touched), seeded with a recent-projects entry for a fixture copy, so the app opens a project without the picker. It then sends each route (the Apple event, SIGTERM, SIGHUP) and checks stderr for `close requested`, `the window finished saving; quitting` and that the process ends well inside 15 s. It can't type into the window, so it proves the route reaches the safe path with a project open, and the WebKit test proves the safe path saves typed text. Together they cover the chain. If seeding the recent list this way turns out not to work, I'll say so rather than fake it.

## 7. Questions for H1

1. **`NSTerminateLater` with a reply, rather than cancel-and-exit.** Is this right for logout and shutdown? It's the more correct and the more delicate choice: a bug could stall a logout, so the watchdog should reply too.
2. **Making the 15 s watchdog also reply** to a pending termination. Is 15 s the right ceiling for a logout, given macOS shows its own blocker after about that long?
3. **SIGINT as well as SIGTERM and SIGHUP.** A Terminal launch plus ⌃C is a developer route only; I'd include it, since it's the same handler.
4. **The unfinished-backup temp file** (§4): if the next open doesn't tidy it, is that in scope for this fix, or its own note?
5. **The smoke script** uses a temporary `HOME` and runs only on the Mac. Is a script outside `npm test` acceptable, like `npm run test:ui`?

## 8. Rulings (decision 31) and as built

0. **Upstream.** tao 0.37.2 (the newest on crates.io) has no `applicationShouldTerminate:`, so there is no update to prefer. The native method is added.
1. **`NSTerminateLater` with a reply, as built.** `applicationShouldTerminate:` is added to the application delegate's class by `install_terminate_hook` (`platform.rs`, objc2 runtime, no new dependency). It calls `request_close`, answers "later", and `finish_quit` replies once. A request that arrives while a close is under way joins it (`closing`); `quit_done` makes `quit_ready` and the watchdog race for a single exit, and when macOS is waiting the exit is the reply (never `app.exit` as well). A failed install is logged and the app behaves as before. `src-tauri/tests/quit_hook.rs` fails if tao's version changes from 0.37.1 or its delegate starts answering the method.
   *Restricted run-loop mode.* **Not yet proven.** `npm run test:quit` is the proof: with a project open and unsaved text, the Apple-event route must land the text on disk, which needs the window's script, its calls into Rust, Rust's file work and `quit_ready` to run while macOS waits. It could not run when this was written (the Mac's screen was locked); the result is recorded in §9.
2. **The watchdog replies too** (15 s kept), through the same `finish_quit`. **Finding:** a link rewrite *can* still be running when it fires. `shutdownAndQuit` awaits an active rewrite with no time limit (decision 24: half-updated links are worse than a slow quit), but the watchdog is a Rust timer that does not know. A rename of a Codex note linked from thousands of files that takes longer than 15 s would be cut off. Not changed here (the only fix is a new window-to-Rust message, which the interface rules do not allow without a ruling); reported for decision.
3. **SIGINT in**, with SIGTERM and SIGHUP: the handler only sets a flag; a polling thread (every 100 ms) hands `request_close` to the main thread. A second signal while closing is ignored (`closing`).
4. **Leftover temporary files: looked at, held.** The app's temp files are `.<name>.<random>.tmp` beside their target, hidden, so the scan never lists them. Tidying on open needs (a) a way to list hidden names, which no Backend call has, and (b) a way to retire a file under `_sf-backup/` or a book folder, which the guard refuses (`retire` is for backstage metadata only). That is a new guard operation, which ruling 4 says to hold on. Nothing is built; the next step is Kenny's ruling on the new operation.
5. **The smoke script** is `npm run test:quit` (`scripts/quit-smoke.mjs`). It refuses if storyForge is already running, if the screen is locked, or if System Events is not allowed; it checks the temporary HOME by finding the fixture copy in the start screen's recent list (only possible if the app read the temporary data folder) and that the real data folder is unchanged afterwards; it uses copies of `test/fixtures/series` only.
