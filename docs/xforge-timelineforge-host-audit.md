# xForge host audit: timelineForge ↔ storyForge

**Status:** Phases 1–3 implemented in tree (2026-07-31). Phase 0 audit retained below.  
**Date:** 2026-07-31  
**Paired audit:** timelineForge `docs/xforge-host-integration.md` (same day) — see § Reconciliation below.  
**Repos audited:**

| Repo | Local path |
|------|------------|
| timelineForge | `/Users/kenny/Storytelling/400 - App Construction/Obsidian Plugins/timelineForge/timelineForge Git Clone/timelineForge` |
| storyForge | `/Users/kenny/Storytelling/400 - App Construction/Obsidian Plugins/storyForge/storyForge Git Clone/storyForge` |

---

## A. timelineForge audit (factual)

### 1. Location / version / manifest

| Field | Value |
|-------|-------|
| Plugin id | `timelineforge` |
| Display name | timelineForge |
| Version | `0.1.0` (`manifest.json`, `package.json`) |
| `minAppVersion` | `1.13.0` (matches storyForge) |
| `isDesktopOnly` | **`false`** (storyForge is `true`) |
| Author | KennyRN |
| Install dir | `<vault>/.obsidian/plugins/timelineforge/` |

### 2. Product purpose

Build story timelines from markdown the user already owns: human-date events, a chronological rail, and links back to source notes. Early-stage: primary UI is a CodeMirror left-rail overlay on one registered blank timeline note; dedicated workspace views are explicitly “later” (`AGENTS.md`, `docs/timeline-rail.md`).

### 3. Architecture

| Layer | Path | Role |
|-------|------|------|
| Entry | `src/main.ts` | `TimelineForgePlugin` (`Plugin` + `TimelineRailHost`) |
| Paths | `src/paths.ts` | `_tf-backstage` helpers |
| Backstage | `src/backstage/{ensure,defaults,calendar,timelines}.ts` | Config bootstrap / R/W |
| Time | `src/time/days.ts` | Canonical `<<days>>` |
| Calendar | `src/calendar/*` | Western-modern overlay, day-0, epochs |
| Dates | `src/date/{humanDate,humanDuration,endOrDuration}.ts` | Author date/duration parse |
| Events | `src/events/{scan,stackOrder}.ts` | Folder scan → `TimelineMarker` |
| Bounds | `src/bounds/folderBounds.ts` | Per-folder rail appearance |
| UI | `src/ui/**`, `src/ui/rail/*` | Modals + CM6 rail |
| Stack | TypeScript, Obsidian API, CM6, esbuild → `main.js`, Vitest |

### 4. Data model

**Dual storage:**

| Store | Contents |
|-------|----------|
| `_tf-backstage/` | Calendar/time truth, timeline registry, per-folder bounds + `stack-order` |
| Plugin `data.json` | UI prefs only: `dateProperty`, display format, granularity, colour palette |

**Backstage files:**

| Path | Purpose |
|------|---------|
| `_tf-backstage/time.md` | `day-unit`, `day-zero`, precision |
| `_tf-backstage/calendar.md` | Overlay + epochs |
| `_tf-backstage/timelines.md` | One vault-wide registry: `folder` + `note` (default `Timeline.md`) |
| `_tf-backstage/folders/<encoded>.md` | Per-folder bounds / colours / `stack-order` |

**Timeline page:** blank canvas note (no frontmatter/body). `ensureTimelinePageBlank` clears non-empty content. Rail mounts only when the active file is the registered path (`isRegisteredTimelineNote`).

**Events = ordinary markdown notes** under the **parent folder of the timeline page** (including subfolders). Discovery: `scanFolderEvents` — note is an event iff frontmatter has the configured date property (default `"date"`). `_tf-backstage/**` skipped.

**Event frontmatter (preserve this schema — richer than the host sketch):**

```yaml
---
date: 1066-oct-14              # required (or configured dateProperty)
end: 1066-dec-31               # optional; XOR with duration
duration: 1 year and 4 months  # optional
event: Battle of Hastings      # optional display title; else basename
description: Brief hover text  # optional; else first body paragraph
---
```

Internal placement uses half-open `<<days>>` ranges derived from vault day-0 — **not** stored in frontmatter.

**Create path:** `EventModal` writes YAML + empty body via `vault.create` into the active/story folder (`uniqueMarkdownPath`). Edits use `fileManager.processFrontMatter`.

**Codex today:** only a **folder-name shortcut** in `CreateTimelinePageModal` (`"Codex"` destination → `Codex/Timeline.md`). No Codex type, virtual folder, or storyForge API.

**Book/novel scoping:** none. One timeline registration per vault; scope = folder tree under the timeline page parent.

### 5. UI surfaces

| Surface | Notes |
|---------|-------|
| CM6 left rail | Only on registered blank timeline note |
| `EventModal` | Create/edit event |
| `BoundsModal` / `TimelineAppearanceModal` | Line start, scale, colours, guides, epochs |
| `CalendarsModal` / `TimelineSettingsModal` | Calendar + registry |
| `CreateTimelinePageModal` / `FolderSuggestModal` | Destination picker |
| Settings tab | Display format, palettes, manage buttons |
| Commands | `add-event`, `edit-calendar-line` |
| Ribbon / `registerView` | **None** |

### 6. Obsidian API / coupling

Heavy use of vault, metadataCache, `processFrontMatter`, CM6 `registerEditorExtension`, commands, settings tab. Custom icons: `tf-calendar-*` (`src/ui/icons.ts`) — **no** id containing `timeline`.

**storyForge coupling:** none at runtime. Soft affinity: shared colour palette set, docs mention sitting beside storyForge, Codex create shortcut.

### 7. Settings

`TimelineForgeSettings` in `data.json`: `dateProperty` (default `"date"`), `dateDisplayFormat`, `granularity`, palette fields. Calendar/registry/bounds live in vault markdown.

### 8. Extension points

`TimelineRailHost` facet, calendar overlay seam, configurable `dateProperty`, per-folder bounds. No public plugin API for siblings.

### 9. Tests / build / run

```bash
npm install && npm run build && npm test && npm run lint
# optional: TIMELINEFORGE_VAULT=… npm run install:vault
```

~18 vitest files covering time-code, scan, bounds, rail helpers. Release: tag = version (no `v`); CI publishes `main.js`, `manifest.json`, `styles.css`.

---

## B. Gap analysis

| Area | timelineForge today | Target host model | Gap |
|------|---------------------|-------------------|-----|
| **Event storage** | Dated notes under timeline page’s parent folder tree | Flat `Codex/<Title>.md`, type `event`, virtual folder `Timeline` | Storage + discovery rewrite; no FS folders under `Codex/` |
| **Timeline canvas** | Blank `Timeline.md` + CM6 left rail | Right-rail **ItemView** tab | Primary UI surface must move; blank Codex canvas conflicts with lore notes |
| **Config** | `_tf-backstage/` | Keep for calendar/UI; events not SoT there | Align naming with SF (`_sf-backstage/` optional later); keep TF root for v1 |
| **Codex types** | N/A | Register `event` via host | SF `CODEX_TYPES` is closed (`person`/`place`/`populace`) |
| **Virtual folder** | N/A (real `Codex/` folder only as shortcut) | Idempotent `ensureVirtualFolder({ id: "xf-timeline", name: "Timeline" })` | `createCodexFolder` always mints “New Folder”; no stable-id ensure |
| **Write policy** | TF freely creates/edits event frontmatter + body | SF: Codex create/rename OK; **body edits after create out of policy for SF**; sibling-owned types need explicit exception | Document + host-owned allowlist; TF must own event FM/body writes |
| **Right rail** | No ItemView | Own tab: Spacer → Story Context → **Timeline** → Archive | SF `ensureRightRailPanels` hardcodes three types; non-canonical SF tabs get detached/recreated |
| **Book scoping** | None | Optional `book:` like person/place | Wire to series `book-id` via host `getActiveBook` |
| **Naming / icons** | Product “timeline”; icons `tf-calendar-*` | Distinct from Story Context `sf-timeline` / “Synopsis and plot” | Prefer tab label **“Timeline”** + TF icons; never reuse `sf-timeline` |
| **Host API** | None | Versioned `plugin.api` | Must build; no safe import of SF internals |
| **Desktop** | Mobile-capable | SF desktop-only | Soft-depend: standalone stays mobile; hosted path inherits SF desktop |
| **`minAppVersion`** | `1.13.0` | Same | Aligned |
| **Multi-timeline** | One registry / vault | Book-scoped event lists possible; multi-rail later | Defer multi-timeline registry |
| **languageForge / nameForge** | Own folders/configs | Codex for events (not their pattern) | Do not copy LF/NF storage; Codex is intentional for events |

### Critical conflict to resolve in design (not a blocker for Phase 1)

Putting the blank timeline canvas at `Codex/Timeline.md` is **wrong** under the host model: Codex notes are lore entities; TF currently **wipes** that note blank. Hosted mode should **drop the blank-canvas requirement** and render the rail (or successor) inside a registered right-rail view, scanning Codex `event` notes instead of a folder tree.

Standalone mode can keep today’s blank-note + folder-scan behavior.

---

## C. Recommended timelineForge changes (prioritized)

### P0 — Preserve (do not dumb down)

1. Keep human-date / `end` / `duration` / `event` / `description` schema and `<<days>>` placement (`docs/timeline-rail.md`, `src/date/*`, `src/events/scan.ts`).
2. Keep `_tf-backstage/` for time, calendar, bounds, stack-order, UI state.
3. Keep `tf-calendar-*` icons; never register `sf-timeline`.

### P1 — Host soft-dependency seam

4. Add `src/host/storyforge.ts` (or similar): detect `app.plugins.getPlugin("storyforge")?.api`, version-check, degrade to standalone if absent/incompatible.
5. Split event discovery behind an interface:
   - **Standalone:** current `scanFolderEvents(folderTree)`.
   - **Hosted:** `listByType("event", bookId?)` → same `TimelineMarker` pipeline.
6. Split event create/edit:
   - **Hosted:** host `createNote` + TF `processFrontMatter` / body edits under documented Codex body-edit exception for type `event`.
   - Place new events into virtual folder `xf-timeline` via host; set type `event`; optional `book:` from `getActiveBook()`.

### P2 — UI for hosted mode

7. Implement a dedicated `ItemView` (e.g. `timelineforge-rail-view`) that hosts the rail UI **without** a blank markdown canvas.
8. On SF present: `api.registerRightRailView({ viewType, factory, orderHint })`; do not fight SF’s ensure loop with ad-hoc leaves.
9. Settings: when hosted, hide/disable “timeline page folder = Codex” canvas registration; show “events live in Codex → Timeline”.

### P3 — Migration (existing TF vaults)

10. One-shot or commanded migrator:
    - Notes with date property under old folder tree → ensure Codex copies/moves flat (`Codex/<Title>.md`), set type `event`, add to virtual Timeline folder, preserve FM.
    - Remap `_tf-backstage/folders/*/stack-order` paths.
    - Retire blank `Timeline.md` canvas when hosted (archive or leave orphan — product call).
11. Do **not** auto-touch `_sf-storylibrary/` or rewrite `_sf-backstage/codex.md` directly when SF is present (use host API only).

### P4 — Naming / UX

12. Right-rail tab title: **“Timeline”** (plot calendar). Story Context stays “Story Context” despite `ICON_TIMELINE`.
13. Avoid UI copy that says “continuity timeline” or reuses Story Context iconography.

### What timelineForge should **not** do

- Create real `Codex/Timeline/` directories.
- Write `_sf-backstage/codex.md` when storyForge is loaded.
- Import storyForge source modules.
- Store events only in `_tf-backstage/` or plugin `data.json`.
- Collide with `sf-timeline` icon id.

---

## D. Recommended storyForge host changes (first PR scope)

Minimal surface; versioned; no grand framework.

### D.1 API stub (Phase 1) — converged with TF audit

Expose on plugin instance, e.g. in `onload`. Prefer TF’s explicit write-exception registration over a bare `mayEditCodexBody` getter.

```ts
this.api = {
  version: 1,
  paths: {
    CODEX_ROOT: "Codex",
    LIBRARY_ROOT: "_sf-storylibrary",
    BACKSTAGE_ROOT: "_sf-backstage",
    isCodexNotePath(path: string): boolean,
    isLibraryChapterPath(path: string): boolean,
  },
  registerCodexWriteException(opt: {
    pluginId: string;
    types: string[];
    allowFrontmatter: boolean;
    allowBody?: boolean; // hosted TF: false; body never for suite default
  }): void,
  // Policy note (docs + writeGuard): Codex FM create/edit is only for registered
  // xForge plugins and only for essential owned fields. nameForge: do not register.
  // languageForge: decide in a later LF↔SF API pass — do not pre-grant.
  registerCodexType(opt: { type: string; label: string; icon: string }): void,
  ensureVirtualFolder(opt: { id: string; name: string; parentId?: string | null }): Promise<string>,
  createNote(opt: {
    name: string;
    type?: string;
    parentFolderId?: string | null;
    bookId?: string | null;
    content?: string;
  }): Promise<{ path: string }>, // thin DTO; callers resolve TFile via vault
  setType(path: string, type: string): Promise<void>,
  listByType(type: string, bookId?: string | null): Promise<Array<{
    path: string;
    name: string;
    bookIds: string[];
  }>>,
  getCodexView(bookId?: string | null): unknown,
  getActiveBook(): { folderName: string; bookId: string } | null,
  onActiveBookChange?(cb: (book: … | null) => void): () => void,
  registerRightRailView(opt: {
    viewType: string;
    factory: () => ViewCreator; // sibling already registerView'd
    orderHint: number; // Timeline between Context and Archive
    displayName: string;
    icon: string;
  }): void,
};
```

Access: `app.plugins.getPlugin("storyforge")?.api` (guard `version >= 1`).

### D.2 Concrete SF code touchpoints

| Change | Where |
|--------|-------|
| Open `CODEX_TYPES` to runtime registry (seed with person/place/populace) | `src/codex.ts` |
| `ensureVirtualFolder` by stable id (idempotent; write `folders`/`order` via `modifyBackstageFrontmatter`) | `src/codex.ts` / `codexTree.ts` |
| Thin facades wrapping `createCodexNote`, `setCodexEntryType`, `getCodexEntriesByType`, `getCodexView` | new `src/api.ts` (or `src/hostApi.ts`) |
| `getActiveBook` from `selectedNovel` + `getBookId` | `src/api.ts` + `series.ts` |
| Right-rail registry: merge registered sibling views into ensure order | `ensureRightRailPanels` in `src/main.ts` |
| Extract shared activator (user brief cited `activateRightRailView.ts` — **file does not exist today**; recommend creating it from duplicated activate helpers in `RecommendationView` / `ArchiveView`) | new `src/view/activateRightRailView.ts` |
| Docs: sibling write rules — Codex **frontmatter** create/edit only for registered xForge plugins and only essential owned fields (`allowBody: false` default); never Library prose; never raw `codex.md` from siblings; nameForge should not register; LF deferred | `docs/xforge-sibling-writes.md` + `writeGuard.ts` comment |
| UI polish note: right-rail panel background = left-rail panel background (centre editor as distinct writing surface) | `styles.css` / shell chrome (PR3 or SF polish) |

### D.3 Right-rail order (canonical)

`Spacer → Story Context → [registered orderHint…] → Archive`

Timeline registers with `orderHint` between Context and Archive.

`isRightRailOrderCanonical` must include registered sibling types or it will thrash leaves.

### D.4 Out of scope for first SF PR

- timelineForge UI itself  
- Migrating languageForge / nameForge into Codex  
- Multi-timeline / galaxyForge  
- Changing Story Context’s `ICON_TIMELINE` id (document collision only; optional rename later)

---

## E. Phased plan

### Phase 0 — Audits (this doc) ✅

### Phase 1 — storyForge API stub + right-rail registry

**PR1 (storyForge):** `api` object + `registerCodexWriteException` + `registerCodexType` + `ensureVirtualFolder` + `registerRightRailView` (registry-driven ensure/order) + paths helpers + sibling write doc. No timeline UI.

**Risks:** Obsidian leaf ordering edge cases; settings UI that iterates `CODEX_TYPES` must see runtime types.

### Phase 2 — timelineForge events → Codex `event`

**PR2 (timelineForge):** Host detection; hosted create/list/scan via API; register type `event` + ensure `xf-timeline` / “Timeline”; preserve FM schema; keep `_tf-backstage/` for calendar/bounds. Standalone path unchanged.

**Risks:** Path remaps for `stack-order`; duplicate titles under flat Codex; book scoping UX.

### Phase 3 — Right-rail Timeline tab

**PR3 (timelineForge + tiny SF follow-up if needed):** Port rail into ItemView; register with host; hosted default = right-rail; editor-window rail remains **opt-in**; no blank Codex canvas required for default path; SF chrome: match right-panel bg to left-panel bg.

**Risks:** CM6 rail assumes markdown editor host — may need DOM-based rail host for ItemView (largest engineering risk).

### Phase 4 — Optional later

- Migrators for older TF vaults  
- languageForge / nameForge Codex adoption (separate product decision)  
- galaxyForge registration patterns  
- Optional SF rename of `sf-timeline` → something like `sf-synopsis` to reduce confusion  

---

## Reconciliation with timelineForge `docs/xforge-host-integration.md`

Both sides agree on verdict, gaps (storage / virtual folder / right-rail / host API as blockers), event schema preservation, `_tf-backstage` ownership, three-PR sequence, and Do-not list. Converge as follows:

| Topic | SF audit (earlier) | TF audit | **Decision** |
|-------|--------------------|----------|--------------|
| Write policy | `policy.mayEditCodexBody(type)` | `registerCodexWriteException(...)` | **Adopt TF** + owner: **FM only**, xForge essential fields only; nameForge out; LF deferred |
| `createNote` return | `TFile` | `{ path }` | **Adopt TF** — thinner cross-plugin surface |
| `listByType` | `{ path, bookIds }` | `{ path, name }` | **Merge** — return `{ path, name, bookIds }` |
| `registerRightRailView` | `factory(leaf) => View`, optional hint | `factory → ViewCreator`, required `orderHint` + `displayName` + `icon` | **Adopt TF** — siblings `registerView` themselves; SF only ensures/orders leaves |
| Bounds re-key | Mentioned under TF changes | Called out as **High** gap (folder path → vault/book/virtual id) | **Vault-wide** bounds (owner); still re-key off FS folder path |
| Left rail when hosted | Soft-deprecate blank canvas | Keep standalone left rail; hosted default = ItemView | **Owner: B** — right-rail default; editor-window rail **opt-in** |
| Extra TF open Qs | — | Archive listing; rename Timeline folder | Rename **yes**; Archive still open |
| Path helpers on `api.paths` | Constants only | + `isCodexNotePath` / `isLibraryChapterPath` | **Adopt TF** |
| Right-rail chrome | — | — | **Note:** match right-panel bg to left-panel bg so centre editor reads as the writing surface |

Canonical durable docs: this file (SF) + TF `docs/xforge-host-integration.md`. PR1 implements the **Decision** column.

---

## API contract draft (v1) — converged

See § D.1. Event on-disk contract unchanged: flat `Codex/<Title>.md`, type `event` in `codex.md` `types`, virtual folder `xf-timeline` / display **Timeline**, TF frontmatter preserved, calendar truth in `_tf-backstage/`.

**Event note contract (hosted):**

| Concern | Rule |
|---------|------|
| Path | `Codex/<Title>.md` only (flat) |
| Type | `types[path] = "event"` in `_sf-backstage/codex.md` via host |
| Virtual folder | Stable id `xf-timeline`, display **Timeline** |
| Frontmatter | Preserve TF: `date` (or setting), optional `end` XOR `duration`, `event`, `description`; plus optional `book:` |
| Body | **Author-owned.** Hosted TF must not edit bodies (`allowBody: false`). Description lives in frontmatter. |
| UI state | `_tf-backstage/` and/or TF `data.json` — not event SoT |

---

## Risks

1. **Rail host mismatch:** CM6 extension on blank note ≠ ItemView — Phase 3 may be a re-host, not a move.
2. **Right-rail thrash:** SF currently detaches only its three types when order is wrong; adding siblings without updating `isRightRailOrderCanonical` / ensure list will break UX.
3. **Write-policy drift:** Without `registerCodexWriteException`, TF frontmatter/body edits look like a SF invariant violation.
4. **Flat Codex collisions:** Folder-nested event titles today may collide when flattened.
5. **Desktop mismatch:** Document that full xForge shell is desktop-only via SF.
6. **Icon/name confusion:** Story Context still uses `sf-timeline` internally.
7. **Bounds re-key:** Hosted mode cannot keep `_tf-backstage/folders/<fs-path>.md` as the primary key (Codex is flat).

## Product decisions (owner · 2026-07-31)

| # | Question | Decision |
|---|----------|----------|
| 1 | Hosted Timeline UI | **B — Right-rail default; editor-window rail opt-in.** When SF is present: Timeline tab in the right rail is the default surface. CM6 left rail on a blank timeline note remains available as an explicit opt-in (settings/command), not the default. Standalone (SF absent) keeps today’s editor rail. |
| 2 | Default book scope | **Universal** — omit `book:` on create; user may scope later |
| 3 | Codex write depth | **A — Frontmatter only** when hosted. Create via host `createNote` (initial YAML + empty/minimal body). Later edits only via frontmatter for TF-owned keys (`date`, `end`/`duration`, `event`, `description`). **Never** edit Codex note bodies. Hover text from `description:` FM when hosted (not first body paragraph). |
| 4 | Bounds / appearance | **Vault-wide** one plot calendar (not per-book bounds key) |
| 5 | Rename virtual Timeline folder | **Yes** — stable id `xf-timeline` must survive rename/move |

### Write-policy refinement (Q3 → API + writeGuard)

Frontmatter create/edit of Codex notes is **not** a general sibling privilege:

- Allowed **only** for xForge plugins that register via `registerCodexWriteException`, and **only** for essential fields those plugins own.
- timelineForge: type `event`, keys above, `allowFrontmatter: true`, `allowBody: false`.
- **nameForge** should **not** need this exception (own-folder pattern).
- **languageForge**: undecided — may need a similar exception later when LF↔SF Codex integration is designed; **out of scope** until that API pass. Do not pre-grant LF write access in PR1.

Document this in `api` docs and in `writeGuard.ts` (and/or `docs/xforge-sibling-writes.md`) so future agents do not treat Codex FM writes as open to any plugin.

### UI follow-up note (hosted right rail)

When implementing the Timeline right-rail tab (PR3 / SF shell polish): **match the right-panel background colour to the left-panel background**, so the centre editor reads as the distinct writing surface and left/right chrome feel like one shell. Track as a deliberate SF (or shared xForge) chrome task — not a TF calendar concern.

**Still open:** Q6 Archive listing, Q7 migrate move/copy, Q8 `_tf-backstage` nesting, Q9 multi-timeline, Q10 LF/NF Codex adoption timing (LF write exception deferred as above).

---

## Open questions for product owner

1. ~~hosted left rail~~ → **B** (right-rail default; editor rail opt-in)
2. ~~book scope~~ → **universal**
3. ~~body vs FM~~ → **A** (FM only; xForge essential tasks only; see write-policy refinement)
4. ~~bounds~~ → **vault-wide**
5. ~~rename Timeline folder~~ → **yes** (id `xf-timeline` stable)
6. Should SF Archive also list archived events, or only TF later?
7. On migration, **move** vs **copy** dated notes into Codex?
8. Should `_tf-backstage/` eventually nest under `_sf-backstage/timelineforge/`, or stay sibling-root forever?
9. One plot calendar forever, or multi-timeline later?
10. Confirm: languageForge/nameForge stay on own folders for now (Phase 4+ only)? *(nameForge: no Codex FM exception; LF: decide later)*

## What we would **not** do

- Force a naive `date`/`end-date` schema that drops TF’s `duration` / human-date / epoch model  
- Put events primarily under `_tf-backstage/` or Library  
- Let TF rewrite `codex.md` while SF is active  
- Merge timeline UI into Story Context / reuse continuity wording  
- Build a large plugin bus or shared monorepo package before the thin `api` works  
- Block Phase 1 on full rail ItemView port  

---

## First three PRs to cut

| # | Repo | Title (suggested) | Delivers |
|---|------|-------------------|----------|
| **1** | storyForge | Host API v1: Codex type/folder facade + right-rail registry | Sibling-safe registration without timeline UI |
| **2** | timelineForge | Hosted Codex `event` storage + Timeline virtual folder | Events in Codex when SF present; standalone unchanged |
| **3** | timelineForge (+ SF fixups) | Right-rail Timeline ItemView via `registerRightRailView` | Spacer → Story Context → Timeline → Archive |

After PR1, a local agent can implement PR2/PR3 against the contract above without rediscovering Codex flatness, writeGuard, or right-rail hardcoding.
