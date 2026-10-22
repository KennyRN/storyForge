# storyForge

storyForge is becoming a standalone desktop app (Tauri 2, macOS first). This repository is mid-transition: today it holds a **stripped Obsidian plugin used as a test harness** while the app's engine is built. The design decisions live in the project's `storyForge app – decisions.md`; read it before changing anything structural. The plugin itself continues, unchanged, as `storytellingForge`.

## What the harness is

TypeScript, an Obsidian plugin bundle (`main.js` + `styles.css` + `manifest.json`). The strip removed everything on the v1 cut list (titleForge, the Story Context engine, the Notebook, plot threads and tags, registry editors, the icon picker, continuous mode and the guides, interface formatting and palettes, export/import/presets, migrations, Obsidian chrome management and Forge-family hosting). What remains:

- the storytelling and storyForge faces (left panel: navigator, Codex tree, stats; series/novel/chapter tabs and library management)
- the right-hand panel: the lore slot (Focus Mode) and the Archive list
- backups, word-count history recording, reconciliation of renames/deletes, `#` auto-numbering and its styles
- the whole data layer (`book.ts`, `series.ts`, `codex.ts`) and the pure layout maths (`seriesNovelBar`, `novelLengthBar`, `plotCardTier`, `historyMath`, …), kept for v1.1

`docs/strip-report.md` lists exactly what was removed, relocated and deliberately kept.

## Hard rules

- **Never install this build in a real vault.** It keeps the plugin id `storyforge`; use a copy of a vault.
- **The disk format is frozen at 0.17.** Do not rename, add or remove folders, files or frontmatter keys, and do not migrate or tidy anything. Data of cut features stays on disk untouched.
- **The prose tenet:** nothing writes prose except the author's own typing. `writeGuard.ts` refuses every write into the story library and Codex apart from the documented exceptions (create, rename, Codex alias edits, flat library-root files, backstage, backups, exports).
- **Attribution:** read `Code Attributions.md` before opening any reference repository. Escalate rather than copying from an unlicensed source.
- **Short-lived branches:** see `.cursor/rules/short-lived-branches.mdc`.

## Commands (see `package.json` scripts)

- Tests: `npm test` (vitest). Tests stub the `obsidian` module via `src/__tests__/obsidianStub.ts` (aliased in `vitest.config.ts`).
- Typecheck + production build: `npm run build` → `tsc -noEmit -skipLibCheck` then `esbuild` to produce `main.js` (git-ignored). The `tsc` step is the type gate; there is no lint config. `noUnusedLocals` is off in `tsconfig.json` — turning it on permanently is an open decision.
- Dev build: `npm run dev` (esbuild watch, non-terminating).
- CI runs install, test and build only. There is no release workflow in this repository on purpose.

## Undocumented/internal API surfaces (re-verify on an Obsidian minor bump)

- `src/view/graftedEditor.ts` — grafts a real `WorkspaceLeaf`/`MarkdownView` into arbitrary plugin DOM for the lore slot and the Archive page (`mountLeafEditor`, via `contextEditor.ts`), using a freshly constructed `WorkspaceSplit` with its `getRoot`/`getContainer` overridden per-instance. Every operation is public except the `WorkspaceSplit` constructor's argument shape, which the typings don't declare; if a future Obsidian changes it, construction throws (caught and logged), which is the most detectable failure point available.
- `leaf.tabHeaderEl` and the `.workspace-tab-header-inner-icon` selector (in `StoryContextView.ts` and `StoryForgeView.ts`) — used to repaint a tab's icon in place; both views degrade quietly if they disappear.
