# Resolved: settings tab blank on Obsidian 1.12

**Root cause:** The blank pane was an out-of-date Obsidian app (1.12). Declarative `getSettingDefinitions()` requires 1.13; `minAppVersion` is already `1.13.0`.

**Resolution:** Pure declarative `StoryForgeSettingsTab` (no `display()` fallback), restored from commit `4f1c202` and kept as the sole path.

Earlier investigation notes below are historical only.

---

## Historical notes (pre-resolution)

### What failed when tested on 1.12

- Attempt A: `render`-heavy definitions → blank
- Attempt B: control/action-only (commit `4f1c202`) → blank on 1.12; **works on 1.13**
- Fallback `getSettingDefinitions() → []` + `display()` (commit `8f8a856`) kept settings usable on 1.12 but re-triggered deprecated-`display` lint

### Related external reports

- [Notional](https://github.com/bryanbans/Notional/commit/4be975b6eed43b06613bd7e6796a9ed364588a46): `render` + `settingEl.empty()` never painted
- Writing Studio: private `renderTab` shadowed 1.13 `SettingTab.renderTab()`
- Homepage: tab `this.settings` clobbered base class array

### Docs

- [Migrate to declarative settings](https://docs.obsidian.md/plugins/guides/migrate-declarative-settings)
- [Settings](https://docs.obsidian.md/Plugins/User+interface/Settings)
