# storyForge

storyForge is a desktop app for writing a novel or a series. Your writing lives in plain markdown files in a folder you choose, so it is always yours, readable in any editor and on GitHub. The app is for **macOS** for now; Windows is planned.

The Obsidian plugin that used to live here continues as [storytellingForge](https://github.com/KennyRN/storytellingForge).

## Installing on a Mac

1. Download `storyForge_<version>_universal.dmg` from the [releases page](../../releases). It runs on Apple Silicon and Intel Macs.
2. Open the `.dmg` and drag storyForge to Applications.
3. Open storyForge. The first time, macOS says it can't verify the app, because it is signed with a free ad-hoc signature rather than by Apple.
4. Open **System Settings ▸ Privacy & Security**, scroll down to the message that storyForge was blocked, and choose **Open Anyway**. Enter your password if asked, then open the app again and confirm.

macOS asks only once. If it says the app is "damaged", run `xattr -dr com.apple.quarantine /Applications/storyForge.app` in Terminal and open it again.

## Checking a download is genuine

Every download is built by GitHub from this repository and carries a signed build-provenance attestation. With the [GitHub CLI](https://cli.github.com):

```sh
gh attestation verify storyForge_<version>_universal.dmg --repo KennyRN/storyForge
```

It succeeds only for a file GitHub built from this repository.

## Good to know

- **storyForge makes no network requests, and never updates itself.** New versions come from the releases page.
- **Back up your writing.** storyForge is young. It saves carefully, never overwrites what it hasn't seen and keeps its own backups inside your project, but a copy of your folder somewhere else is still wise.
- **Reporting a problem:** open an [issue](../../issues).

## Building it and changing it

You need Node.js, Rust (with `rustup target add aarch64-apple-darwin x86_64-apple-darwin`) and Xcode Command Line Tools.

```sh
npm ci
npm test                      # the TypeScript tests
(cd src-tauri && cargo test --workspace)
npm run app:dev               # run it in development
npm run app:build             # a universal .app and .dmg, in src-tauri/target/universal-apple-darwin/release/bundle/
```

`npm run ui:preview` serves the interface in a browser for development. `AGENTS.md` and the `docs/` folder explain how the project is organised and the rules it keeps. A build made on your own Mac carries your folder paths inside it, so don't share it; share the downloads from the releases page.

## Licence

MIT, in [LICENCE.md](LICENCE.md). Fonts and icons keep their own licences: see `Font Licences.md`, `Icon Licences.md` and `Theme Licences.md`.
