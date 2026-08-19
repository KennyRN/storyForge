# formatForge ↔ storyForge formatting API (v8)

storyForge exposes `plugin.api.formatting` as the host contract for formatForge.
Version 2 is the minimum formatting baseline; version 8 is current.

## Version matrix

| Host API | Addition |
|---|---|
| v2 | Companion registration, linked settings, palette and style variables |
| v3 | Top-level companion panels |
| v4 | `saveFormattingExport` |
| v5 | `listSettingsExports` / `readSettingsExport` |
| v6 | Save/list/read named formatting presets |
| v7 | Rename/delete presets and overwrite flags |
| v8 | `updateLinkedSettings` batch validation/persistence |

Callers should require v2, then detect later methods by presence.

## Shared linked-key source

The canonical key list is:

`src/hostApi.ts` → `LINKED_FORMATTING_KEYS`

`src/formattingApi.ts` derives `SfLinkedFormattingKey` directly from this array.
The sync script generates formatForge's compile-time copy:

```sh
npm run sync:formatting-contract
npm run check:formatting-contract
```

The generated formatForge file must be committed whenever the canonical list
changes. The current contract contains 197 keys.

## Persistence split

| Owner | Data |
|---|---|
| storyForge `data.json` | Palette, storyForge chrome, highlights, guides, scrollbar and editor sizes |
| formatForge `data.json` | Editor colours, fonts, small caps, dividers and H1 link styling |
| storyForge backstage | Named formatForge themes |
| storyForge backup folder | Dated formatting JSON archives |

## Companion lifecycle

```ts
const unregister = api.formatting.registerCompanion({
  pluginId: "formatforge",
  version: 1,
  openSettings: () => {},
  onHostStylesApplied: () => {},
  resolveFont: (familyId, weight) => ({ family, variation }),
  registerFacesForDocument: (doc) => {},
});
```

Only one companion is active. Registration returns an identity-safe disposer.

## Linked updates

Use `updateLinkedSetting` for one live control:

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

## Theme storage

storyForge owns and guards every theme path:

- `_backstage/storyforge/settings-presets/formatForge/` for named themes
- `_sf-backup/` for dated archives

The API supports save/list/read/rename/delete and explicit overwrite. formatForge
never writes these vault paths itself.

## UI ownership

When formatForge is enabled, removal of storyForge's formatting transfer UI is
intentional. storyForge displays an **Open formatForge** pointer instead.
When formatForge is absent, storyForge retains its standalone Themes fallback.

## Related files

- `src/hostApi.ts`
- `src/formattingApi.ts`
- `sync-formatting-contract.mjs`
- `src/settingsPresets.ts`
- `src/backup.ts`
- formatForge `docs/storyforge-formatting-api.md`
