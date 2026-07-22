# Handoff: storyForge settings tab blank on Obsidian 1.13

## Goal

Make `StoryForgeSettingsTab` use Obsidian 1.13’s declarative settings API (`getSettingDefinitions`) so community review stops flagging deprecated `display()`, **without** a blank settings pane.

`manifest.json` has `"minAppVersion": "1.13.0"`.

## Current state (usable fallback)

Branch: `090-test`

[`src/view/StoryForgeSettingsTab.ts`](../src/view/StoryForgeSettingsTab.ts) again uses:

- `getSettingDefinitions()` → returns `[]` (forces Obsidian to call `display()`)
- `display()` → full imperative UI via `SettingGroup` (this paints correctly)

This will re-trigger lint:

- `obsidianmd/settings-tab/no-deprecated-display`
- prefer `this.update()` over `this.display()` after palette change
- TS `@deprecated` on `display`

## What already failed (blank pane)

### Attempt A — mostly `render` callbacks

Non-empty `getSettingDefinitions()` with many `render: (setting) => …` rows (and one `control` for palette mode). **Result: blank tab.**

Known parallel: [Notional commit](https://github.com/bryanbans/Notional/commit/4be975b6eed43b06613bd7e6796a9ed364588a46) — custom `render` that emptied `settingEl` never painted; they fell back to `display()`.

### Attempt B — control / action only (no `render`, no `display`)

Commit `4f1c202` on `090-test`: pure declarative defs:

- `control` for toggles / dropdowns / text / color
- `action` for reopen panel + modal openers
- `type: "group"` for Story Context
- `visible` predicates for Custom vs palette mode
- Overrides: `getControlValue` / `setControlValue` with dot-paths (`customPaletteColors.0.hex`, `codexFactSectionByType.person`) and side effects for `useToolsPanel`

**Result: still blank** (user-confirmed after reload).

So the blank is **not** explained only by broken `render` hooks.

## Likely leads for the next engine

1. **Runtime exception while indexing/rendering definitions**  
   Open DevTools when opening Settings → storyForge. Look for errors in `getSettingDefinitions`, `getControlValue`, `setControlValue`, or Obsidian’s settings renderer. A throw during tab open can leave an empty pane.

2. **`plugin.settings` / storage shape**  
   Plugin keeps real data in `pluginSettings` and mirrors with `syncObsidianSettingsRef()` → `this.settings = this.pluginSettings` in [`src/main.ts`](../src/main.ts). Confirm at open time:
   - `app.plugins.plugins.storyforge.settings` is the settings object (not `undefined`)
   - It is a plain object Obsidian can read for `control` keys
   Known class of bugs: shadowing base `SettingTab.settings` array (Homepage blank tab: `this.settings.push is not a function`). We do **not** assign `this.settings` on the **tab**; we assign `plugin.settings`. Still verify nothing clobbers SettingTab internals (`settingItems`, `renderTab`, etc.).

3. **Method name shadowing on 1.13**  
   Writing Studio blank tab: private helper named `renderTab` shadowed `SettingTab.renderTab()`. Audit subclass for collisions with new 1.13 members (`renderTab`, `settingItems`, `refreshDomState`, `update`, `getControlValue`, …).

4. **Minimal repro**  
   Replace definitions with a single control and nothing else:

   ```ts
   getSettingDefinitions() {
     return [{
       name: "Smoke test",
       control: { type: "toggle", key: "useToolsPanel" },
     }];
   }
   ```

   Delete `display()`. If still blank → problem is registration / `plugin.settings` / base-class conflict, not definition complexity. If it paints → add defs back one group at a time (palette dropdown, nested keys, actions, group).

5. **CSS false blank**  
   Check Hide-UI / [`styles.css`](../styles.css) rules (`.sf-settings-hidden`, global `display: none` on aria-labels). Unlikely if other plugins’ tabs show, but confirm the storyForge tab’s `containerEl` has children in the DOM (Inspect) vs zero-height / hidden.

6. **Imperative `SettingPage` hybrid**  
   Docs allow `{ type: "page", name: "…", page: () => new MyPage() }` where `SettingPage.display()` is imperative. Parent tab stays declarative for search; heavy UI lives on a sub-page. Only useful if root declarative paint works at all.

## Docs / API

- [Migrate to declarative settings](https://docs.obsidian.md/plugins/guides/migrate-declarative-settings)
- [Settings](https://docs.obsidian.md/Plugins/User+interface/Settings) — control vs render vs action; nested keys via `getControlValue` / `setControlValue`

## Success criteria

- Settings → storyForge shows the same controls as today’s `display()` UI (or equivalent)
- No `display()` override on `PluginSettingTab` (or only behind empty defs if dual-support — not needed at minApp 1.13)
- Palette Custom / mode visibility works via `visible` + `refreshDomState` / `update`
- Tools panel toggle still runs side effects (ribbon / leaf)
- Global settings search finds key setting names
- `npm run build` + `npm test` pass

## Do not

- Re-add `setting.settingEl.remove()` / `empty()` hacks inside `render`
- Call `this.display()` to refresh a declarative tab — use `this.update()` / `refreshDomState()`
