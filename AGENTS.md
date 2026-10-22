# storyForge

storyForge is becoming a standalone desktop app (Tauri 2, macOS first). This repository now holds the app's **data core**: a plain TypeScript library over a folder of markdown, with no dependency on Obsidian. The design decisions live in the project's `storyForge app – decisions.md`; read it before changing anything structural. The Obsidian plugin continues, unchanged, as `storytellingForge`; its last storyForge-repo incarnation (with its interface) is the git tag `plugin-harness-final`.

Reports to read first: `docs/strip-report.md` (what was removed from the plugin and why), `docs/project-handle.md` (the design of the core, with the review rulings in §10) and `docs/data-core-report.md` (what was built, and every difference from the plugin's behaviour).

## Layout

- `src/core/` — the library. `project.ts` (the **Project handle**: a synchronous in-memory index for reads, guarded asynchronous writes with write-through), `projectIndex.ts`, `frontmatter.ts` (parse and minimal-diff edit), `backend/` (the Backend interface, the **write guard** and `GuardedBackend`), then the ported data layer: `paths`, `series`, `book`, `codex`, `codexTree`, `tagRegistry`, `chapterSidecar`, `storyDetailsSidecar`, `chapterCreation`, `chapterPlacement`, `history`, `reconciliation`, `sectionBody`, `coverImage`, plus the pure maths and helpers.
- `src/backends/node-fs/` — the file-system Backend (atomic writes, `.trash/` retire). Used by tests and the CLI check now; the Tauri backend is Brief 4.
- `src/view/` — DOM-only helpers kept for the interface work (`dragReorder`, `dragReorderTree`, `dragLock`, `inkSlider`, `a11y`, `codexOpenTarget`) and `src/layout.ts`, `src/storytellingCenter.ts`. No Obsidian dependency.
- `src/cli/` and `scripts/` — the developer check: `npm run check -- <folder>` copies a folder and reports on it; it never writes to the source.
- `test/fixtures/` — synthetic projects in the 0.17 layout (`node test/fixtures/build.mjs` regenerates them; commit the result). `test/guard-spec/guard.json` — the write-guard rule table the Rust guard must also pass. `test/diskSafety/` — the disk-safety suite.

## Hard rules

- **The disk format is frozen at 0.17.** Every path, filename and frontmatter key is read and written exactly as 0.17.1 did. No migrations. A folder in an older layout is refused (`LegacyLayoutError`), untouched. Data of removed features stays on disk, untouched.
- **Unknown frontmatter keys survive every rewrite**, and **rewrites are minimal**: changing one key changes only that key's lines (`frontmatter.ts` splices into the original text). If a YAML construct can't be rewritten minimally, **stop and report**; don't accept wider churn. Unreadable frontmatter (anchors, tags, duplicate keys, bad syntax) means the file is *unavailable*, never empty, and every write to it is refused.
- **No prose writes.** There is no way to write a chapter body or a Codex note body. The single prose path, link rewriting on Codex rename, and backups are later work; until then an operation that would need them is **refused**, not approximated (`renameCodexNoteFile` throws `CodexRenameUnavailableError`).
- **The write guard sits below the data layer** (`GuardedBackend`); data code can't skip it. Its rules are the table in `test/guard-spec/guard.json`; change the table and the guard together, and keep the Rust guard's expectations in mind. Nothing is ever deleted: the only removal is `retire` into `.trash/`.
- **Fixtures are synthetic.** Never commit real manuscript or Codex text. Real-vault checks use `npm run check` on a local copy.
- **Attribution:** read `Code Attributions.md` before opening any reference repository. Escalate rather than copying from an unlicensed source.
- **Short-lived branches:** see `.cursor/rules/short-lived-branches.mdc`.

## Hold rules (stop and report, don't push on)

- A YAML construct can't be rewritten minimally.
- A test can't be ported faithfully.
- Something would need a behaviour change in a kept module, not just a severed import.
- The disk-safety suite fails and the fix would widen what an operation touches.

## Commands

- Typecheck: `npm run build` (= `tsc -noEmit`). `noUnusedLocals` is off in `tsconfig.json`; turning it on permanently is an open decision.
- Tests: `npm test` (vitest, including the disk-safety suite). CI runs install, typecheck and test only.
- Check a folder: `npm run check -- <folder>`.
