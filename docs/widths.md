# Panel widths: the H1 survey (Fix 5)

Branch `widths`, from `main` at `v1.4.0` (`8844d55`). Nothing is implemented. This is the survey the fix's §2 asks for, with proposals for Kenny to rule on.

## 1. How panel widths work today

**Stored** in machine settings, per project (`MachineProjectState` in `src/app/settings.ts`): `leftWidth` and `loreWidth`, in pixels. They are read back only if they are finite numbers. `loreHidden` is stored beside them (only when true).

**Two widths exist, not three.** `leftWidth` is one figure for the left panel on *both* sides: the storytelling and library faces share the same `.sf-left` element, so flipping side never changes it. So the fix's "three widths" is one new width, not three new settings of an existing kind.

**Defaults** (`src/ui/model.ts`): left 288 px, context 400 px.
**Limits** today: left 200–480 px, context 280–640 px (`clampLeft`, `clampLore`). There is **no workspace minimum**: the centre is `flex: 1; min-width: 0`, so a small window shrinks the workspace towards nothing and the side panels keep their widths.

**Resizing** (`splitter()` in `src/ui/shell.ts`): a `role="separator"` with `tabindex=0`. Dragging sets width = start width ± pointer movement. ← and → move it by 16 px, or 48 px with Shift. Both routes call `model.setWidths`, which clamps, stores in `nav` and schedules a save (`persistSoon`). Nothing is written to `project.md`.

**A hidden context panel** keeps its `loreWidth`; only `loreHidden` changes, and the splitter is hidden with it.

## 2. How settings are laid out

`src/ui/screens/settings.ts` draws one dialog of `section(title, rows)` groups: Numbering, Backups, Sessions, Display, Typing, Interface. Every row reads and writes `project.md` through `ProjectSettings`, and shows a source word (`this project`, `the plugin's settings`, `default`). Number fields exist (`number(...)`), but they write `project.md`.

A new group, **"This Mac, this project"**, goes after Interface. Its rows are not `ProjectSettings` keys, so they show no source word; instead the group's heading line says plainly "These stay on this Mac and don't travel with the project." The widths read and write `model.nav`, not `settings`. The dialog is modal, so "live while dragging" can only be seen if the figures are redrawn on the `nav` topic, and a divider can't be dragged while it is open; the live link is therefore checked by drag-then-open and by keyboard resizing with the dialog closed. (If Kenny wants settings non-modal, that is a bigger change; not proposed.)

## 3. Proposed limits (pixels)

| | Minimum | Maximum |
|---|---|---|
| Left panel (both sides) | 200 | 480 |
| Context panel | 280 | 640 |
| Workspace | 360 | none |

The panel limits are today's, kept so no one's stored width becomes invalid. They were chosen for the left panel's Codex strip, a few characters of a name and an icon, and for the context panel's card with its 10% margins. The workspace minimum is new: 360 px keeps about 40 characters of 20 px prose and the chapter header usable (the chapter line is capped at 30em, 600 px).

**Same-width conflict:** with the switch on, one width serves all three panels, so it must satisfy both ranges: **280–480 px**. Anything outside is refused (typed) or clamped (dragging).

**Percent** fields use the same pixel limits converted at the current window width, and the allowed range is shown beside the field in the unit being used.

## 4. Defaults

- **Unit: percent**, as proposed, since Kenny's window manager switches between two sizes. *Kenny to confirm.*
- **Switch: on.**
- **First open in 1.5.0:** a project with no new keys takes its stored `leftWidth` (else 288 px) as the shared width, for all three panels. A project with a stored `loreWidth` of, say, 400 therefore changes to 288 once. Accepted in decision 76. With percent as the default unit, the shared width is converted at the window width on first draw (288 px in a 1440 px window is 20%) and then *stored in percent*, so it scales from then on.
- The fixtures: the standard `series` fixture has no stored widths, so it opens at 288 px shared. Tests that set both `leftWidth` and `loreWidth` will be listed in the report with what they did.

## 5. Narrowing for display

Available width for panels = window width − workspace minimum (360). If left + context exceed it:
1. **The context panel gives way first**, down to its minimum (280).
2. **Then the left panel**, down to its minimum (200).
3. If even both minimums don't fit, the **workspace takes priority** and the panels stay at their minimums (the window is too small to be useful; the frame scrolls rather than the workspace shrinking further).

With the switch on and equal widths, the equal-width rule yields to the limits for display only. Stored values are never touched; the display is computed on every resize. Settings shows the stored figure plus a quiet line: "Narrower in this window." The reason the context panel yields first: the centre needs it most while writing, and the context panel is the one an author can hide.

## 6. Rounding and conversion

- **Pixels** are whole numbers. **Percent** to one decimal place.
- A percent width is stored as a number (e.g. 20.0), with the unit stored beside it. Display width = round(window × percent / 100).
- **Converting the unit** takes the *displayed* width, not the stored one, rounds it to the new unit's precision and stores it. A round trip may move a panel by at most 1 px (pixel→percent→pixel at one decimal place loses up to 0.05% of the window, about 0.7 px at 1440 px, and rounds back to the same pixel). A test will check round-trips over a range of window widths from 800 to 2560 and require a drift of 0 px displayed after converting there and back.
- If the displayed width was narrowed (§5), converting stores the *stored* width converted, not the narrowed one, so narrowing still never rewrites a setting.

## 7. What is written, and where

Machine settings gain `widthUnit` (`px` or `percent`), `widthsLinked` (a boolean), and the widths. All are stored explicitly once any is set, so a later change of default can't move a stored layout. `project.md` is not touched. No Rust command is needed: machine state is already saved through `saveMachineState`.

*Open for Kenny:* to avoid a stale-key problem, the new keys store the unit explicitly and each width in that unit; the old `leftWidth` / `loreWidth` pixel keys are read once as the starting values and left in the file.

## 8. Questions for Kenny

1. Percent as the default unit?
2. Workspace minimum of 360 px?
3. Shared range of 280–480 px while the switch is on?
4. The context panel narrowing first in a small window?
5. Settings stays a modal dialog, so the live link is shown on reopening rather than while dragging?

## 9. Rulings (decision 77)

Kenny agreed each of these. The survey is accepted; the left panel's one stored width becomes two, one per side, applied when the side flips, both starting from the existing `leftWidth`.

1. **Percent is the default unit.**
2. **The workspace's minimum is 360 px.**
3. **The left panel's maximum rises from 480 to 640 px** (range 200–640). The context panel stays 280–640. While the same-width switch is on, the shared range is **280–640**. On first opening a project in 1.5.0 the context panel takes the storytelling side's left width (288 px by default); the report says what each fixture does.
4. **Narrowing in a small window:** switch on, both panels narrow by the same amount so they stay equal; switch off, the context panel gives way first, then the left panel. Stored figures never change.
5. **Settings stays modal.** A committed figure must visibly move the panel behind the dialog; a dragged width shows in settings the next time it's opened.
6. **Rounding accepted:** whole pixels, percent to one decimal place; converting the unit stores the width as displayed, so nothing moves.

Note on item 6 and §5: where a panel is narrowed for display, the unit change converts the *stored* figure, not the narrowed one, so narrowing still never rewrites a setting. When nothing is narrowed the two are the same.

## 10. As built (commit 2)

- Pure logic in `src/ui/panelWidths.ts` (limits, conversion, display widths); stored in machine settings as `leftWidth` (storytelling side), `libraryWidth`, `loreWidth`, `widthUnit`, `widthsLinked`.
- Absent `widthUnit` means pre-1.5.0 pixels: the panels open linked, in percent, all three at `leftWidth` (288 px if none). The converted figures are saved with the next change, not at open.
- If both minimums plus the workspace minimum exceed the window (under 840 px), the panels stay at their minimums and the workspace is narrower than 360 px.
