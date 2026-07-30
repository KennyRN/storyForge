# storyForge code audit & stress test

**Date:** 2026-07-30  
**Scope:** Full `src/` (~14k lines, 83 TypeScript files), `manifest.json`, `package.json`, `README.md`, vitest suite.  
**Method:** Architecture review, adversarial path probes, correctness pass against live sources, plus new automated stress/security tests (`npm test` → **168 passed**).

The previous `AUDIT.md` (2026-07-09) is **superseded**. Many of its findings are fixed or obsolete; this document is the current source of truth. A short “resolved since last audit” appendix is at the bottom.

---

## Executive summary

| Severity | Open | Fixed in this PR |
|---|---|---|
| Critical | 0 | 2 (writeGuard `..` traversal; privacy-doc false claim) |
| High | 3 | 3 (factWrites path guard; recommend sidecar rename; settings import hardening) |
| Medium | 8 | 1 (backup vault-prefix check) |
| Low / Info | several | — |

**Stress results:** 50k-word chapter × 200 Codex entries analyzed in **&lt;200ms**; 500 unique book codes; chapter codes past `zzz`; concurrent word-count writes serialized correctly; writeGuard rejects all probed escapes.

---

## 1. Critical / High — fixed this pass

### C1. writeGuard prefix check bypassed by `..` (Critical → Fixed)
**Was:** `assertBackstagePath` only checked string prefixes, so  
`_sf-backstage/../_sf-storylibrary/BOOK/ch.md` and `_sf-backstage/../Codex/Jane.md` were **ALLOWED**.  
**Fix:** `normalizeVaultPath` collapses `.`/`..`, rejects absolute paths and null bytes; asserts against the normalized path. Writers use the normalized path.  
**Tests:** `src/__tests__/writeGuard.test.ts`.

### C2. README / welcome privacy claim contradicted by Story Context (Critical → Docs fixed)
**Was:** README claimed no writes to Codex/prose. `recommend/factWrites.ts` modifies Codex note bodies on explicit Update/Acknowledge.  
**Fix:** README + welcome-note wording updated to describe the Facts-section exception accurately. Manuscript prose remains create-empty-only.

### H1. `factWrites` accepted any vault path (High → Fixed)
**Was:** Only checked that a `TFile` exists.  
**Fix:** `assertCodexNotePath` / `isCodexNotePath` — flat `Codex/<name>.md` only.  
**Tests:** `src/__tests__/factWrites.test.ts`.

### H2. Recommend cache sidecars not renamed with chapters (High → Fixed)
**Was:** `handleChapterRename` moved fingerprint sidecars but not `_sf-backstage/<book>/recommend/<file>`.  
**Fix:** `renameRecommendSidecar` + call from `reconciliation.ts`.

### H3. Settings import used raw `Object.assign` (High → Fixed)
**Was:** `importSettings(data)` merged arbitrary JSON via `Object.assign`.  
**Fix:** Reject non-objects; copy only keys present on `DEFAULT_SETTINGS` (allowlist).

### M1. Full-backup “skip dest if inside vault” used `startsWith` (Medium → Fixed)
**Was:** `/home/vault-backups` matched vault `/home/vault`.  
**Fix:** `isPathInsideVault` with resolved paths + trailing-separator check.  
**Tests:** `src/__tests__/backupPath.test.ts`.

---

## 2. Open findings (still present)

### High

#### H4. Concurrent frontmatter RMW on `novel.md` / `series.md` / `codex.md`
`history.ts` serializes wordcount writes via `enqueueWrite`. Book/series/codex frontmatter mutations still each call `processFrontMatter` independently. Overlapping drag-reorder + plot edit + archive can drop fields.  
**Also:** `writeBookSynopsis` does full-file read/modify/write and can race frontmatter writers.  
**Fix sketch:** Shared per-path write queue (same pattern as history).

#### H5. Facts section rewrite drops non-`key: value` lines
`writeFactsIntoNote` replaces the entire `## Facts` (or configured) section with serialized facts only. Freeform prose without a colon is lost; lines *with* a colon become accidental fact keys.  
**Tests document this.** Prefer a plugin-owned fenced/block region, or preserve unknown lines.

#### H6. Continuity mode serves stale recommend caches
Chapter mode uses hash freshness via `loadOrRecomputeChapterRecommend`. Continuity (`RecommendationView.loadContinuity`) reads cache and only recomputes when missing — not when `contentHash` is stale.

### Medium

#### M2. Cross-book chapter moves are no-ops in reconciliation
`handleChapterRename` returns early when `oldBook !== newBook`. Ghost order/map entries remain in the old book; new book relies on later `ensureAllChapterEntries`.

#### M3. No `vault.on("delete")` reconciliation
Deleted chapters leave stale keys in order/archive/chapters maps (UI skips via `resolveOrder`, but metadata accumulates).

#### M4. Mid-drag panel re-render can orphan drag DOM
`StoryForgeView` debounced `render()` → `container.empty()` while pointer capture is held. No drag-lock.

#### M5. `RecommendationView` post-await render after close
`onClose` sets `closed`, but `reload` / `loadContinuity` don’t re-check after awaits before `render()`.

#### M6. Synopsis textarea draft reset on reload
Any vault `modify` while editing synopsis resets `synopsisDraft` from the report.

#### M7. Unbounded analyze / continuity work on large vaults
`loadOrRecompute` always runs full `analyzeChapter` before deciding cache is fresh enough to skip the *write* — CPU is not skipped. Continuity walks every chapter.

#### M8. `resolveOrder` allows duplicate order keys to repeat members
Unlike the 2026-07-09 audit claim (“silently dropped”), duplicate keys in the order list push the same member multiple times — UI can show a chapter twice.

### Low

#### L1. `recomputeDebouncers` Map never pruned on chapter delete/rename (session leak).
#### L2. `inlineRename` `void onCommit` — failures not Notice’d.
#### L3. PoV/location display names not refreshed on Codex rename (path is; name stays stale).
#### L4. Header toggles / some list rows still mouse-only (drag handles gained keyboard a11y since last audit).
#### L5. `initializeVaultState()` still fire-and-forget — brief first-frame inconsistency possible.
#### L6. Emoji-only titles still slugify to `"book"` (Unicode letters/numbers are preserved).

### Info / intentional tradeoffs

- Node `fs` only in `backup.ts` (disclosed); desktop-only (`isDesktopOnly: true`).
- Undocumented Obsidian selectors centralized in `obsidianInternals.ts` / `tabTitles.ts`.
- Pop-out windows: styles re-applied via `window-open` + `extraDocs` (improved vs old audit).
- No network requests.

---

## 3. Stress test results

| Scenario | Result |
|---|---|
| ~50k-word chapter × 200 Codex entries (`analyzeChapter`) | Completes in &lt;200ms (budget 5s) |
| 500 sequential `nextBookFolderCode` | All unique; grows past single-letter suffix |
| Chapter codes past `zzz` | `zzz` → `aaaa` → `aaab` (no throw) |
| `resolveOrder` with 2000 members | Correct ordered/unplaced split |
| 3 parallel `recordChapterEdit` on one book | Serialized; totals = 9 words, no lost chapter |
| writeGuard traversal probes | All escapes rejected |
| Backup path-prefix siblings | Not treated as inside vault |
| factWrites non-Codex paths | Rejected |

Commands:

```bash
npm test          # 168 tests
npm run build     # tsc -noEmit + esbuild production
```

---

## 4. Architecture (current mental model)

```
User prose          → _sf-storylibrary/**/*.md   (create empty; user edits)
User lore           → Codex/*.md                 (create/rename; Facts via Story Context)
Plugin structure    → _sf-backstage/**           (writeGuard; + recommend/fingerprint sidecars)
Plugin preferences  → .obsidian/plugins/storyforge/data.json
Backups             → host folder via Node fs + fflate
```

Privileged surfaces: `writeGuard.ts`, `recommend/factWrites.ts`, `backup.ts`, `ProtectionsModal` (`@electron/remote` folder picker).

---

## 5. Recommended follow-ups (priority order)

1. Per-path write queue for `novel.md` / `series.md` / `codex.md` (+ synopsis).
2. Preserve non-fact lines (or isolate Facts in a machine-owned block).
3. Continuity cache freshness check; skip analyze when hash matches.
4. Rename/delete handlers for cross-book moves and chapter deletes (incl. recommend sidecars GC).
5. Drag-lock during reorder; `closed` checks after awaits in RecommendationView.
6. Dedupe keys inside `resolveOrder` (or reject duplicates with a Notice).

---

## Appendix — resolved since 2026-07-09 audit

| Old finding | Status |
|---|---|
| Shared wordcount RMW race | Fixed — per-book files + `enqueueWrite` |
| `renameChapterEntry` legacy `order:` fallback | Fixed — uses `defaultBookContent` |
| Duplicated DEFAULT_* in migration | Fixed — imports from series/codex |
| Non-Latin slug → always `"book"` | Fixed — `\p{L}\p{N}` (emoji-only still falls back) |
| No `onClose` on StoryForgeView | Fixed |
| Drag-reorder silent Promise rejection | Fixed — try/catch + Notice |
| No keyboard drag reorder | Partially fixed — drag handles accessible |
| Dead reconciliation/orphan APIs | Removed |
| Empty Text Style settings stubs / collapsedSections | Replaced by Obsidian 1.13+ settings UI |
| “No Node fs / isDesktopOnly false” | Obsolete — desktop-only + disclosed `fs` in backup |
| No pop-out style support | Improved — `window-open` / `extraDocs` |
| Book/chapter code hard ceiling at 26 | Fixed — bijective base-26 growth |
