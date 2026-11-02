# Fix 6: settings changed elsewhere, the H1 survey

**Branch `settings-sync`, from `main` at `v1.6.0`. Nothing is implemented.** Everything below is read from the code (no built-app run was needed, and none was made). Decision 96 is the design; this document answers §2 of the fix and ends with the questions Kenny rules on.

## 1. How settings are read and held today

- **One read, at open.** `appLife.ts` (`openProject`, about line 228) calls `loadSettings(project, readOutside)` once and keeps the result as `running.settings`: `{ values, sources, formatVersion, readOnly, readOnlyReason, pluginPosition }`. Nothing else calls `loadSettings`.
- **What it reads.** The frontmatter of `_backstage/storyforge/project.md`; for any key the file doesn't have (or holds invalidly) the plugin's `data.json` (read outside the project, never written), then the default. `sources[key]` records which. An unreadable `project.md` makes `readOnly` true; a `format-version` above 1 makes it read-only with a reason.
- **One object, mutated in place.** `setSetting(project, current, key, value)` writes through `project.modifyFrontmatter`, then sets `current.values[key]`, `current.sources[key]` and `current.formatVersion` on the same object. So `running.settings` keeps its identity for the whole session.
- **Who holds a reference to it.** Almost every reader looks at `model.running.settings.values` when it draws or acts. **The settings dialog is the exception: `openSettings` captures `running.settings` (and `off`, the read-only flag) once, when it opens,** and redraws from that object. A re-read must therefore update the same object in place; replacing `running.settings` would leave an open dialog showing stale values.
- **The model's route for "a setting changed".** The dialog's `change()` calls `setSetting`, then `model.touch("settings", "library", "nav", "face")`, then redraws. `applyLook` (Codex colour and Appearance) is subscribed to `"settings"` and `"project"`. Every watcher batch already ends in `controller.onChange`, which touches every topic.
- **Caches keyed on a value's identity.** `typingOptions()` reads the switches and lists at every keystroke; its elision set and name index are rebuilt only when the array it was built from is a different array. A re-read that assigned fresh arrays for unchanged lists would rebuild them for nothing, so unchanged values must keep their old references.

## 2. How the watcher reports `project.md`, and how our own writes are told apart

- `_backstage/storyforge/project.md` is inside the index's eager roots (`EAGER_ROOTS` includes `_backstage/storyforge`) and isn't a hidden path, so it goes through `applyBatch` like any other file. **No new watcher or Rust work is needed.**
- **Echoes.** `applyBatch` compares the file on disk with the index's hash (or size and time). `modifyFrontmatter` ends with `project.refresh(path)`, so the index already holds our own write; when the watcher reports it, the hash matches, it lands in `result.echoes`, and nothing else happens. An outside change has a different hash and lands in `result.changed` (or `result.appeared` if the file was absent, `result.vanished` if it was deleted).
- **So the trigger is one line in `onWatchBatch`:** after `applyBatch`, if the result's `changed`, `appeared` or `vanished` lists hold `PROJECT_SETTINGS_PATH`, re-read the settings. Our own writes can't loop: they're echoes, and a re-read writes nothing.
- **Sync tools** (iCloud and the like) can deliver the file as a stub first; `applyBatch` already maps stubs to the real path and treats the download as a state change, which the re-read can also respond to.

## 3. What "apply at once" means, setting by setting

A re-read computes the new values, compares each key with what the window holds (by value, `JSON.stringify` as `setSetting` does), changes only the keys that differ, then touches the model once, as the dialog does.

| Setting (key in `project.md`) | Read by | On an outside change |
|---|---|---|
| Codex colour, the 20 Appearance keys | `applyLook` (on `"settings"`) | At once. |
| `story-kind`, `hide-series-pane`, `highlight-active-chapter`, numbering styles | Faces and overviews as they draw (`navigator`, `storyforge`, tabs, `sessionsContext`) | At once, on the redraw the touch causes. |
| The four typing switches and lists (`typing-*`), the special-characters switch and list | `typingOptions()` and the characters button, per keystroke or per draw | At once; the next keystroke uses them. Unchanged lists keep their identity (§1). |
| `show-session-readout` | The stats panel's 250 ms redraw | At once. |
| `session-min-shown-minutes`, `session-editing-wpm` | Worked out when the history view or stats are shown | At once (past sessions reclassify; nothing is rewritten, decision 35). |
| `automatic-backup`, its frequency | Read at each 30-minute check | **Next check.** Switching it on from outside doesn't start a backup now; one already running isn't affected. |
| `session-idle-minutes` | The tracker takes the value when a session starts; the recorder's idle timer reads the live value each time it re-arms | **A new session uses it.** See the care point below. |
| `layout`, `auto-focus` | `initNav`, at open only | **Next open.** They change nothing while the project is open. |

**Care points (none needs a core change):**
1. **The idle limit mid-session.** `SessionTracker` keeps the limit it was given at the session's start, but `SessionRecorder.armIdle` reads `idleMs()` live when it sets the timer. If the limit changes while a session runs (by hand today, from outside after this fix), the timer can wake at a time that disagrees with the tracker, which decides the end by its own limit. The session still ends at its last edit either way, so no figure is wrong; it only means the end is noticed a little earlier or later. **Proposal: leave it, and say so in the report.** Making the recorder keep its session's limit is a small change in a kept module, and its own ruling if Kenny wants it.
2. **Numbering while a title is being renamed.** The rename box shows the title as typed and writes on Return; the numbering style only changes how titles are displayed, so a change from outside redraws the list around an open rename box exactly as a watcher reload of `codex.md` already does (decision 58 tested the draft box surviving a redraw). **Proposal: leave it.**
3. **A backup in progress** reads its settings when it starts, so a change mid-backup affects the next one only.
4. **An open settings dialog.** It redraws from `settings.values` on every `change()`. After a re-read it needs one redraw, which must skip the control the author is editing (a number box or the typing lists): the field keeps what is being typed, and its commit goes through the checked write (§4). The dialog's captured `off` flag also goes stale if the project turns read-only (item 5 below), so it should read the live state.

## 4. The checked write, and where the comparison goes

`setSetting` today decides "unchanged" against the window's copy and then `modifyFrontmatter` re-reads the file inside its transaction and edits one key. **The comparison fits inside that same transaction,** in the `mutate` callback that already sees the file's current frontmatter:

1. The callback reads `fm[field.file]` as it is on disk now, and applies the field's validity rule (an invalid or missing value reads as "the default or `data.json`", as `loadSettings` would).
2. If that equals what the window last read for the key (`current.values[key]`), it writes as today.
3. If it differs, the author's value is still written (decision 96: the latest deliberate act wins), and the callback records `{ key, replaced }` for the caller, which raises the notice after the write succeeds.
4. If the author's value equals what's on disk, nothing differs from the author's intent: no notice.

Because the comparison and the write are in one transaction (the same lock as the write, as `fieldWriter` does for fields), there's no gap between check and write. **No core change: `Project.modifyFrontmatter` is untouched;** `setSetting` passes a closure that closes over a local. If a key-by-key record of "what the window last read" turns out to need more than `current.values`, it's a field on `LoadedSettings`, in the app layer.

**One case stays as it is:** the author sets a value equal to the window's copy while the disk holds another. Today that writes nothing. It still writes nothing: the author did nothing in their own view, and the re-read lands within about half a second and shows what changed.

## 5. Unreadable, deleted, and newer

- **Outside change leaves `project.md` unreadable** (bad YAML, a sync conflict marker): keep the last values; say so once; `settings.readOnly` goes true with the reason already used at open ("The project's settings file (project.md) can't be read safely…"), which makes `setSetting` refuse; when a later change makes it readable, re-read, clear the flag and say nothing further. **This doesn't make the project read-only:** prose, Codex and the rest keep working. At open, an unreadable `project.md` does make the whole project read-only (`appLife.ts`, about line 214), because read-only is fixed at open (§5, newer format). Mid-session it can't be matched without a Rust or core change, so the mid-session behaviour is deliberately narrower: settings writes only.
- **`project.md` deleted from outside** (a sync tool, a tidy): proposal is **keep the last values in effect, no notice.** The next settings write already recreates the file from the values in effect (`setSetting`'s `!hasFile` branch), so nothing is lost.
- **A key removed from outside** reads as the default (or `data.json`), exactly as at open, and applies at once.
- **Invalid or unknown values** fall back to the default and are never rewritten, as today.

### The newer `format-version` arriving while the project is open (Kenny rules)

Read-only is fixed at open in three places: Rust's project handle (`is_read_only`), the `ProseWriter`'s constructor option and `openProject`'s skipping of reconciliation and backups. **None can be switched on later without a change to Rust or the core,** which the fix lists as a hold, so I'm not building any of it. Options:

- **A. Notice only.** A sticky notice, not red (nothing is lost): "This project was changed by a newer storyForge (format N). Close and reopen it to open it read-only." Settings writes refused (as for unreadable). Prose and everything else carries on. The risk is the one decision 24 exists to prevent (an older app writing into a newer project) for as long as the author keeps the project open.
- **B. Notice with the close done for them.** As A, with the notice offering "Close project", which runs the normal close (editors flush, the session ends, the snapshot saves) and returns to the start screen; reopening then opens it read-only through the existing path. **My recommendation:** it uses only what exists, loses no typed text (the close path flushes first), and leaves the choice of when to the author.
- **C. A true mid-session read-only flip.** Needs a Rust command (or an existing one reworked) and a core change to the writer, so it's its own decision and brief. Not proposed here.

## 6. Proposed wording of the notices

Fading (about 6 seconds), not sticky, not red (decision 8, since no words are at risk). The setting is named as the settings dialog names it; the value as it reads there.

- **Replaced a value changed elsewhere** (§4): `Changed "Smart punctuation" to Off. It had been changed to On on another Mac; that change is replaced.` For a number or choice: `Changed "Idle limit (minutes)" to 5. It had been changed to 10 on another Mac; that change is replaced.` One notice per write, keyed by the setting so a second replaces the first. ("Another Mac" is a guess; the app can't know where the change came from, so the safer text is "had been changed elsewhere": **recommended wording uses "elsewhere".**)
- **Unreadable, once:** `The project's settings file can't be read, so settings stay as they were and can't be changed until it can.` Sticky is wrong (nothing is at risk) but a longer fade is right (about 12 seconds); keyed, so it never stacks.
- **Readable again:** no notice; the values simply apply.
- **Newer format** (if B): sticky, with a "Close project" action, because it is about whether the author's later typing is safe.

## 7. How the tests will drive it (no code written)

- Preview: `window.__preview.touch(path, text)` writes the file and, as decision 50 records, the window hears of it only when the test also emits `watch-batch` with `paths: ["_backstage/storyforge/project.md"]` and `rescan: false`. The tests do both, as the outside-edit tests already do.
- Built app (through the guard, window-only pictures, `caffeinate -u`): rewrite the fixture's `project.md` from outside while the test copy is open and read the result from the window. **Finding in the meantime (2 November):** the first look at the stats pictures wrote `show-session-readout: true` into a running copy's `project.md` and nothing changed on screen, which is the gap this fix closes.
- Core: a test that the comparison runs inside the transaction (a write that finds a different value on disk records `replaced`); and that a re-read never writes (the file's bytes, and every other file's, unchanged).

## 8. Holds this survey found: none

No change to the core's data, the prose writer, the field writers or the close path is needed for §3.1 to §3.3 with the proposals above. The only thing that would need one is option C of §5, which isn't proposed.

## Questions for Kenny

1. **Newer format arriving mid-session (§5): A, B or C?** I recommend B.
2. **Wording (§6):** "elsewhere" rather than "another Mac"? And the 6-second fade for the replaced-value notice?
3. **Deleted `project.md` (§5): keep the last values and say nothing?**
4. **The idle limit mid-session (§3, care point 1): leave as it is?**
5. **An unreadable `project.md` mid-session refusing settings writes only,** not making the whole project read-only as at open: agreed?

## Rulings (decision 99, Kenny agrees)

The survey is accepted: the re-read in `onWatchBatch`, settings updated in place, the dialog redrawn while skipping the field being edited, and the checked write inside `modifyFrontmatter`'s transaction. What applies when (§3) is accepted as listed and goes in the report.

1. **A newer `format-version` arriving while the project is open: option B.** A sticky notice says the project was upgraded elsewhere by a newer storyForge, with a "Close and Reopen" action. The action runs the normal close (every editor saved as usual), then reopens the project read-only, as decision 24 sets. From the moment the newer version is seen, settings writes are refused; typing in chapters and fields still saves until the author closes. Option C is not part of this fix.
2. **Wording:** "elsewhere", not "another Mac". The notice fades after about 6 seconds, isn't red, and is announced to the screen reader.
3. **`project.md` deleted from outside:** keep the last values for this session; show a quiet notice once, saying settings return to their defaults when the project next opens. A setting changed afterwards creates `project.md` as at first creation: the `format-version` marker and that key only, without bringing back the deleted values.
4. **The idle limit mid-session:** left as it is. The new limit applies from the next session.
5. **Unreadable `project.md` mid-session:** settings writes are refused, with the notice once. The rest of the project carries on; the next open handles it as today.

## As built (1.6.1)

- **Re-read:** `refreshSettings(project, current, readOutside)` returns `ok` (with the keys that changed), `unreadable`, `newer` or `absent`, and applies only on `ok`. `onWatchBatch` calls it when the batch reports `project.md` changed, appeared or vanished, or asks for a rescan; `onSettingsChanged` touches settings, library, nav, face and stats.
- **Dialog:** subscribes to `"settings"` while open; a text box with focus is not redrawn under the author (`late` flag, one redraw on focus-out). Whether the controls are off is read at every redraw.
- **Checked write:** `setSetting` returns `{ key, replaced } | null`. The file's value, read inside the transaction, is compared with what the window last read; a key the window took from `project.md` but the file no longer has reads as the default. The author's value is always written. When the file already holds what the author chose, or what the window read, nothing is reported.
- **Unusable file:** `LoadedSettings.frozen` (`unreadable` or `newer`) with `readOnly` and a reason. `onSettingsProblem` fires on entering each state (and once for a deleted file, reset when it returns); the notices are in `ui/model.ts`. The first write after a deletion carries over only values that came from the plugin's `data.json`.
- **Notices:** `NoticeInput.ms` sets a transient notice's length (6 s for a replaced value, 12 s for the two file notices); names and values read from `ui/screens/settingNames.ts`.
- **What applies when**, as ruled: Codex colour, Appearance keys, story kind, highlight, numbering, typing switches and lists, the characters button, the session readout, and the session thresholds (`session-min-shown-minutes`, `session-editing-wpm`) apply at once; the automatic backup at the next 30-minute check; the idle limit from the next session (the recorder's timer reads it live, the tracker keeps the one it began with; no recorded figure is wrong); `layout` and `auto-focus` at the next open.
- **No hold was hit.** No change to Rust, the core, the prose writer, the field writers or the close path.
