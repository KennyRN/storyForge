# xForge sibling writes

storyForge owns the writing shell. Codex notes and Library manuscripts are **user-owned**.
This document is the write policy for xForge siblings that soft-depend on `storyforge.api`.

## Hard rules

1. **Never** write manuscript prose under `_sf-storylibrary/`.
2. **Never** rewrite `_sf-backstage/codex.md` directly while storyForge is loaded — use host API facades (`ensureVirtualFolder`, `createNote`, `setType`, …).
3. storyForge’s own `writeGuard` only allows `_sf-backstage/**`. Codex create/rename remain intentional exceptions inside storyForge; they must not grow into body edits by storyForge itself.
4. Sibling Codex **frontmatter** create/edit is allowed **only** when the sibling has called:

   ```ts
   api.registerCodexWriteException({
     pluginId: "timelineforge", // manifest id
     types: ["event"],
     allowFrontmatter: true,
     allowBody: false,
   });
   ```

   and only for **essential fields that plugin owns**.
5. **`allowBody` defaults to false.** Hosted timelineForge must not edit Codex note bodies; put display text in frontmatter (`description`, etc.).
6. Own plugin config stays in that plugin’s backstage (e.g. timelineForge `_tf-backstage/`), not in `_sf-backstage/` unless a future host API says otherwise.

## Who may register

| Plugin | Codex FM exception? |
|--------|---------------------|
| timelineForge | Yes — type `event`, essential date/extent/title/description keys only |
| nameForge | **No** — keep own-folder pattern |
| languageForge | **Deferred** — decide in a later LF↔SF API pass; do not pre-grant |

## Access

```ts
const sf = app.plugins.getPlugin("storyforge");
const api = sf?.api;
if (!api || api.version < 1) {
  // standalone / degraded mode
}
```

See also `docs/xforge-timelineforge-host-audit.md`.
