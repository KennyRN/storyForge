# Strip report (Brief 1)

The strip is complete on the `strip` branch (commits 1–14). Everything in the brief's definition of done that can be checked without Obsidian is checked; the two checks that need a vault are **not done** (see the end).

## Size

| | Before (`5699284`) | After |
|---|---|---|
| `src/`, excluding tests | 78,645 lines | 12,611 lines |
| Test files | 96 (1,006 tests) | 37 (340 tests) |
| `settings` fields | 293 | 13 |

## Removed, by commit

1. **titleForge** — `src/titleforge/`, `tools/titleforge/`; its write-guard allowance and path constant. `_backstage/titleforge/` is untouched on disk.
2. **Story Context engine** — all of `src/story-context/`, the recompute-on-edit hook, the NLP loader, `storyContextTabActive.ts`, the `recommend*` settings-key remap. `StoryContextView` slimmed from 1,925 to 450 lines: Focus Mode shows only the lore slot (open / click again to close), the storyForge face shows only the Archive. View type id kept as `storyforge-storyContext-view` (the brief wrote `storyContext-view`; that string is only the historical name in a comment).
3. **Overview interface and modals** — `SeriesOverviewView`, `NovelOverviewView`, `NovelPanel`, `NewChapterView`, `BookSynopsisModal`, `WordCountModal`, the novel/series/chapter title modals, `SeriesModal`, `ConvertToSeriesModal`. The Series and Novel tabs now only select (and nudge the right panel); the stats panel no longer opens a history modal.
4. **Continuous mode and the guides** — `ContinuousReadView`, `view/manuscript/`, `manuscript/`, `continuousMode`, `continuousEvents`, `navigatorControls`, `cyclingGuide`, `openingWords(+Region)`, `CyclingGuideModal`, the CodeMirror extensions. `writeManuscriptChapterBody` and its architecture test are gone from `writeGuard.ts`. **That function (see commit `94f1b3c^`) is the template for the app's single prose path:** only writes over the last-seen disk text, reports a conflict instead of overwriting, accepts only an existing placed chapter of the open book.
5. **Notebook** — `notes.ts`, `IdeaShelfPanel`, `IdeaSetTypeModal`, `ChapterIdeaCaptureModal`; Notebook handling in reconciliation, the Archive (no "notes" source), `TopPanel` (no "add chapter idea"), `tagRegistry`, `main`. `notes/` and `notes.md` stay on disk.
6. **Export, import, presets, onboarding, welcome note** — all `*Export*` modules/modals, `settingsPresets`, `settingsTransfer`, `onboardingConfig`, `userExport`, `welcomeNote`, `OnboardingModal`, the formatting-preset methods on the host API. `ProtectionsController`/`ProtectionsModal` are backup-only (one pane, no tab bar). The "Open onboarding" ribbon icon is gone.
7. **Plot threads, tags, registry editors, icon picker** — `plotThreads`, `vaultTags`, `PlotThreadRegistryModal`, `VaultTagModal`, `TagRegistryModal`, `TagPickerModal`, `IconPickerModal`, `confirmDeleteModal`. `tagRegistry.ts` is read-only now (still seeds a missing file exactly as before). `getCodexView` lost its tag-filter parameter. The corner buttons, `#tag` rails, type filters and chapter tag badges are gone.
8. **Interface formatting** — `UiFormattingModal`, `TextStyleModal`, the `interface*Tab` files, `styleController`, `colorPalettes`, `PalettePickerModal`, `sectionChrome`, `titleShadow` and the rest of the listed files (`novelColor.ts` went in 7). `inkSlider.ts` kept. `styles.css` untouched.
9. **Forge-family hosting and chrome management** — `hostApi`, `formattingApi`, `formatCompanionActive`, `rightRailOrder`, `ribbonRelocation`, `ToolsPanel`, `tabTitles`, `HideUiModal`, `ObsidianElementsModal`, `ArchiveView`, `goneAwayView`, `obsidianInternals`.
10. **Migrations/legacy** — `migration.ts`, `leftPanelMode.ts`, the uncalled word-count v1→v2 migration, the book parser's fallback to the pre-0.17 `order` key, the unused legacy-key type declarations.
11. **`main.ts` sweep** — 280 settings fields and defaults, three settings migrations, dead exported types. `main.ts`: 2,261 → 618 lines. Stale keys in an existing `data.json` are left alone.
12. **Dependencies/tooling** — `wink-nlp`, `wink-eng-lite-web-model`, `@codemirror/{commands,language,search}` removed; `sync-formatting-contract.mjs`, `linked-formatting-keys.json`, `release.yml` deleted; CI is install/test/build.
13. **Docs** — six docs for cut features and `NLP Licences.md` deleted; `Theme Licences.md` trimmed to Everforest; `AGENTS.md`, `README.md`, `CHANGELOG.md` rewritten/updated.
14. **Dead-code sweep** — see below.

## Relocations

| What | From → to |
|---|---|
| `DialogueQuoteStyle`, `normalizeDialogueQuoteStyle` | `story-context/quoteSpans.ts` → `dialogueQuoteStyle.ts` (new test) |
| story-details sidecar rename/delete | `story-context/cache.ts` → `storyDetailsSidecar.ts` (behaviour unchanged) |
| planned-length rows, Default PoV row, `renderMetaControl`/`renderMetaClearButton` | `view/NovelPanel.ts` → `view/plannedLengthFields.ts` |
| `resolveEntryChapter` (+ its tests) | `continuousMode.ts` → `spineWindow.ts` |
| `applySiblingReorder`, `siblingOrderAfterMove` (+ tests) | `vaultTags.ts` → `siblingOrder.ts` |
| `activateArchiveView` | `view/ArchiveView.ts` → `view/StoryContextView.ts` |
| `.workspace-tab-header-inner-icon` selector | `obsidianInternals.ts` → inlined in both views |
| numbering styles, hide-series-pane, auto-focus, highlight-active | `SeriesModal` → settings tab (and the chapter-numbering tab-title refresh went with `tabTitles`) |

## Hold points and judgement calls

I was told to carry on without a vault to check, so these are decisions I made where the brief said "hold and report". Please review them.

- **H1 (after commit 2) was passed without you checking the lore slot and the Archive in Obsidian.** Tests, typecheck and build passed at every commit; nothing was run in Obsidian.
- **Series title route (commit 3).** `SeriesModal` held the series title; nothing else did. I added an inline right-click rename on the series header line in `TopPanel`, using the existing `attachInlineRename` and `writeSeriesTitle`. That line is only shown on the Chapter tab (the Series tab never showed it), so this is a thin route. Adding a novel is covered by the left panel's existing control.
- **Planned-length fields (commit 3).** They needed more than the type from `NovelPanel`, so I extracted the code they use into `plannedLengthFields.ts` unchanged rather than holding.
- **`CodexSetTypeModal` changed behaviour (commit 7).** It is now assign-only: the inline "+ new codex type" row and per-row delete are gone, because `IconPickerModal` and `confirmDeleteModal` were on the delete list and nothing else can create or delete a type. Existing types still show and assign.
- **Filters removed with their pickers (commit 7).** The Codex tree's and Archive's "filter by type" button used `TagPickerModal`, so it went too. `getCodexView` still accepts the (pure) type-filter set.
- **Kept, although on the delete list:** `view/notebookPage.ts` (the Archive and lore page build on it) and `view/activateRightRailView.ts` (the lore slot and Archive command activate through it).
- **Done earlier than the brief says:** the `recommend*` key remap (commit 2, with `story-context/`), `novelColor.ts` (commit 7, it needed `plotThreads`).
- **New code, not just deletion:** `detachRetiredLeaves()` in `main.ts` closes leaves of removed view types (tools, archive, forge, continuous, series/novel overview, new-chapter, old storytelling tab) at layout-ready, so a saved layout doesn't show "plugin has gone away" tabs. It touches the workspace layout only, never vault files. `goneAwayView` recovery is gone as the brief says.
- **First run.** The brief expected a fresh vault might no longer get a series. It still does: `ensureSeriesFile` and the first-run book and chapter seeding are untouched. Only the onboarding modal is gone.
- **Writes on load that no longer happen:** creating `plot-threads.md` and `vault-tags.md` if missing, the settings migrations (one of which saved `data.json`), and the structural/schema migrations. No new writes were added.
- **Tools panel was on by default** (`useToolsPanel: true`), so Obsidian's ribbon and chrome come back in the harness.
- **Ghost-divider and structure-strip switches** (`novelGhostChaptersEnabled`, `novelStructureGuidelinesEnabled`) were removed from the code's settings because nothing reads them now; their values stay in an existing `data.json`. This touches your open item about whether those switches survive into v1.1.

## Legacy fallbacks kept (status unclear)

- `book.ts` `parseCodexRefs`: reads the old parallel `pov-path`/`pov-name` and `location-path`/`location-name` keys (the writer deletes them when it rewrites refs).
- `book.ts`: legacy `chapter-color` values are still honoured.
- `main.ts` `migrateCodexFocusLayout`: maps a saved `layout: "codexFocus"` to `hybrid` (settings only).

## Kept-but-unused data-layer functions (deliberate, for Brief 2 / v1.1)

- `book.ts`: `writeDialogueQuotes`, `writeChapterPov`, `writeChapterLocation`, `writeChapterTags`, `writeChapterColor`, `writeNovelTags`, `readBookSynopsis`, `writeBookSynopsis`, `readChapterPlot`, `writeChapterPlot`
- `series.ts`: `getBookId`, `writeSeriesCoverImage`, `readSeriesDescription`, `writeSeriesDescription`, `writeSeriesBookColor`
- `codex.ts`: `getCodexTypes`, `addCodexNoteAlias`
- `coverImage.ts`: fully used.

The exported API of `book.ts`, `series.ts`, `codex.ts` and `coverImage.ts` is identical to 0.17.1 (checked by diffing export names), and every module in the brief's §1.5 maths list still exists with its tests.

Also still present but now unreachable: `codex.ts`'s sibling-registered Codex types (`registerCodexType`), the `tagFilterMode` option in `codexTree.ts`, `createIdeaChapter` in `book.ts`.

## Dead-code sweep

A one-off `tsc --noUnusedLocals --noUnusedParameters` found 28 leftovers in non-test code; all are fixed and non-test code is clean under those flags. **`tsconfig.json` is unchanged** (the setting stays off; making it permanent is your call). Test files still have some unused imports, which I did not touch.

## Surprising

- The interface/style layer was wired into `main.ts` and the host API much more deeply than §3 describes: deleting `styleController` and `colorPalettes` meant stubbing parts of `hostApi`/`formattingApi` in commit 8, then deleting them in 9.
- `main.ts` carried 293 settings fields for features that were cut; 280 were unreferenced afterwards.
- `writeGuard.ts`'s remaining allowances are as the brief lists them: `_backstage/storyforge/`, flat library-root files, and (in other functions) `_sf-backup/`, `_export/`, create, rename and Codex alias edits; `_backstage/titleforge/` is now refused (tested).
- Left as they were because they were not on the lists: `docs/full-audit-2026-08-05.md`, `docs/text-labels.md`, `AUDIT.md`, the descriptive text in `Code Attributions.md` (its entries still apply: the grafted editor and ink slider are both kept) and `Icon Licences.md` (no icons were removed from `icons.ts`; some `usedIn` strings in `iconRegistry.ts` name removed views).
- Old workspaces: a saved layout with a leaf of a removed view type is detached on load (see above), not recovered.

## Verification

- **Harness check in a vault copy (§2) and the disk-safety checksum check: waived.** Kenny will not run this build in Obsidian; the first time it is looked at is when the new engine replaces Obsidian. Verification is therefore typecheck, build, the 37 test files / 340 tests, and by-construction reasoning: the write guard refuses any write into `_story-library/` and `Codex/` apart from the documented exceptions, and no code path that writes chapter or Codex bodies remains.
- H1 (after commit 2) was passed on the same basis.
