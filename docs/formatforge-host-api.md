# formatForge ↔ storyForge formatting API

storyForge exposes `plugin.api.formatting` as the host contract for formatForge.
Host API version 2 is the minimum formatting baseline; version 9 is the current
method surface. Callers should require v2, then detect later methods by presence.

These four numbers change independently. Do not smash them into “API v9”:

| Axis | Current | Meaning |
|---|---|---|
| Host API `STORYFORGE_API_VERSION` | **9** | Methods on the host object |
| Linked-key `STORYFORGE_FORMATTING_CONTRACT_VERSION` | **11** | Shape of the linked-key list |
| Export document `FORMATTING_EXPORT_VERSION` | **3** | Portable JSON theme file (owned by formatForge) |
| Companion `registerCompanion.version` | **1** | formatForge → storyForge callback schema |

Adding a linked key must bump the contract version, not the host API version.
Adding a host method must bump the host API version.

## Host method matrix

| Host API | Addition |
|---|---|
| v2 | Companion registration, linked settings, palette and style variables |
| v3 | Top-level companion panels; `getCompanion` |
| v4 | `saveFormattingExport` |
| v5 | `listSettingsExports` / `readSettingsExport` |
| v6 | Save/list/read named formatting presets |
| v7 | Rename/delete presets and overwrite flags |
| v8 | `updateLinkedSettings` batch validation/persistence |
| v9 | Companion `onHostDisconnect(linked)` after host style strip on unload |

`openInterfaceModal()` and `registerViewContribution()` are feature-detected
rather than tied to a version bump. A formatting-only host does not need
`registerViewContribution`.

## Shared linked-key source

The canonical key list is:

`src/hostApi.ts` → `LINKED_FORMATTING_KEYS`

`src/formattingApi.ts` derives `SfLinkedFormattingKey` directly from this array.
The sync script writes a snapshot in this repo and formatForge’s compile-time copy:

```sh
npm run sync:formatting-contract
npm run check:formatting-contract
```

`check:formatting-contract` verifies `src/hostApi.ts` against
`linked-formatting-keys.json` even when the formatForge sibling is absent.
When formatForge is present (or `FORMATFORGE_ROOT` is set), it also verifies
the generated TypeScript copy and formatForge’s copy of the JSON snapshot.
formatForge CI independently checks the generated file against that JSON.
The generated formatForge file must be committed whenever the canonical list
changes.

The current contract contains **219** keys (contract version 11).

## Persistence split

| Owner | Data |
|---|---|
| storyForge `data.json` | Palette, storyForge chrome, highlights, guides, scrollbar and editor sizes |
| formatForge `data.json` | Editor colours, fonts, small caps, dividers and H1 link styling, plus a local cache of shared palette/size/scrollbar keys |
| complete pack `settings` | One flat object: storyForge keys plus formatForge keys when the companion is connected. storyForge and formatForge each apply the keys they own and ignore the rest. |
| storyForge backstage | Named formatForge themes |
| storyForge backup folder | Dated formatting JSON archives |

## Companion lifecycle

```ts
const unregister = api.formatting.registerCompanion({
  pluginId: "formatforge",
  version: 1,
  openSettings: () => {},
  onHostStylesApplied: () => {},
  onHostDisconnect: (linked) => {},
  resolveFont: (familyId, weight) => ({ family, variation }),
  registerFacesForDocument: (doc) => {},
});
```

Only one companion is active. Registration returns an identity-safe disposer.

On host unload (API v9), storyForge snapshots linked settings, strips `--sf-*`
variables, then calls `onHostDisconnect(snapshot)` so formatForge can restyle
from its local copy immediately. Older companions ignore the unknown callback;
the 1s keepalive poll remains the fallback.

## Linked updates

Use `updateLinkedSetting` for one live control. `getLinkedSetting(key)` is
typed from the key (`bodyTextSize` is a number, override flags are booleans).

```ts
await api.formatting.updateLinkedSetting("bodyTextSize", 1.1);
```

Use the v8 batch method for themes and imports:

```ts
await api.formatting.updateLinkedSettings({
  bodyTextSize: 1.1,
  editorScrollbarThumbColor: "#112233",
  recommendHeaderColor: "#abcdef",
});
```

The batch validates every key/value before mutation, saves once and restyles
once. Invalid patches do not partially update settings.

`updatePalette` uses this same batch path at v8.

Editor sizes use the same bounds as formatForge: a finite number greater than 0
and at most 10 (`em` multipliers).

## Theme storage

storyForge owns and guards every theme path:

- `_backstage/storyforge/settings/` for named settings (themes, preferences, types & tags, complete), distinguished by a filename prefix: `thm-`, `pref-`, `tytg-`, `comp-`
- `_backstage/storyforge/settings/archived-settings/` for archived named settings
- `_backstage/storyforge/themes/` and `_backstage/storyforge/settings-presets/formatForge/` remain readable as legacy theme locations
- `_sf-backup/` for dated archives

The API supports save/list/read/rename/delete and explicit overwrite.
`listFormattingPresets` / `saveFormattingPreset` only operate on **themes**
(`thm-Name.json`). `deleteFormattingPreset` moves the file into
`archived-settings/` rather than trashing it. formatForge never writes these
vault paths itself.

## UI ownership

When formatForge is **connected** (registered as companion), removal of
storyForge's formatting transfer UI is intentional. storyForge displays an
**Open formatForge** pointer instead. When formatForge is enabled but has not
registered, storyForge keeps a fallback Themes tab so the user is not stranded.
When formatForge is absent, storyForge retains its standalone Themes fallback.

The colour palette in SeriesModal is always the storyForge live copy; formatForge
proxies reads/writes through this API while linked.

## Status of the 2026-08-05 audits

[`docs/api-audit-2026-08-05.md`](./api-audit-2026-08-05.md) and
[`docs/full-audit-2026-08-05.md`](./full-audit-2026-08-05.md) are historical.
They still mention 197 keys and several P1s that HEAD has already fixed
(mirroring of host-owned writes, disconnect restyle, local setting coercion,
capability probes, CI tests). Treat this document and the live sources as
current.

## Related files

- `src/hostApi.ts`
- `src/formattingApi.ts`
- `sync-formatting-contract.mjs`
- `linked-formatting-keys.json`
- `src/settingsPresets.ts`
- `src/backup.ts`
- formatForge `docs/storyforge-formatting-api.md`
