# formatForge ↔ storyForge formatting API

storyForge host API **version 2** adds `api.formatting` for the formatForge companion.

## Access

```ts
const sf = app.plugins.getPlugin("storyforge");
const api = sf?.api;
if (!api || api.version < 2 || !api.formatting) {
  // storyForge too old / missing
}
```

## Persistence split

| Owner | What |
|-------|------|
| **storyForge** (`data.json`) | Palette, SF chrome (library / unplaced / codex), highlights, cycling guide, scrollbar, editor **sizes** |
| **formatForge** (`data.json`) | Editor colours, fonts, small caps, heading dividers, hide H1 links |

While formatForge is registered, storyForge hides its formatting settings UI and shows a pointer to formatForge. Linked values still live in storyForge so they survive if formatForge is disabled.

## Companion registration

```ts
const unregister = api.formatting.registerCompanion({
  pluginId: "formatforge",
  version: 1,
  openSettings: () => { /* open FF settings */ },
  onHostStylesApplied: () => { /* re-apply editor CSS vars */ },
  resolveFont: (familyId, weight) => ({ family, variation }),
  registerFacesForDocument: (doc) => { /* FontFace */ },
});
```

## Key methods

- `updateLinkedSetting(key, value)` / `getLinkedSettings()` — SF-persisted formatting knobs
- `applyLinkedStyles()` — rebuild SF chrome + size vars
- `setStyleVars(vars)` — write `--sf-*` on main + pop-out docs (editor typography)
- `getPalette()` / `updatePalette(...)` — shared colour palette (stored in SF)
- `registerViewContribution({ slot, render })` — inject UI into a view slot (also on top-level `api.registerViewContribution`). Slots: `"spacer"` (blank right-rail tab), `"storyforge-panel"` (left panel; reserved)

See also `src/formattingApi.ts` and formatForge’s `docs/storyforge-formatting-api.md`.
