# storyForge

> **This repository is mid-transition.** storyForge is becoming a standalone desktop app.

The Obsidian plugin that used to live here continues as **[storytellingForge](https://github.com/KennyRN/storytellingForge)**. If you want the plugin, use that repository.

What is in this repository right now is the app's **data core**: a TypeScript library that reads and writes a folder of markdown in the 0.17 layout (series, novels, chapters, the Codex, word-count history) with no dependency on Obsidian, a node file-system backend, and a read-only check you can point at a copy of a folder: `npm run check -- <folder>`. It has no interface yet and is not a release. The last version of this repository that was still an Obsidian plugin is the tag `plugin-harness-final`.

The plan for the app lives in the project's decisions document.

## The desktop app (macOS)

storyForge is a Tauri 2 app (macOS first). The window runs the TypeScript core; a small Rust side owns the disk, checks every write against the same guard table as the TypeScript core (`test/guard-spec/guard.json`), and watches the folder for changes made elsewhere (Obsidian, Finder, a sync service). The interface is plain TypeScript and DOM (no UI framework), in Everforest Soft Dark: a CodeMirror editor, the left panel's two sides, storytelling (navigator, Codex, stats) and library (codex, series, novel and archive tabs), the workspace in the middle and the context panel on the right, with the Mac menus. The app makes no network requests, and the window has no file-system, shell or network permission of its own.

### Trying the interface without the app

`npm run ui:preview` serves the interface in a browser at `http://127.0.0.1:1421` (development only, this computer only; it is not part of any build). It runs the real Rust file code over a temporary copy of a synthetic project, so nothing of yours is touched. `npm run test:ui` runs the interface tests in WebKit (the first time: `npx playwright install webkit`), and `npm run ui:shots` rewrites the screenshots in `docs/interface-shots/`. In a development build (`npm run app:dev`), View ▸ Developer ▸ Diagnostics shows how the project opened and what the watcher saw; a release build has no such item.

### Quitting

Every way of quitting that the system lets an app catch saves open text first: Cmd+Q, the red window button, the Dock's Quit, Log Out and Shut Down, and the signals a terminal sends (`kill`, Ctrl+C). The app stops the quit, saves every open editor, saves its snapshot, and then quits, within 5 seconds. **Force Quit, a crash and a power cut cannot be caught**, so text typed in the last 2 seconds (the autosave delay) can be lost then, with no recovery file; everything older is already saved. `npm run test:quit` checks the routes against the built app (docs/quit-paths.md).

### Building it (on a Mac)

You need Xcode Command Line Tools and Rust (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`, then `rustup target add aarch64-apple-darwin x86_64-apple-darwin`).

```sh
npm ci
npm run app:build      # a universal (Apple Silicon + Intel) .app and .dmg
```

The results are in `src-tauri/target/universal-apple-darwin/release/bundle/` (`macos/storyForge.app` and `dmg/storyForge_<version>_universal.dmg`). `npm run app:dev` runs it in development. Releases are built locally; there is no release workflow.

### Opening an app that isn't notarised

The build is signed only with the ad-hoc signature Apple Silicon needs to run at all; it is **not notarised** (that needs a paid Apple Developer membership). The first time you open it, macOS blocks it:

1. Open the app (double-click, or drag it from the `.dmg` to Applications first). macOS says it can't verify the app.
2. Open **System Settings → Privacy & Security**, scroll to the message about "storyForge" being blocked, and click **Open Anyway**. Enter your password if asked.
3. Open it again and confirm. After this it opens normally.

If macOS says the app is "damaged", the download was quarantined: run `xattr -dr com.apple.quarantine /Applications/storyForge.app` once and open it again.

### Tests

`npm test` (TypeScript, including the backend contract suite that runs against the real Rust code when a Rust toolchain is present) and `cargo test --workspace` in `src-tauri` (the guard table, containment, the disk operations, the watcher). CI on Linux runs the TypeScript tests and `cargo test -p storyforge-fs`.
