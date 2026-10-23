# Fixtures

Synthetic projects in the exact 0.17 layout. **All text is invented.** Regenerate with `node test/fixtures/build.mjs`, and always commit the result.

| Folder | Purpose |
|---|---|
| `series/` | The main project: three novels (two placed, one unplaced), chapters that are placed, unplaced and archived, a Codex with virtual folders, types, an archived note and aliases, plus inert residue from every cut feature, legacy keys 0.17 can still leave, unknown keys and comments in every kind of backstage file, awkward titles, a CRLF note, files with no trailing newline, a non-ASCII note name, files outside storyForge's folders, and an ignored `.obsidian/`. |
| `empty/` | An empty project (only a hidden placeholder). |
| `pre-0.17/` | A layout older than 0.14 (`_sf-storylibrary/`, `_sf-backstage/`). Must be refused with a clear error and no writes. |

## What a static folder cannot hold

Names that differ only by case, and names stored in decomposed (NFD) Unicode, cannot be committed reliably (macOS and Windows file systems are case-insensitive and may normalise names). `test/helpers/fixtures.ts` adds them to a temp copy at test time (`addCaseCollision`, `addNfdName`); the case-collision cases are skipped on a case-insensitive file system and covered with the in-memory backend instead.

## Legacy and residue in `series/`

- `pov-path`/`pov-name`/`location-path`/`location-name` and `chapter-color` on chapters in `novel-aaa.md`
- `plot-thread`, `goal_daily`, `x-unknown-map` and an `x-entry-unknown` key; `x-unknown-note` and a comment in `series.md`
- `_backstage/titleforge/`, `story-details/`, `plot-threads.md`, `vault-tags.md`, `notes.md`, `notes/`, `settings-presets/`, `_export/`
