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

## Ink Slider (Notebook and Archive source rails' sliding indicator)

`src/view/notebookInk.ts` and the `.sf-notebook-source-rail--ink` rules in `styles.css` adapt the "Ink Slider" CSS tab pattern, in which a solid bar slides beneath the active tab, its position and size measured from the active element rather than assumed and re-aligned when the layout resizes. storyForge turns it vertical, so the bar slides beside the Notebook or Archive source rail's active icon, and keeps the original's easing curve (`cubic-bezier(0.65, 0, 0.35, 1)`) and 0.45s duration.

- **Ink Slider**, by CodeFronts — **MIT Licence**. The page gives no named author or copyright year; it states only "MIT licensed". *See [MIT License](#mit-license) below, read with CodeFronts as the copyright holder for this entry.*
  Source: https://codefronts.com/navigation/css-tabs/ink-slider/

storyForge's implementation is written for the plugin's own rail markup and re-render cycle (carrying the bar's position across a rail rebuild, a `ResizeObserver` instead of a window resize listener), not copied from the snippet.

## `obsidian-typings`

By Fevol and contributors — used only as a reference during research to verify internal API shapes; not a project dependency and no code from it is included.

---

## MIT License

MIT License

Copyright (c) 2018-2021 NothingIsLost <nothingislost@fastmail.com> and others

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
