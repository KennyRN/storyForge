# storyForge

> **This repository is mid-transition.** storyForge is becoming a standalone desktop app.

The Obsidian plugin that used to live here continues as **[storytellingForge](https://github.com/KennyRN/storytellingForge)**. If you want the plugin, use that repository.

What is in this repository right now is the app's **data core**: a TypeScript library that reads and writes a folder of markdown in the 0.17 layout (series, novels, chapters, the Codex, word-count history) with no dependency on Obsidian, a node file-system backend, and a read-only check you can point at a copy of a folder: `npm run check -- <folder>`. It has no interface yet and is not a release. The last version of this repository that was still an Obsidian plugin is the tag `plugin-harness-final`.

The plan for the app lives in the project's decisions document.
