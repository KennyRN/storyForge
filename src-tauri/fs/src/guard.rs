//! The write guard, a pure decision over an operation. This is the Rust twin of
//! `src/core/backend/guard.ts`: both must give every row of `test/guard-spec/guard.json` its
//! expected result, unchanged (see `tests/guard_table.rs`). Rules, not behaviour, live here: the guard
//! cannot see who is calling, or what is on disk (symbolic links are `containment.rs`'s job).
use crate::paths::{fold_key, resolve_path};

pub const LIBRARY_ROOT: &str = "_story-library";
pub const CODEX_ROOT: &str = "Codex";
pub const NOTES_ROOT: &str = "notes";
pub const BACKSTAGE_ROOT: &str = "_backstage/storyforge";
pub const BACKUPS_FOLDER: &str = "_sf-backup";
pub const EXPORT_ROOT: &str = "_export";

const PROTECTED_ROOTS: [&str; 6] = [LIBRARY_ROOT, CODEX_ROOT, NOTES_ROOT, "_backstage", BACKUPS_FOLDER, EXPORT_ROOT];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuardOp {
    WriteFile(String),
    WriteBinary(String),
    CreateFile(String),
    CreateFolder(String),
    Rename { from: String, to: String },
    Retire(String),
    /// `keys`: the top-level frontmatter keys the edit changes. Codex notes allow exactly `["aliases"]`.
    FrontmatterEdit { path: String, keys: Option<Vec<String>> },
    ProseWrite(String),
    LinkRewrite(String),
    BackupCreate(String),
    RecoveryCreate(String),
    CodexRename { from: String, to: String },
}

impl GuardOp {
    /// Builds an operation from the names used in `guard.json`.
    pub fn from_spec(op: &str, path: Option<&str>, from: Option<&str>, to: Option<&str>, keys: Option<Vec<String>>) -> Result<GuardOp, String> {
        let p = || path.map(str::to_string).ok_or_else(|| format!("{op} needs a path"));
        let ft = || match (from, to) {
            (Some(f), Some(t)) => Ok((f.to_string(), t.to_string())),
            _ => Err(format!("{op} needs from and to")),
        };
        Ok(match op {
            "write-file" => GuardOp::WriteFile(p()?),
            "write-binary" => GuardOp::WriteBinary(p()?),
            "create-file" => GuardOp::CreateFile(p()?),
            "create-folder" => GuardOp::CreateFolder(p()?),
            "retire" => GuardOp::Retire(p()?),
            "frontmatter-edit" => GuardOp::FrontmatterEdit { path: p()?, keys },
            "prose-write" => GuardOp::ProseWrite(p()?),
            "link-rewrite" => GuardOp::LinkRewrite(p()?),
            "backup-create" => GuardOp::BackupCreate(p()?),
            "recovery-create" => GuardOp::RecoveryCreate(p()?),
            "rename" => {
                let (from, to) = ft()?;
                GuardOp::Rename { from, to }
            }
            "codex-rename" => {
                let (from, to) = ft()?;
                GuardOp::CodexRename { from, to }
            }
            other => return Err(format!("unknown operation {other}")),
        })
    }

    /// Every project path the operation touches.
    pub fn paths(&self) -> Vec<&str> {
        match self {
            GuardOp::Rename { from, to } | GuardOp::CodexRename { from, to } => vec![from, to],
            GuardOp::WriteFile(p)
            | GuardOp::WriteBinary(p)
            | GuardOp::CreateFile(p)
            | GuardOp::CreateFolder(p)
            | GuardOp::Retire(p)
            | GuardOp::ProseWrite(p)
            | GuardOp::LinkRewrite(p)
            | GuardOp::BackupCreate(p)
            | GuardOp::RecoveryCreate(p) => vec![p],
            GuardOp::FrontmatterEdit { path, .. } => vec![path],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Refuse(String),
}

impl Decision {
    pub fn is_allowed(&self) -> bool {
        matches!(self, Decision::Allow)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Class {
    BackstageRoot,
    Backstage,
    FlatRootFile,
    Chapter,
    CodexNote,
    LibraryRoot,
    LibraryBook,
    CodexRoot,
    NotesRoot,
    BackupRoot,
    Backup,
    Other,
}

impl Class {
    fn name(self) -> &'static str {
        match self {
            Class::BackstageRoot => "backstage-root",
            Class::Backstage => "backstage",
            Class::FlatRootFile => "flat-root-file",
            Class::Chapter => "chapter",
            Class::CodexNote => "codex-note",
            Class::LibraryRoot => "library-root",
            Class::LibraryBook => "library-book",
            Class::CodexRoot => "codex-root",
            Class::NotesRoot => "notes-root",
            Class::BackupRoot => "backup-root",
            Class::Backup => "backup",
            Class::Other => "other",
        }
    }
}

fn lower_ends_with(s: &str, suffix: &str) -> bool {
    s.to_lowercase().ends_with(suffix)
}

/// `_story-library/<book>/<name>.md`, flat.
pub fn is_library_chapter_path(p: &str) -> bool {
    let Some(rest) = p.strip_prefix("_story-library/") else { return false };
    let segments: Vec<&str> = rest.split('/').collect();
    segments.len() == 2 && lower_ends_with(segments[1], ".md")
}

/// `Codex/<name>.md`, flat.
pub fn is_codex_note_path(p: &str) -> bool {
    let Some(rest) = p.strip_prefix("Codex/") else { return false };
    !rest.is_empty() && !rest.contains('/') && lower_ends_with(rest, ".md")
}

/// A flat file at the library root with a "." in its name (`series.md`, `novel-<code>.md`).
pub fn is_library_root_file_path(p: &str) -> bool {
    let Some(rest) = p.strip_prefix("_story-library/") else { return false };
    !rest.is_empty() && !rest.contains('/') && rest.contains('.')
}

fn classify(p: &str) -> Class {
    if p == BACKSTAGE_ROOT {
        return Class::BackstageRoot;
    }
    if p.starts_with("_backstage/storyforge/") {
        return Class::Backstage;
    }
    if is_library_root_file_path(p) {
        return Class::FlatRootFile;
    }
    if is_library_chapter_path(p) {
        return Class::Chapter;
    }
    if is_codex_note_path(p) {
        return Class::CodexNote;
    }
    if p == LIBRARY_ROOT {
        return Class::LibraryRoot;
    }
    if p == CODEX_ROOT {
        return Class::CodexRoot;
    }
    if p == NOTES_ROOT {
        return Class::NotesRoot;
    }
    if p.starts_with("_story-library/") && p.split('/').count() == 2 {
        return Class::LibraryBook;
    }
    if p == BACKUPS_FOLDER {
        return Class::BackupRoot;
    }
    if p.starts_with("_sf-backup/") {
        return Class::Backup;
    }
    Class::Other
}

fn refuse(reason: impl Into<String>) -> Decision {
    Decision::Refuse(reason.into())
}

/// Reason text for a path that is refused: names the case/Unicode variant problem when that is the cause.
fn other_reason(p: &str) -> String {
    let key = fold_key(p);
    for root in PROTECTED_ROOTS {
        let r = root.to_lowercase();
        if key == r || key.starts_with(&format!("{r}/")) {
            return format!("\"{p}\" is a case or Unicode variant of the protected folder \"{root}\"");
        }
    }
    "outside every allowed root".to_string()
}

fn is_metadata(c: Class) -> bool {
    matches!(c, Class::Backstage | Class::FlatRootFile)
}

fn resolve(raw: &str) -> Option<String> {
    match resolve_path(raw) {
        Some(p) if !p.is_empty() => Some(p),
        _ => None,
    }
}

fn bad(raw: &str) -> Decision {
    refuse(format!("\"{raw}\" is not a safe relative path"))
}

pub fn check_guard(op: &GuardOp) -> Decision {
    match op {
        GuardOp::CodexRename { from, to } => {
            let Some(f) = resolve(from) else { return bad(from) };
            let Some(t) = resolve(to) else { return bad(to) };
            if is_codex_note_path(&f) && is_codex_note_path(&t) {
                Decision::Allow
            } else {
                refuse("a Codex rename is only ever Codex/<name>.md to Codex/<name>.md")
            }
        }
        GuardOp::Rename { from, to } => {
            let Some(f) = resolve(from) else { return bad(from) };
            let Some(t) = resolve(to) else { return bad(to) };
            let (cf, ct) = (classify(&f), classify(&t));
            if is_metadata(cf) && is_metadata(ct) {
                Decision::Allow
            } else if cf == Class::Other {
                refuse(other_reason(&f))
            } else if ct == Class::Other {
                refuse(other_reason(&t))
            } else {
                refuse(format!("renaming {} to {} is not allowed", cf.name(), ct.name()))
            }
        }
        GuardOp::WriteFile(path) | GuardOp::WriteBinary(path) => {
            let Some(p) = resolve(path) else { return bad(path) };
            let c = classify(&p);
            match c {
                Class::Backup => refuse("_sf-backup/ is create-only: nothing in it is ever overwritten"),
                Class::Backstage | Class::FlatRootFile => Decision::Allow,
                Class::Chapter => refuse("chapter prose is never written"),
                Class::CodexNote => refuse("Codex note bodies are never written"),
                Class::Other => refuse(other_reason(&p)),
                _ => refuse(format!("a {} is not a writable file", c.name())),
            }
        }
        GuardOp::CreateFile(path) => {
            let Some(p) = resolve(path) else { return bad(path) };
            let c = classify(&p);
            match c {
                Class::Backup => refuse("_sf-backup/ files are created only as backups or recovery files"),
                Class::Backstage | Class::FlatRootFile | Class::Chapter | Class::CodexNote => Decision::Allow,
                Class::Other => refuse(other_reason(&p)),
                _ => refuse(format!("cannot create a file at a {}", c.name())),
            }
        }
        GuardOp::CreateFolder(path) => {
            let Some(p) = resolve(path) else { return bad(path) };
            let c = classify(&p);
            match c {
                Class::BackstageRoot | Class::Backstage | Class::LibraryRoot | Class::LibraryBook | Class::CodexRoot | Class::NotesRoot | Class::BackupRoot | Class::Backup => Decision::Allow,
                Class::Other => refuse(other_reason(&p)),
                _ => refuse(format!("cannot create a folder at a {}", c.name())),
            }
        }
        GuardOp::Retire(path) => {
            let Some(p) = resolve(path) else { return bad(path) };
            let c = classify(&p);
            if is_metadata(c) {
                Decision::Allow
            } else if c == Class::Other {
                refuse(other_reason(&p))
            } else {
                refuse(format!("only backstage metadata is ever retired, not a {}", c.name()))
            }
        }
        GuardOp::ProseWrite(path) => {
            let Some(p) = resolve(path) else { return bad(path) };
            let c = classify(&p);
            match c {
                Class::Chapter | Class::CodexNote => Decision::Allow,
                Class::Other => refuse(other_reason(&p)),
                _ => refuse(format!("prose is only written to chapters and Codex notes, not a {}", c.name())),
            }
        }
        GuardOp::LinkRewrite(path) => {
            let Some(p) = resolve(path) else { return bad(path) };
            let c = classify(&p);
            let in_root = [LIBRARY_ROOT, CODEX_ROOT, NOTES_ROOT].iter().any(|r| p.starts_with(&format!("{r}/")));
            if in_root && lower_ends_with(&p, ".md") && !p.split('/').any(|x| x.starts_with('.')) {
                Decision::Allow
            } else if c == Class::Other && !in_root {
                refuse(other_reason(&p))
            } else {
                refuse("links are only rewritten in markdown files under _story-library/, Codex/ and notes/")
            }
        }
        GuardOp::BackupCreate(path) => {
            let Some(p) = resolve(path) else { return bad(path) };
            if classify(&p) == Class::Backup && p.split('/').count() == 2 && lower_ends_with(&p, ".zip") {
                Decision::Allow
            } else {
                refuse("backups are _sf-backup/<name>.zip")
            }
        }
        GuardOp::RecoveryCreate(path) => {
            let Some(p) = resolve(path) else { return bad(path) };
            if classify(&p) == Class::Backup && p.starts_with("_sf-backup/recovery/") && p.split('/').count() >= 4 && lower_ends_with(&p, ".md") {
                Decision::Allow
            } else {
                refuse("recovery files are _sf-backup/recovery/<folder>/<name>.md")
            }
        }
        GuardOp::FrontmatterEdit { path, keys } => {
            let Some(p) = resolve(path) else { return bad(path) };
            let c = classify(&p);
            if is_metadata(c) {
                return Decision::Allow;
            }
            match c {
                Class::CodexNote => match keys {
                    Some(k) if k.len() == 1 && k[0] == "aliases" => Decision::Allow,
                    _ => refuse("Codex notes allow editing the aliases key only"),
                },
                Class::Chapter => refuse("chapter frontmatter is never edited"),
                Class::Other => refuse(other_reason(&p)),
                _ => refuse(format!("cannot edit frontmatter at a {}", c.name())),
            }
        }
    }
}
