# The write-guard table

`guard.json` is the one set of rules for what the app may write into a project folder. Two implementations must give every row its `expect`, **unchanged**: the TypeScript guard (`src/core/backend/guard.ts`, with the node-fs containment check) and the Rust guard (`src-tauri/fs/src/guard.rs`, with `containment.rs`). Existing rows are never altered; rows may be added.

## Row fields

| Field | Meaning |
|---|---|
| `id` | unique |
| `op` | `write-file`, `write-binary`, `create-file`, `create-folder`, `rename`, `retire`, `frontmatter-edit`, `prose-write`, `link-rewrite`, `backup-create`, `recovery-create`, `codex-rename` |
| `path` / `from` + `to` | project-relative; `\` is a separator |
| `keys` | `frontmatter-edit`: the top-level keys the edit changes (Codex notes allow exactly `["aliases"]`) |
| `expect` | `allow` or `refuse` |
| `reason` | why (documentation only) |
| `symlink` | optional, see below |

## `symlink` (added in Brief 4)

`"symlink": { "link": "<project path>", "target": "<target>" }`. A row with this field is about what is **on disk**, not just the path, so its verdict is the guard's decision **and** the containment check (a real-path walk: no existing component of the path may be a symbolic link that leaves the project root, dangles, or is the final component itself).

Before checking, the harness creates, in a fresh project directory, a symbolic link at `link` (parents created) pointing to:

- `"outside"`: a fresh directory outside the project;
- `"outside-missing"`: a path outside the project that does not exist (a dangling link);
- anything else: a project-relative path, created as a directory (a link that stays inside the project).

The path-only guard must still allow whatever the row allows; the containment check supplies the refusals.
