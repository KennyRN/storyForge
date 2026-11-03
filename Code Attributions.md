# Code Attributions

This project uses techniques (not copied code, unless noted) originating from the following third-party, open-source Obsidian plugins and code snippets. Attribution and licence details are below, as a courtesy regardless of whether any code was directly adapted.

---

## Grafted-editor technique (continuous mode's inline click-to-edit)

`src/view/graftedEditor.ts` mounts a real Obsidian `WorkspaceLeaf`/`MarkdownView` into arbitrary plugin DOM by constructing a `WorkspaceSplit` and overriding its `getRoot`/`getContainer` to point at Obsidian's real layout tree. This technique originates with:

- **Hover Editor**, by NothingIsLost and contributors (with acknowledged contributions from pjeby) — **MIT Licence**. `Copyright (c) 2018-2021 NothingIsLost <nothingislost@fastmail.com> and others.` *See [MIT License](#mit-license) below.*
  Source: https://github.com/nothingislost/obsidian-hover-editor
- Its application to a continuous, multi-note editing surface (the specific shape storyForge's continuous read-and-write mode needed) was demonstrated by **Daily Notes Editor**, by Quorafind (Boninall). Daily Notes Editor carries no `LICENSE` file and no `license` field in its `package.json` — no licence means all rights reserved by default, so storyForge takes design lessons from it (an unload hysteresis before unmounting an off-screen editor, a generous `IntersectionObserver` margin, holding a section's height across its content unmounting) but **no code**.
  Source: https://github.com/Quorafind/Obsidian-Daily-Notes-Editor

storyForge's own implementation is written from Obsidian's public API (`WorkspaceSplit`, `Workspace.createLeafInParent`, `WorkspaceItem.getRoot`/`getContainer`, `WorkspaceLeaf.setPinned`/`detach`), not copied from either plugin above.

## Embeddable Markdown Editor technique (considered, not used)

A different, more commonly vendored technique — constructing a standalone CodeMirror editor not backed by a real file — was documented publicly by **Fevol**, crediting **mgmeyers** of the Kanban plugin for the original prototype-resolution work. storyForge does not use this technique: it isn't file-backed (persisting it would mean the plugin calling `vault.modify` directly on a chapter body, which storyForge's write-guard tenet forbids), so it doesn't fit here. Noted for completeness, since it's the technique most often associated with "an editor embedded in a plugin's own view."

## Ink Slider (sliding indicator on storyForge's icon rails; no longer in the app)

*Removed in 1.6.3: the library's tab row no longer has an ink bar, and nothing else used it. This entry stays as the record of what the code was adapted from.*

`src/view/inkSlider.ts` and the `.sf-ink-track` / `.sf-ink-bar` rules in `styles.css` adapt the "Ink Slider" CSS tab pattern, in which a solid bar slides beneath the active tab, its position and size measured from the active element rather than assumed and re-aligned when the layout resizes. storyForge turns it vertical, so the bar slides beside the selected icon on the Notebook and Archive source rails, every codex index's #tag rail and the storyTelling sidebar's continuous-mode toggle, and keeps the original's easing curve (`cubic-bezier(0.65, 0, 0.35, 1)`) and 0.45s duration.

- **Ink Slider**, by CodeFronts — **MIT Licence**. The page gives no named author or copyright year; it states only "MIT licensed". *See [MIT License](#mit-license) below, read with CodeFronts as the copyright holder for this entry.*
  Source: https://codefronts.com/navigation/css-tabs/ink-slider/

storyForge's implementation is written for the plugin's own rail markup and re-render cycle (carrying the bar's position across a rail rebuild, a `ResizeObserver` instead of a window resize listener), not copied from the snippet.

## `yaml` (frontmatter parsing and value generation)

`src/core/frontmatter.ts` uses the **`yaml`** package by Eemeli Aro — **ISC Licence** (`Copyright Eemeli Aro <eemeli@gmail.com>`). It is a runtime dependency used for parsing, source ranges and generating the text of new or changed values; no code is copied from it.
  Source: https://github.com/eemeli/yaml

## `obsidian-typings`

By Fevol and contributors — used only as a reference during research to verify internal API shapes; not a project dependency and no code from it is included.

---

## MIT License

MIT License

Copyright (c) 2018-2021 NothingIsLost <nothingislost@fastmail.com> and others

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## Dependencies added for the desktop shell (Brief 4)

Used as libraries (nothing copied). Licences as declared by each package.

| Package | Version | Licence | Used for |
|---|---|---|---|
| tauri, tauri-build | 2.12 / 2.7 | Apache-2.0 OR MIT | the desktop shell |
| tauri-plugin-single-instance | 2.5 | Apache-2.0 OR MIT | a second launch focuses the first |
| rfd | 0.15 | MIT | the native folder picker (so the window holds no dialog permission) |
| notify | 8.2 | CC0-1.0 | the file watcher (FSEvents on macOS) |
| serde, serde_json | 1.0 | MIT OR Apache-2.0 | commands' data |
| unicode-normalization | 0.1 | (MIT OR Apache-2.0) AND Unicode-3.0 | NFC path rules in the Rust guard |
| base64 | 0.22 | MIT OR Apache-2.0 | binary data across the command boundary |
| libc | 0.2 | MIT OR Apache-2.0 | `renamex_np` (the atomic swap and exclusive rename) |
| objc2, objc2-foundation | 0.6 / 0.3 | MIT | asking macOS to download an iCloud file |
| tempfile (tests only) | 3 | MIT OR Apache-2.0 | temp folders in Rust tests |
| vite | 8.3 | MIT | bundling the window's TypeScript |
| @tauri-apps/cli, @tauri-apps/api | 2.12 | Apache-2.0 OR MIT | building the app; the window's `invoke` and events |

## Dependencies added for the interface (Brief 5)

Used as libraries (nothing copied). Licences as declared by each package.

| Package | Version | Licence | Used for |
|---|---|---|---|
| @codemirror/state, @codemirror/view | 6.7 / 6.43 | MIT | the editor (one per writing session) |
| @codemirror/commands | 6.11 | MIT | undo history and the standard editing keys |
| @codemirror/search | 6.7 | MIT | find and replace in the open file |
| lucide | 1.61 | ISC (some icons MIT, from Feather) | the interface's icons, bundled locally (only the ones used); also in `Icon Licences.md` |
| @playwright/test | 1.64 | Apache-2.0 | **development only**: drives WebKit against the browser preview for the interface tests; never part of the app |

The prose dressing (`src/ui/editor/dressing.ts`, `dressingView.ts`) is storyForge's own code from 0.17.1, ported; no outside code.

The window's colours are **Everforest** (sainnhe, MIT; see `Theme Licences.md`); the Soft Dark values were checked against the project's `palette.md`.
