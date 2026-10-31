# Look, round two: survey (Brief 11, hold point H1)

Written on `look-2` from `main` at `45f4e78` (Brief 10 merged, `v1.2.0` tagged, no storyForge running). This is a reading of the code, not yet a look at the built app: **the screenshots the brief asks for are still to be taken** (see "Still owed"). Nothing is implemented.

## 1. Dividing lines

Every `border` in the interface CSS, sorted against §3.2.

| Where | What | Verdict |
|---|---|---|
| `faces.css` `.sf-splitter` (1 px wide, `--purpose-border`, accent on hover/focus) | The line between the panels, and the drag handle | **Goes as a line.** Keep the element, make it transparent, keep the ±4 px hit area, the `col-resize` cursor and the keyboard route. Its hover/focus accent is a state marker; **question 1 below.** |
| `faces.css` `.sf-navigator` `border-bottom` | Navigator / Codex | **Goes** |
| `faces.css` `.sf-stats` `border-top` | Codex / stats | **Goes** |
| `faces.css` `.sf-left-header` `border-bottom` | Project-name header / body | **Goes** |
| `faces.css` `.sf-rail` `border-right` | Library side: tab rail / pane | **Goes.** The ink indicator is positioned at `right: -1px` to sit on this line; it stays and is re-seated (it is a state marker). |
| `editor.css` line 16 `.sf-editor-banner` `border-bottom` | Read-only banner / note | **Goes** (a section divider) |
| `editor.css` line 93 `.cm-panels` `border-bottom` | Find panel / text | **Goes** |
| `kit.css`, `base.css`, `editor.css`, `overviews.css`: `1px solid --purpose-border` boxes (buttons, inputs, menus, dialogs, popups, fields, cards, covers) | Outlines of controls and floating things | **Stay.** They are control outlines, not dividers between parts of the window. |
| `kit.css` line 163 `border-left … trouble` | Notice marker | **Stays** (red, trouble) |
| Focus rings, `.sf-ink-track`, the selected-tab marker, folder lines, bar notches | State markers | **Stay** |
| The outer line around the window | | **Stays.** I could not find one in the CSS (the window frame is the native one). **Question 2.** |

Seven dividers go. Nothing else was found; a built-app screenshot pass may find more (a `box-shadow` or a background-colour hairline), and any it finds will be added here.

## 2. A note that is also a folder

`CodexTreeItem` of type `folder` may carry a `path`: that is a note whose folder holds children. `renderItems` (`codexTree.ts`) draws it as a folder row (`sf-codex-lore-folder`) with the name, the folder icon and the type icon. **I did not yet find where the same note is listed again inside its own folder**: the tree builder (`codexTree` in core) should say. I will read it and screenshot before commit 4; if the second listing comes from the core's tree rather than the view, hiding it in the view is still display only, as ruled.

## 3. Text size

The Codex list sets no size of its own: it inherits `--text-ui`, **13 px**. So §3.3 item 6 gives **16 px** (the "18 px if it's already 16" case doesn't apply). Row `min-height` is 28 px and the folder icon's hit area is 28 px square; at 16 px both still fit, so I would leave them, and keep the 1em icon gap (which grows with the text).

## 4. The titles

- **Project name:** `.sf-left-name` in `.sf-left-header` (`shell.ts:46`), top of the left panel, both sides; muted, 12 px, ellipsised.
- **Novel title:** `.sf-nav-novel` in the navigator (`navigator.ts:68`), storytelling side only, weight 600.
- The library side's novel/series tabs may show a title in their pane headers; **question 3.**

Both would take `--purpose-accent` as text colour only. Green is the interface accent (decision 8), so this stays in its role.

## 5. Contrast for the Codex colour

Against `bg_dim` `#293136` (text on the panel). The inverted highlight is the same ratio the other way round.

| Choice | Colour | Ratio | ≥ 4.5 |
|---|---|---|---|
| Default text (`fg`) | `#d3c6aa` | 7.83 | yes |
| Yellow | `#dbbc7f` | 7.25 | yes |
| Aqua | `#83c092` | 6.25 | yes |
| Purple | `#d699b6` | 5.73 | yes |
| `grey2` | `#9da9a0` | 5.43 | yes |

All five pass both ways. **Ruling (decision 64, item 6 and the palette message):** yellow `#dbbc7f`, aqua `#83c092` and purple `#d699b6` are Everforest's dark foregrounds, the same at every contrast level, and are now palette roles in `everforest-soft-dark.css`. The theme's existing `fg #d3c6aa`, `red #e67e80`, `orange #e69875`, `green #a7c080` and `blue #7fbbb3` were checked against the same source: **no mismatch**. The ratios above were computed from the theme's own values (`bg_dim #293136`, `grey2 #9da9a0`). `grey2` is also the muted-text colour, so with it chosen the list's text matches muted text elsewhere. No `palette.md` exists in the repository.

## 6. The fading scrollbar

Today: `scrollbar-width: thin` and `::-webkit-scrollbar` styling on `.sf-scroll` and the editor, which WebKit overrides with the Mac's own overlay/always-show behaviour. WebKit's native scrollbars can't be told to fade by CSS alone when the Mac's setting is "always".

**Proposal:** hide the native bar everywhere (`scrollbar-width: none` plus `::-webkit-scrollbar { display: none }`), and draw our own thin thumb as a small overlay: one shared helper (`kit/scrollIndicator.ts`) that, for each scroll container, listens for `scroll` (passive), positions an absolutely placed, `pointer-events: none` thumb from `scrollTop/scrollHeight/clientHeight`, shows it, and hides it ~1 s after the last scroll. A `prefers-reduced-motion` query removes the fade. Scrolling by trackpad, keys and Page Up/Down is untouched, since the container still scrolls natively. Dragging the thumb is left out (optional in the brief). Containers: the editor's `.cm-scroller`, `.sf-scroll`, `.sf-overview`, the history view, dialogs, the picker list and the shortcode popup. A `ResizeObserver` keeps the thumb right when content grows. Cost is small; no dependency.

## Questions for Kenny

1. **Splitter hover/focus:** keep the green accent line while hovering or keyboard-focused? It's a state marker, but a visible line appears where you hover. I would keep it on keyboard focus only, and show just the resize cursor on hover.
2. **The window's outer line:** I found none in the CSS. Is it the native frame you mean, or should I add a 1 px `--purpose-border` outline to the window?
3. **Other titles:** the library side's series and novel tabs also show titles. Should those turn green too, or only the project name and the navigator's novel title?
4. **Palette values** above: confirm, or give me `palette.md`.
5. **The ink indicator** sits on the rail's line. Re-seat it on the rail's edge as it is, without the line?

## Still owed before H1 is closed

- Built-app screenshots of each divider and the titles. These need the built app and a fixture with a temporary `HOME`; I have not launched anything. I'll take them once you've seen the above, unless you'd rather I did it first.
- Reading the core's tree builder for the folder-note duplicate (§2).
