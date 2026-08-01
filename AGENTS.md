# storyForge

storyForge is a **desktop-only Obsidian plugin** (TypeScript). There is no standalone server or web app — the "application" is the plugin bundle (`main.js` + `styles.css` + `manifest.json`) loaded into the Obsidian desktop app.

## Cursor Cloud specific instructions

Dependencies are npm-managed (`package-lock.json`); the startup update script runs `npm install`.

### Commands (see `package.json` scripts)
- Tests: `npm test` (vitest, ~130 tests). Tests stub the `obsidian` module via `src/__tests__/obsidianStub.ts` (aliased in `vitest.config.ts`), since the real module is only provided at runtime by Obsidian.
- Typecheck + production build: `npm run build` → runs `tsc -noEmit -skipLibCheck` then `esbuild` to produce `main.js`. There is no separate lint config; the `tsc` step in `build` is the type/lint gate.
- Dev build: `npm run dev` → `esbuild` watch mode, emits `main.js` with an inline sourcemap and keeps watching. Non-terminating; run it in a background/tmux session.

`main.js` is git-ignored and is a build output.

### Running the plugin end-to-end (Obsidian)
Because it's desktop-only, running it requires the Obsidian desktop app. Non-obvious gotchas discovered during setup:
- The latest **public** Obsidian release can be **older** than `manifest.json`'s `minAppVersion` (e.g. public 1.12.7 vs required 1.13.0), which blocks loading. For a local test vault, copy `main.js`/`styles.css`/`manifest.json` into `<vault>/.obsidian/plugins/storyforge/` and lower `minAppVersion` in the **vault copy only** (never edit the repo's `manifest.json`). Enable it via `<vault>/.obsidian/community-plugins.json` = `["storyforge"]`.
- Launch the extracted Obsidian AppImage binary directly with `--no-sandbox` on the VM display (`DISPLAY=:1`); the AppImage's `AppRun` wrapper mis-detects `APPDIR` when passed flags, so invoke `.../squashfs-root/obsidian --no-sandbox` with `APPDIR` and `LD_LIBRARY_PATH` set.
- First launch shows a "trust author / enable plugins" dialog; accept it to load the plugin. First run of the plugin opens a "Welcome to storyForge" onboarding modal (enter a series name to proceed).
