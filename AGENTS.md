# storyForge

storyForge is an Obsidian plugin (TypeScript) compatible with desktop and mobile. There is no standalone server or web app — the "application" is the plugin bundle (`main.js` + `styles.css` + `manifest.json`) loaded into Obsidian.

## Cursor Cloud specific instructions

Dependencies are npm-managed (`package-lock.json`); the startup update script runs `npm install`.

### Commands (see `package.json` scripts)
- Tests: `npm test` (vitest, ~130 tests). Tests stub the `obsidian` module via `src/__tests__/obsidianStub.ts` (aliased in `vitest.config.ts`), since the real module is only provided at runtime by Obsidian.
- Typecheck + production build: `npm run build` → runs `tsc -noEmit -skipLibCheck` then `esbuild` to produce `main.js`. There is no separate lint config; the `tsc` step in `build` is the type/lint gate.
- Dev build: `npm run dev` → `esbuild` watch mode, emits `main.js` with an inline sourcemap and keeps watching. Non-terminating; run it in a background/tmux session.

`main.js` is git-ignored and is a build output.

### Running the plugin end-to-end (Obsidian)
Desktop end-to-end testing uses the Obsidian desktop app; mobile compatibility should also be checked before release. Non-obvious desktop setup gotchas:
- The latest **public** Obsidian release can be **older** than `manifest.json`'s `minAppVersion` (e.g. public 1.12.7 vs required 1.13.0), which blocks loading. For a local test vault, copy `main.js`/`styles.css`/`manifest.json` into `<vault>/.obsidian/plugins/storyforge/` and lower `minAppVersion` in the **vault copy only** (never edit the repo's `manifest.json`). Enable it via `<vault>/.obsidian/community-plugins.json` = `["storyforge"]`.
- Launch the extracted Obsidian AppImage binary directly with `--no-sandbox` on the VM display (`DISPLAY=:1`); the AppImage's `AppRun` wrapper mis-detects `APPDIR` when passed flags, so invoke `.../squashfs-root/obsidian --no-sandbox` with `APPDIR` and `LD_LIBRARY_PATH` set.
- First launch shows a "trust author / enable plugins" dialog; accept it to load the plugin. First run of the plugin opens a "Welcome to storyForge" onboarding modal (enter a series name to proceed).

### Undocumented/internal API surfaces (re-verify on an Obsidian minor bump)

Two places in this codebase reach past Obsidian's public API contract. Neither is versioned by Obsidian, so a minor release is a re-verification trigger for both:

- `src/obsidianInternals.ts` — DOM selectors for native chrome (ribbon, sidebar nav panes, heading/emphasis classes in both reading view and Live Preview) that aren't part of the theming contract.
- `src/view/graftedEditor.ts` — grafts a real `WorkspaceLeaf`/`MarkdownView` into arbitrary plugin DOM (continuous mode's inline click-to-edit) via a freshly constructed `WorkspaceSplit` with its `getRoot`/`getContainer` overridden per-instance. Every operation used is public and exported except the `WorkspaceSplit` constructor's argument shape, which isn't declared in the public typings — if a future Obsidian changes it, construction throws (caught, logged, and falls back to opening a real editor in a normal tab instead), which is the most detectable failure point available.
