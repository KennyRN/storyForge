# storyForge

> **This repository is mid-transition.** storyForge is becoming a standalone desktop app.

The Obsidian plugin that used to live here continues as **[storytellingForge](https://github.com/KennyRN/storytellingForge)**. If you want the plugin, use that repository.

What is in this repository right now is the app's **data core**: a TypeScript library that reads and writes a folder of markdown in the 0.17 layout (series, novels, chapters, the Codex, word-count history) with no dependency on Obsidian, a node file-system backend, and a read-only check you can point at a copy of a folder: `npm run check -- <folder>`. It has no interface yet and is not a release. The last version of this repository that was still an Obsidian plugin is the tag `plugin-harness-final`.

The plan for the app lives in the project's decisions document.

## The desktop app (macOS)

storyForge is a Tauri 2 app (macOS first). The window runs the TypeScript core; a small Rust side owns the disk, checks every write against the same guard table as the TypeScript core (`test/guard-spec/guard.json`), and watches the folder for changes made elsewhere (Obsidian, Finder, a sync service). There is no real interface yet: the window is a plain diagnostic page for checking the shell against a copy of a project folder. The app makes no network requests, and the window has no file-system, shell or network permission of its own.

### Known gap: quitting from the Dock

Quitting with Cmd+Q, the app menu's Quit or the red window button saves open text first. **Quitting from the Dock's right-click menu does not:** macOS ends the app without telling the window, so text typed in the last 2 seconds (the autosave delay) can be lost, with no recovery file. Everything older is already saved. The fix needs native macOS code beyond the platform module and waits for the real interface.

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
