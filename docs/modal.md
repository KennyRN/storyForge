# Fix 8: one way for dialogs to behave (decision 119)

Branch `modal-focus`, from `main` at `v1.8.0` (`216ab34`). Commit 1 is this survey (read only). Nothing in `src/` has changed yet.

## 1. Survey

### 1.1 Every modal dialog

All of them are built by one function, `openDialog` in `src/ui/kit/dialog.ts` (an overlay, `role="dialog"`, `aria-modal="true"`, named by its title). No dialog is drawn any other way, and none is a native sheet or panel that the window draws. (The folder picker and cover picker are native, opened by Rust, and are outside this fix.)

| Dialog | Opens from | Buttons | What closing does |
|---|---|---|---|
| **Settings** (`screens/settings.ts`) | ⌘, and the app menu's Settings (`menu.ts`, `settings`, needs an open project) | Done | Nothing is written on close; each control has already written through the settings writer. `onClose` only unsubscribes from `settings`. |
| **Word count history** (`screens/history/historyDialog.ts`) | the graph button in the stats panel (`faces/stats.ts`) | Close | Read-only; `onClose` drops its subscriptions. |
| **Welcome to storyForge** (`screens/newProject.ts`) | the start screen's New Project…, and File ▸ New Project (`menu.ts`) | Cancel, Just one book, Start my series | Cancel and Escape do nothing else. The two start buttons close the dialog and create the project. Return in the box starts a series. |
| **Rename note** (`screens/renameCodex.ts`) | the Codex list's context menu, and Rename in the menu (`menu.ts`) | two steps, set by `setButtons`: Back and Rename; then "Renaming…" (disabled), then a result step | Escape at the plan step discards. While the rename runs, its only button is disabled. |
| **Codex picker** (`kit/codexPicker.ts`, PoV and Location lists) | the context panel's PoV and Location buttons and the left pane's default PoV | Cancel, Choose | Cancel and Escape discard; Choose hands back the list. |
| **Changes found when opening** (`screens/summary.ts`) | after a project opens, only if something happened | OK | Nothing is written. |
| The preview gallery's "Dialog" (`preview/gallery.ts`) | development preview only | Cancel, Rename | Not part of the app; it is a sample and follows the shared piece for free. |

### 1.2 How each behaves today

All of them share one implementation, so one description covers them:

- **Opening.** `openDialog` focuses the first `input`, `select` or `textarea` in the body, else the primary button, else the first focusable. In Settings the tabs are buttons, so focus goes to the first box on the General page, not the selected section. In the history view and the summary it goes to the primary button (Close, OK).
- **Escape.** Listened for by a `keydown` handler on the overlay only. It fires only while focus is inside the overlay.
- **Tab.** The same handler wraps Tab only when focus is already on the first or last control. The background is not `inert`, not hidden from the screen reader, and focus that is on the page body is not caught at all. Option-Tab is a Tab key event, so it takes the same path.
- **A second copy.** Nothing prevents one. `menu.ts` calls `openSettings` each time ⌘, is pressed, so the dialog stacks (the bug logged in decision 114). The same holds for the history view and for New Project.
- **Closing.** `returnTo.focus()` on the element that was active at opening. If that element has gone, nothing is focused.
- **Redraw.** Settings (`redraw`) and the history view (`draw`) rebuild their body with `replaceChildren`/`fill`. Settings puts the controls in use back; the history view refocuses a date cell. Neither keeps focus on a clicked tab or button.

### 1.3 The Escape bug's cause

Confirmed from the code. A tab's click handler sets `page` and calls `redraw()`, which builds all new tabs and calls `body.replaceChildren(tabs, panel)`. The clicked tab is removed. If it held focus, focus falls to `document.body`. The overlay's `keydown` handler is on the overlay, which does not contain the body, so Escape is never seen. (That is the "focus falls to the page body" cause in the brief.)

The second part of the brief's check: WebKit on the Mac often does not focus a `<button>` on click at all. In that case the clicked tab never had focus, and focus stays wherever it was before the click (the Done button or a box on the page). The same Escape handler would still work in that case, so it is the redraw that breaks Escape, but a tab that was focused by the keyboard (arrow keys, which also redraw and then refocus) does survive. I will prove both in a WebKit test in commit 2 rather than assert it here.

The fix does not depend on which of the two happens: the dialog itself takes the key handling, at the document level, and a click inside the dialog never leaves focus on the body.

### 1.4 The lost Writing-tab click

The kept trace (`~/Library/Logs/storyForge-test-traces/1.6.3-lost-writing-tab-click/`) holds the failed test's page snapshot, screenshot and trace: Settings is open and the Typing section never appeared, i.e. the click on Writing did nothing and the dialog stayed on General. It does not hold a dialog event log, so it shows the symptom and not the moment.

The likely cause, from the code: `redraw` is also run by `model.subscribe("settings", redraw)` and by a `focusout` `setTimeout(redraw, 0)`. A redraw between the pointer going down and coming up removes the tab that was pressed, and the browser then sends the click to the common ancestor, not to a tab. That is the same mechanism as the Escape bug (a redraw replacing the clicked control), so I expect them to share a cause. I have not reproduced it. Commit 2 adds the event log and a test that clicks during a redraw; if the lost click turns out to have a different cause that reaches beyond the dialogs, that is a stop condition and I will stop and report.

`openSettingsDialog`'s wait (decision 109) does not hide this; it only waits for the General page. It stays.

### 1.5 The proposed shape

One shared piece, **`src/ui/kit/dialog.ts`** itself (every dialog already goes through it, so none needs its own code). `openDialog` gains:

1. **A registry of open dialogs, by key.** Settings, history and New Project pass a key; opening one that is open brings it forward and focuses it (a `reopen` returns the existing `OpenDialog`). Rename and the Codex picker are opened from a single place each and also take a key, so there is one copy of each. The summary appears once per open.
2. **An optional starting point** (`focus: () => HTMLElement | null`), used by Settings (the selected tab) and the history view (the first heat-map cell or the Close button); the default stays the first box, else the primary button, never a destructive or confirming button. For "Welcome", the series name box. For the Codex picker, the filter box. For the summary, OK is its only button.
3. **`inert` on the rest of the page** while open (and the existing `aria-modal`), so the keyboard, pointer and screen reader cannot reach it. The overlay stays outside the inert part.
4. **Keys at the document level, in the capture phase**, handled only by the topmost dialog: Escape closes by the Cancel button's route, or Done where there is no Cancel, and never fires a confirming button; Tab and Option-Tab cycle the dialog's controls and wrap, and Shift reverses. If focus is on the body or elsewhere, the key brings it back inside.
5. **Escape and menus.** A floating menu inside a dialog already stops Escape (`kit/menu.ts`, `navMenu.ts` and `filterPopover.ts` use `stopPropagation`); the capture-phase handler will leave Escape alone while such a menu is open (it checks for an open menu) so the menu closes first.
6. **Focus that survives redraws.** The dialog watches for focus falling to the body and puts it back on the same control, found by a stable key (`data-focus-key`, or the control's `aria-label`/tab name), else on the dialog itself. A click inside the dialog that would leave focus on the body focuses the control under it, or the dialog (`tabindex="-1"`).
7. **Closing** restores focus to the opener; if it is gone, to the chapter editor on the storytelling side, or the library side's current list.
8. **The lost click.** Settings holds a redraw while a pointer is down inside it and runs it on release (this is a change to when `redraw` runs, not to what it does or writes; decision 109's rule is unchanged).

Settings is the only dialog that needs more than the shared piece (a stable key on the tabs and the pointer hold). The others join by passing a key and, where useful, a starting point. Focus rings follow decision 106: focus moved by the app shows a ring only if the last input was a key (`kit/inputMode.ts`).

### 1.6 Stop conditions: checked against the survey

- The lost click is probably the Escape bug's cause (a redraw), and fixing it stays inside the dialogs. Not stopped, but it is unproven until commit 2's test.
- No dialog needs a different write or different buttons.
- Escape has a safe route in every dialog: Cancel (Welcome, Codex picker), Back or close at the plan step (Rename: during "Renaming…" Escape is ignored, since its only button is disabled and closing would not stop the rename), Done or Close or OK where that is the only button.
- No dialog is a native sheet or panel.

### 1.7 Notes

- A storyForge process (pid 41549, the built app under `src-tauri/target/…/release/bundle/`) is running. It is presumably Kenny's copy. I have not touched it and will build nothing until it is closed (decision 66). The survey and the code and test work in commits 2 and 3 do not need a build; the `test:ui` run uses the preview.
- `src/diagnostic/diagnostics.ts` handles Escape too; it is a development-build overlay and I have not surveyed it as a dialog.
