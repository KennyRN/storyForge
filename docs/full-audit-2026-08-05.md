# storyForge full-codebase audit — 2026-08-05

Fresh full pass over `src/` (~28k non-test lines across ~85 modules), `styles.css`, `manifest.json`, `package.json`, `sync-formatting-contract.mjs`, and the July 9 [`AUDIT.md`](../AUDIT.md). New areas since July (settings presets/transfer, backup hardening, API v8, Protections themes, RecommendationView, pop-outs) are included.

Method: live source + call-site re-verification. **229 / 229 tests passing** at audit time. Not a vault soak.

Companion interaction details also live in [`api-audit-2026-08-05.md`](./api-audit-2026-08-05.md). This document is the whole-plugin audit.

---

## Executive summary

No P0 vault-escape into Library/Codex was found. Write guarding (`normalizeVaultPath` + backstage/backup asserts) is solid, and **most §3 bugs from 2026-07-09 are fixed** (history queue, `onClose`, drag lock, `renameChapterEntry`, writeGuard tests, pop-outs, Unicode slugs).

Highest remaining defects:

1. **Cover-image path join is unsanitized** — can delete/overwrite other `_sf-backstage/` files (P1).
2. **Standalone Themes `importSettings` skips linked validators** (P2).
3. **Mobile compatibility was incorrectly disabled in the manifest** despite the runtime using browser-compatible APIs (resolved after audit).

New host/theme surface (API v8, presets, backups, companion deferral) is generally well hardened and tested.

---

## Strengths

- Write guard with `..` collapse, absolute/null rejection, and separate backup root (`writeGuard.ts`); 20 dedicated tests.
- Per-path `enqueueBackstageWrite` + history’s own `enqueueWrite`; concurrent word-count tests cover cross-book serialization.
- API v8 validated `updateLinkedSettings` / `updatePalette`; compile-time `LINKED_FORMATTING_KEYS` ↔ settings ↔ union checks; `sync-formatting-contract.mjs` keeps formatForge in sync (197 keys after track-colour retirement).
- Pop-out support via `window-open` / `getStyleDocuments()` (`main.ts`).
- Drag safety via `dragLock` + keyboard reorder; StoryForgeView / RecommendationView `onClose` cancel debouncers.
- No `innerHTML` / `insertAdjacentHTML` in `src/` — UI uses Obsidian `createEl` / `text` / `setText`.
- Test growth: writeGuard, history, settingsPresets, settingsTransfer, formatting/handoff stress suites.

---

## Findings

### P0

None.

### P1

#### 1. Cover image paths are not constrained to a single filename

`src/book.ts` (~246–252); callers `RecommendationView.ts` (~447–449), `BookSynopsisModal.ts` (~303–304).

```ts
const filename = `cover.${extension}`;
const folder = bookBackstagePath(bookFolderName);
const path = `${folder}/${filename}`;
if (previous && previous !== filename) {
  await deleteBackstagePath(app, `${folder}/${previous}`);
}
await writeBackstageBinary(app.vault, path, data);
```

`extension` and frontmatter `cover-image` (`previous`) are concatenated without sanitizing `/` or `..`. `deleteBackstagePath` / `writeBackstageBinary` normalize, so values like `../../series.md` resolve under `_sf-backstage/` and can **trash or overwrite series metadata**. Still blocked from Library/Codex, but critical within backstage. Hand-edited `cover-image` is enough to trigger the delete path.

### P2

#### 2. Standalone Themes import bypasses linked validators

`src/main.ts` `importSettings` ← `ProtectionsModal` apply.

Merges any key present in `DEFAULT_SETTINGS` by presence only — no enum/type checks. Host API path validates (`hostApi.ts`). Hand-edited theme JSON can persist invalid enums that break CSS maps.

#### 3. `updateSetting` lacks rollback that `updateSettings` has

`src/main.ts`. On `saveSettings()` failure, in-memory settings stay mutated while disk may not. Batch path restores previous. Most UI still uses fire-and-forget `updateSetting`.

#### 4. Recommend sidecar RMW without per-path queue

`src/recommend/cache.ts` `writeRecommendCache`; `src/recommend/decisions.ts` mark/persist resolved.

Both RMW the same path via bare `writeBackstageFile` (no `enqueueBackstageWrite`). Concurrent resolve + recompute can clobber `resolvedIds` or the JSON body.

#### 5. formatForge “active” when enabled but not connected

`src/formatCompanionActive.ts`, `ProtectionsModal.ts`.

`isFormatCompanionActiveForSettings` is true if FF is merely enabled — intentional load-order coverage, but Themes UI is removed even when `registerCompanion` never ran. Fallback opens Obsidian settings by id; if FF failed to load, user loses SF theme transfer with no in-plugin alternative.

#### 6. Mobile compatibility was incorrectly disabled in the manifest — resolved

`README.md` says the plugin can work on mobile, but `manifest.json` had `isDesktopOnly: true`. A runtime review found no Electron, Node filesystem, shell, or desktop-only Obsidian APIs. The deferred `require()` calls load winkNLP and its web model from the esbuild bundle; they are not runtime Node dependencies. `isDesktopOnly` has been restored to `false`.

#### 7. Distinct-name preset rename is copy→write→delete

`src/settingsPresets.ts`. Case-only rename correctly uses `vault.rename`. Distinct names can leave duplicates if delete fails after write. Queue key is `newPath` only.

#### 8. `sf-use-tools-panel` applied only on main `document.body`

`src/styleController.ts`. CSS vars / scrollbar classes go to all `getStyleDocuments()`, but tools-panel body class does not. Pop-out windows miss ribbon-relocation styling. `clearAll()` removes the class from all docs — asymmetry.

### P3

- Negative day/week nets still possible (`historyMath.ts`) — likely intentional; undocumented.
- Migration still uses bare `---\norder:\n---\n` fallback (existence-guarded; dormant footgun).
- `recomputeDebouncers` map never pruned for the session.
- No PR CI for test/typecheck/contract — release workflow only.
- Residual a11y gaps: many panel rows still click-only spans without `makeAccessibleActivatable`.
- Backup uniqueness queue uses synthetic path name `${BACKUPS_FOLDER}/.settings-export-queue`.
- `RecommendationView.forceRefresh` does not early-out on `closed` after awaits (wasted NLP only).
- Right-rail background still imperfect vs left under Minimal (ongoing; CSS vars approach).

---

## Resolution — 2026-08-05 (post-audit pass)

All P1/P2 findings above are fixed:

| Finding | Status |
|---------|--------|
| 1. Cover image path join unsanitized | **Fixed** — `safeCoverFilename` / `safeCoverExtension` (`book.ts`); 9 new tests in `book.test.ts` |
| 2. Standalone Themes `importSettings` skips linked validators | **Fixed** — routes through `findInvalidLinkedSettings` before merging (`main.ts`) |
| 3. `updateSetting` lacks rollback | **Fixed** — delegates to `updateSettings`, which rolls memory back on `saveSettings` failure |
| 4. Recommend sidecar RMW without per-path queue | **Fixed** — every mutator in `recommend/cache.ts` / `recommend/decisions.ts` runs inside `enqueueBackstageWrite` |
| 5. formatForge "active" when enabled but not connected | **Fixed** — `formatCompanionState` distinguishes `enabled-not-connected`; `ProtectionsModal` keeps a fallback Themes tab with an explicit notice + "Open formatForge" button |
| 7. Distinct-name preset rename is copy→write→delete | **Fixed** — uses `vault.rename` whenever the target name is free; copy+delete only remains for the explicit-overwrite-of-a-different-preset case, where `vault.rename` would refuse the occupied target anyway |
| 8. `sf-use-tools-panel` applied only on main `document.body` | **Fixed** — applied per-document across `getStyleDocuments()`; `clearAll()` removes it from every doc too |
| Backup uniqueness queue synthetic path name (companion `api-audit-2026-08-05.md` P2) | **Fixed** — named/documented as `SETTINGS_EXPORT_UNIQUENESS_LOCK_KEY` in `backup.ts` |

**238 / 238 tests passing**, `tsc -noEmit` clean, `check:formatting-contract` clean (197 keys) after this pass. One pre-existing stress test (`formattingThemeHandoff.stress.test.ts`) needed its in-memory fake vault taught `rename()` to match the preset-rename fix above.

---

## Old `AUDIT.md` (2026-07-09) status

| Finding | Status |
|---------|--------|
| History word-count RMW race | **Fixed** — per-book v2 files + `enqueueWrite` |
| `renameChapterEntry` stale fallback | **Fixed** — `modifyBookFrontmatter` / `defaultBookContent` |
| StoryForgeView missing `onClose` | **Fixed** |
| Mid-drag re-render orphans DOM | **Fixed** — `dragLock` + skip render |
| Drag persist `void` swallows errors | **Fixed** — try/catch + Notice |
| `formatSingleLine` bare colon | **Fixed** + tested |
| Non-Latin slug collapse | **Fixed** — `\p{L}\p{N}` |
| Negative word deltas | **Still open** (P3) |
| Duplicate ordering keys silent drop | **Still open** (low risk) |
| Unbounded `recomputeDebouncers` | **Still open** (P3) |
| `initializeVaultState` not awaited | **Still open** (flash tradeoff) |
| Dead exports / tier-2 reconciliation / `collapsedSections` | **Fixed** (removed or rewritten) |
| Empty Text Style placeholders | **Fixed** |
| No pop-out support | **Fixed** |
| 26-letter guide ceiling hard throw | **Fixed** (bijective suffix) |
| Right-rail bg mismatch | **Partial** |
| `isDesktopOnly: false` / mobile claim | **Fixed** — runtime checked and manifest restored to `false` |
| Keyboard DnD / span buttons | **Partial** — drag keyboard + some helpers; not universal |
| `writeGuard` zero tests | **Fixed** (20 tests) |
| No CI | **Partial** — release only |

---

## Test coverage assessment

| Area | Coverage |
|------|----------|
| writeGuard / path traversal | Strong |
| history / concurrent writes | Strong |
| settings presets / transfer / backup listing | Strong |
| host formatting API + handoff stress | Strong |
| Pure helpers (slug, ordering, codes, titleNumbering) | Strong |
| `book.ts` mutations / cover image | **Weak** — no sanitization tests |
| `importSettings` validation | **Missing** |
| View layer / RecommendationView | Mostly untested (engine has `recommend.test.ts`) |
| `styleController` pop-out class parity | Untested |

Highest-value missing suites: cover-image sanitization and Themes import validation.

---

## Architecture notes

- **Host API v8**: batch validated linked updates; formatting always on the host object; presets under `_sf-backstage/settings-presets/{owner}/`; exports under `_sf-backup/`.
- **Twin-mode UX**: when formatForge is enabled/registered, SF hides Themes and points at FF — by design. Risk is the “enabled but not connected” gap.
- **`updateSettings` batching** is the correct persistence primitive for theme imports; standalone Themes still call unvalidated `importSettings`.
- **`enqueueBackstageWrite`**: correct per-normalized-path serialisation. Not itself a path allowlist — tasks must call guarded writers.
- **Path safety (presets/backups)**: owner folder + no nested `/` + suffix checks; backup reads use `normalizeVaultPath` before prefix check. Cover-image is the notable ungarded join.
- **XSS**: no HTML injection sinks found.
- **Mobile compatibility**: no desktop-only runtime dependency found; manifest and AGENTS now declare desktop/mobile compatibility. A real-device mobile smoke test remains advisable.
- **Contract sync**: `sync-formatting-contract.mjs` owns FF generated keys; prefer `check:formatting-contract` in CI when added.

---

## Suggested fix order

1. Sanitize cover `extension` / `cover-image` to a single safe basename (no `/`, `\`, `..`); add tests.
2. Route Themes apply through linked validators (or reuse `updateLinkedSettings` for formatting/palette keys).
3. Queue recommend sidecar writes; run a mobile-device smoke test before release.
4. Apply `sf-use-tools-panel` across `getStyleDocuments()`; add PR CI for `npm test` + contract check.
5. Roll `updateSetting` onto the same rollback primitive as `updateSettings`.
