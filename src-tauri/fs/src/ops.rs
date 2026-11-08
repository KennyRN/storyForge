//! The disk operations behind the Rust commands. Every mutating call: refused if the project is open
//! read-only; checked against the guard (the same table the TypeScript guard passes); kept inside the
//! project root whatever symbolic links exist; and atomic (a temp file beside the target, then a
//! rename or an exchange). Nothing here deletes the author's files: the only removals are this app's
//! own temp files, and `retire` moves a backstage file into `.trash/`.
use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::containment::ensure_inside;
use crate::error::{FsError, FsResult};
use crate::guard::{check_guard, Decision, GuardOp};
use crate::paths::{fold_key, is_hidden_path, resolve_path};
use crate::platform;

/// Folders whose markdown files `scan` reads (one list, shared with the TypeScript index: scan-spec.json).
const SCAN_SPEC: &str = include_str!("../../../test/guard-spec/scan-spec.json");

fn eager_roots() -> Vec<String> {
    #[derive(serde::Deserialize)]
    struct Spec {
        #[serde(rename = "eagerRoots")]
        eager_roots: Vec<String>,
    }
    serde_json::from_str::<Spec>(SCAN_SPEC).expect("scan-spec.json").eager_roots.into_iter().map(|r| r.to_lowercase()).collect()
}

pub fn is_eager_path(path: &str) -> bool {
    let key = fold_key(path);
    key.ends_with(".md") && !is_hidden_path(path) && eager_roots().iter().any(|r| key.starts_with(&format!("{r}/")))
}

/// A leftover temporary file, as `list_temp_leftovers` reports it.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TempLeftover {
    pub path: String,
    pub size: u64,
    #[serde(rename = "mtimeMs")]
    pub mtime_ms: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ScanEntry {
    pub path: String,
    pub kind: &'static str,
    pub size: u64,
    #[serde(rename = "mtimeMs")]
    pub mtime_ms: f64,
    /// An iCloud placeholder (`.Name.md.icloud`): the file exists but has not been downloaded.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub placeholder: bool,
    /// Markdown under storyForge's folders: its text, so opening a project is one call, not one per file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct StatInfo {
    pub kind: &'static str,
    pub size: u64,
    #[serde(rename = "mtimeMs")]
    pub mtime_ms: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct CompareOutcome {
    /// `written` or `conflict`.
    pub outcome: &'static str,
    /// Set when a writer outside the app wrote into the swapped-out file after it was verified: its
    /// bytes were kept here (a recovery file) instead of being removed.
    #[serde(rename = "lateWriteRecovery", skip_serializing_if = "Option::is_none")]
    pub late_write_recovery: Option<String>,
}

/// Test hooks: run at the two moments an outside writer could interfere.
#[derive(Default)]
pub struct Hooks {
    /// After the temp file is written, before the target is exchanged. Gets the target path.
    pub before_swap: Option<Box<dyn Fn(&Path) + Send + Sync>>,
    /// After the swapped-out file was verified, before it is removed. Gets the swapped-out file's path.
    pub after_verify: Option<Box<dyn Fn(&Path) + Send + Sync>>,
}

pub struct Project {
    root: PathBuf,
    read_only: bool,
    pub hooks: Hooks,
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn unique_suffix() -> String {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{:x}{:x}{:x}", std::process::id(), nanos, COUNTER.fetch_add(1, Ordering::Relaxed))
}

fn mtime_ms(meta: &fs::Metadata) -> f64 {
    meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}

/// Identity of a file for the "did it change under us" check.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Identity {
    #[cfg(unix)]
    dev: u64,
    #[cfg(unix)]
    ino: u64,
    size: u64,
    mtime: Option<SystemTime>,
}

fn identity(meta: &fs::Metadata) -> Identity {
    #[cfg(unix)]
    use std::os::unix::fs::MetadataExt;
    Identity {
        #[cfg(unix)]
        dev: meta.dev(),
        #[cfg(unix)]
        ino: meta.ino(),
        size: meta.len(),
        mtime: meta.modified().ok(),
    }
}

fn io_err(e: &std::io::Error, rel: &str) -> FsError {
    FsError::from_io(e, rel)
}

impl Project {
    /// `root` is the folder the user picked; it is canonicalised once, and is fixed for the life of the project.
    pub fn open(root: &Path, read_only: bool) -> FsResult<Project> {
        let root = fs::canonicalize(root).map_err(|e| io_err(&e, &root.to_string_lossy()))?;
        if !root.is_dir() {
            return Err(FsError::new("ENOTDIR", "not a folder", Some(&root.to_string_lossy())));
        }
        Ok(Project { root, read_only, hooks: Hooks::default() })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn is_read_only(&self) -> bool {
        self.read_only
    }

    fn guard(&self, op: &GuardOp, shown: &str) -> FsResult<()> {
        if self.read_only {
            return Err(FsError::new("READONLY", "this project was made by a newer storyForge and is open read-only", Some(shown)));
        }
        match check_guard(op) {
            Decision::Allow => Ok(()),
            Decision::Refuse(reason) => Err(FsError::forbidden(reason, shown)),
        }
    }

    fn inside(&self, rel: &str) -> FsResult<PathBuf> {
        ensure_inside(&self.root, rel).map_err(|m| FsError::new("EACCES", m, Some(rel)))
    }

    // ------------------------------------------------------------------------------- reads

    pub fn scan(&self, dir: Option<&str>) -> FsResult<Vec<ScanEntry>> {
        let start = match dir {
            Some(d) if !d.is_empty() => resolve_path(d).ok_or_else(|| FsError::new("EACCES", "not a safe project path", Some(d)))?,
            _ => String::new(),
        };
        let mut out = Vec::new();
        self.walk(&start, &mut out)?;
        Ok(out)
    }

    fn walk(&self, rel: &str, out: &mut Vec<ScanEntry>) -> FsResult<()> {
        let abs = if rel.is_empty() { self.root.clone() } else { self.root.join(rel) };
        let mut names: Vec<fs::DirEntry> = match fs::read_dir(&abs) {
            Ok(rd) => rd.filter_map(Result::ok).collect(),
            Err(e) if e.kind() == ErrorKind::NotFound || e.raw_os_error() == Some(20) => return Ok(()),
            Err(e) => return Err(io_err(&e, rel)),
        };
        names.sort_by_key(|e| e.file_name());
        for entry in names {
            let name = entry.file_name().to_string_lossy().to_string();
            let child = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
            let Ok(meta) = fs::symlink_metadata(entry.path()) else { continue };
            let ft = meta.file_type();
            if ft.is_symlink() {
                continue; // neither followed nor listed
            }
            if ft.is_dir() {
                out.push(ScanEntry { path: child.clone(), kind: "folder", size: 0, mtime_ms: mtime_ms(&meta), placeholder: false, text: None });
                self.walk(&child, out)?;
            } else if ft.is_file() {
                let placeholder = name.starts_with('.') && name.ends_with(".icloud") && name.len() > ".icloud".len() + 1;
                let text = if is_eager_path(&child) { fs::read(entry.path()).ok().map(|b| String::from_utf8_lossy(&b).into_owned()) } else { None };
                out.push(ScanEntry { path: child, kind: "file", size: meta.len(), mtime_ms: mtime_ms(&meta), placeholder, text });
            }
        }
        Ok(())
    }

    pub fn stat(&self, rel: &str) -> FsResult<Option<StatInfo>> {
        let abs = self.read_target(rel)?;
        match fs::symlink_metadata(&abs) {
            Ok(m) if m.file_type().is_symlink() => Ok(None),
            Ok(m) => Ok(Some(StatInfo { kind: if m.is_dir() { "folder" } else { "file" }, size: if m.is_dir() { 0 } else { m.len() }, mtime_ms: mtime_ms(&m) })),
            Err(e) if e.kind() == ErrorKind::NotFound || e.raw_os_error() == Some(20) => Ok(None),
            Err(e) => Err(io_err(&e, rel)),
        }
    }

    /// Reads follow the same containment as writes: a link that leaves the project is never read through.
    fn read_target(&self, rel: &str) -> FsResult<PathBuf> {
        resolve_path(rel).ok_or_else(|| FsError::new("EACCES", format!("not a safe project path: \"{rel}\""), Some(rel)))?;
        self.inside(rel)
    }

    /// The absolute path of an existing file or folder inside the project, to show in Finder. Checked like a
    /// read: a safe project-relative path, no link that leaves the project, and it must exist.
    pub fn reveal_target(&self, rel: &str) -> FsResult<PathBuf> {
        let abs = self.read_target(rel)?;
        fs::symlink_metadata(&abs).map_err(|e| io_err(&e, rel))?;
        Ok(abs)
    }

    pub fn read_bytes(&self, rel: &str) -> FsResult<Vec<u8>> {
        let abs = self.read_target(rel)?;
        platform::retry_sharing(|| fs::read(&abs)).map_err(|e| io_err(&e, rel))
    }

    pub fn read_text(&self, rel: &str) -> FsResult<String> {
        Ok(String::from_utf8_lossy(&self.read_bytes(rel)?).into_owned())
    }

    /// A read-only look at a file outside storyForge's own folders (the plugin's `data.json`, links
    /// in other notes). Never `_backstage/` or `_sf-backup/`.
    pub fn read_outside(&self, rel: &str) -> FsResult<String> {
        let resolved = resolve_path(rel).ok_or_else(|| FsError::new("EACCES", "not a safe project path", Some(rel)))?;
        let key = resolved.to_lowercase();
        for banned in ["_backstage", "_sf-backup"] {
            if key == banned || key.starts_with(&format!("{banned}/")) {
                return Err(FsError::forbidden(format!("{banned}/ is not readable through read_outside"), rel));
            }
        }
        self.read_text(&resolved)
    }

    // ------------------------------------------------------------------------------ writes

    fn write_atomic(&self, abs: &Path, data: &[u8], perms: Option<fs::Permissions>, rel: &str) -> FsResult<()> {
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent).map_err(|e| io_err(&e, rel))?;
        }
        let tmp = temp_beside(abs);
        let result = (|| -> std::io::Result<()> {
            let mut f = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
            f.write_all(data)?;
            f.sync_all()?;
            if let Some(p) = perms {
                fs::set_permissions(&tmp, p)?;
            }
            platform::replace_file(&tmp, abs)
        })();
        if let Err(e) = result {
            let _ = fs::remove_file(&tmp); // our own temp file
            return Err(io_err(&e, rel));
        }
        Ok(())
    }

    /// Replaces or creates a file's text. Rewriting a CRLF file with LF-only text keeps CRLF.
    /// `op` is `write-file` or `frontmatter-edit` (with the keys the edit changes).
    pub fn write_text(&self, rel: &str, text: &str, op: &str, keys: Option<Vec<String>>) -> FsResult<()> {
        let guard_op = if op == "frontmatter-edit" { GuardOp::FrontmatterEdit { path: rel.to_string(), keys } } else { GuardOp::WriteFile(rel.to_string()) };
        self.guard(&guard_op, rel)?;
        let abs = self.inside(rel)?;
        let mut out = text.to_string();
        let mut perms = None;
        if let Ok(meta) = fs::metadata(&abs) {
            perms = Some(meta.permissions());
            if !text.contains("\r\n") && text.contains('\n') {
                if let Ok(existing) = platform::retry_sharing(|| fs::read(&abs)) {
                    if let Some(i) = existing.iter().position(|b| *b == b'\n') {
                        if i > 0 && existing[i - 1] == b'\r' {
                            out = text.replace('\n', "\r\n");
                        }
                    }
                }
            }
        }
        self.write_atomic(&abs, out.as_bytes(), perms, rel)
    }

    pub fn write_binary(&self, rel: &str, data: &[u8]) -> FsResult<()> {
        self.guard(&GuardOp::WriteBinary(rel.to_string()), rel)?;
        let abs = self.inside(rel)?;
        self.write_atomic(&abs, data, None, rel)
    }

    /// Exclusive create: fails with EEXIST if `rel` exists, and never overwrites. `op` is `create-file`,
    /// `backup-create` or `recovery-create`.
    pub fn create_file(&self, op: &str, rel: &str, content: &[u8]) -> FsResult<()> {
        let guard_op = GuardOp::from_spec(op, Some(rel), None, None, None).map_err(|m| FsError::new("UNKNOWN", m, Some(rel)))?;
        if !matches!(guard_op, GuardOp::CreateFile(_) | GuardOp::BackupCreate(_) | GuardOp::RecoveryCreate(_)) {
            return Err(FsError::forbidden(format!("{op} is not a create operation"), rel));
        }
        self.guard(&guard_op, rel)?;
        let abs = self.inside(rel)?;
        self.create_excl(&abs, content, rel)
    }

    fn create_excl(&self, abs: &Path, content: &[u8], rel: &str) -> FsResult<()> {
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent).map_err(|e| io_err(&e, rel))?;
        }
        let tmp = temp_beside(abs);
        let write = (|| -> std::io::Result<()> {
            let mut f = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
            f.write_all(content)?;
            f.sync_all()
        })();
        if let Err(e) = write {
            let _ = fs::remove_file(&tmp);
            return Err(io_err(&e, rel));
        }
        let moved = link_excl(&tmp, abs);
        let _ = fs::remove_file(&tmp); // gone already after a rename; our own temp file otherwise
        moved.map_err(|e| io_err(&e, rel))
    }

    pub fn create_folder(&self, rel: &str) -> FsResult<()> {
        self.guard(&GuardOp::CreateFolder(rel.to_string()), rel)?;
        let abs = self.inside(rel)?;
        fs::create_dir_all(&abs).map_err(|e| io_err(&e, rel))
    }

    /// Compare-then-write (docs/tauri-shell.md §4). Writes `text` only if the file still holds exactly
    /// `expected`; otherwise the file is left as it is and the outcome is `conflict`. `op` is
    /// `prose-write` or `link-rewrite`.
    pub fn compare_write(&self, op: &str, rel: &str, expected: &str, text: &str) -> FsResult<CompareOutcome> {
        let guard_op = GuardOp::from_spec(op, Some(rel), None, None, None).map_err(|m| FsError::new("UNKNOWN", m, Some(rel)))?;
        if !matches!(guard_op, GuardOp::ProseWrite(_) | GuardOp::LinkRewrite(_)) {
            return Err(FsError::forbidden(format!("{op} is not a compare-then-write operation"), rel));
        }
        self.guard(&guard_op, rel)?;
        let abs = self.inside(rel)?;
        let before_meta = fs::symlink_metadata(&abs).map_err(|e| io_err(&e, rel))?;
        if !before_meta.is_file() {
            return Err(FsError::new("EISDIR", "not a file", Some(rel)));
        }
        let current = platform::retry_sharing(|| fs::read(&abs)).map_err(|e| io_err(&e, rel))?;
        if current != expected.as_bytes() {
            return Ok(CompareOutcome { outcome: "conflict", late_write_recovery: None });
        }
        let before = identity(&before_meta);

        let tmp = temp_beside(&abs);
        let write = (|| -> std::io::Result<()> {
            let mut f = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
            f.write_all(text.as_bytes())?;
            f.sync_all()?;
            fs::set_permissions(&tmp, before_meta.permissions())
        })();
        if let Err(e) = write {
            let _ = fs::remove_file(&tmp);
            return Err(io_err(&e, rel));
        }
        if let Some(h) = &self.hooks.before_swap {
            h(&abs);
        }

        match platform::swap(&tmp, &abs) {
            Ok(true) => self.after_swap(&abs, &tmp, expected, rel),
            Ok(false) => self.stat_checked_replace(&abs, &tmp, expected, &before, rel),
            Err(e) => {
                let _ = fs::remove_file(&tmp);
                Err(io_err(&e, rel))
            }
        }
    }

    /// After the exchange: `tmp` holds what was at the target. Verify it is what the caller expected.
    fn after_swap(&self, abs: &Path, tmp: &Path, expected: &str, rel: &str) -> FsResult<CompareOutcome> {
        let swapped_out = fs::read(tmp).map_err(|e| io_err(&e, rel))?;
        if swapped_out != expected.as_bytes() {
            // An outside writer got in first: put its version back.
            return match platform::swap(tmp, abs) {
                Ok(true) => {
                    let _ = fs::remove_file(tmp); // our own new text
                    Ok(CompareOutcome { outcome: "conflict", late_write_recovery: None })
                }
                Ok(false) | Err(_) => Err(FsError::new("UNKNOWN", "an outside change was detected and could not be swapped back; the outside version is kept at a temporary name beside the file", Some(rel))),
            };
        }
        let verified = fs::metadata(tmp).map(|m| identity(&m)).ok();
        if let Some(h) = &self.hooks.after_verify {
            h(tmp);
        }
        let now = fs::metadata(tmp).map(|m| identity(&m)).ok();
        if verified.is_some() && now == verified {
            let _ = fs::remove_file(tmp); // the app's own temp file: the old version, already replaced
            return Ok(CompareOutcome { outcome: "written", late_write_recovery: None });
        }
        // Something wrote into the swapped-out file after it was verified: keep it, don't remove it.
        let recovered = self.keep_late_write(tmp, abs, rel)?;
        Ok(CompareOutcome { outcome: "written", late_write_recovery: Some(recovered) })
    }

    fn keep_late_write(&self, tmp: &Path, abs: &Path, rel: &str) -> FsResult<String> {
        let base = abs.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "file".into());
        let stem = base.strip_suffix(".md").unwrap_or(&base);
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        for n in 1..10_000 {
            let suffix = if n == 1 { String::new() } else { format!(" {n}") };
            let recovery_rel = format!("_sf-backup/recovery/_late-write/{stem} {stamp}{suffix}.md");
            let guard_op = GuardOp::RecoveryCreate(recovery_rel.clone());
            self.guard(&guard_op, &recovery_rel)?;
            let target = self.inside(&recovery_rel)?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| io_err(&e, &recovery_rel))?;
            }
            match link_excl(tmp, &target) {
                Ok(()) => {
                    let _ = fs::remove_file(tmp); // the temp name; the content lives on at the recovery path
                    return Ok(recovery_rel);
                }
                Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(io_err(&e, rel)),
            }
        }
        Err(FsError::new("UNKNOWN", "no free recovery file name", Some(rel)))
    }

    /// Where the exchange is unavailable: Brief 3's check. The target's identity must be the same after
    /// the comparison as before it, then the temp file is renamed over it.
    fn stat_checked_replace(&self, abs: &Path, tmp: &Path, expected: &str, before: &Identity, rel: &str) -> FsResult<CompareOutcome> {
        if let Some(h) = &self.hooks.before_swap {
            let _ = h; // already run by the caller
        }
        // Windows (Brief 22, §3.2): there is no atomic exchange, so hold the target open with other writers denied
        // while it is compared and replaced. A program that tries to save in the gap gets a sharing violation, not a
        // lost write. If the replace cannot be done while we hold it, fall through to the plain stat-checked path.
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            if let Ok(mut held) = platform::retry_sharing(|| OpenOptions::new().read(true).share_mode(0x1 | 0x4).open(abs)) {
                let mut bytes = Vec::new();
                let read_ok = held.read_to_end(&mut bytes).is_ok();
                let identity_now = held.metadata().ok().map(|m| identity(&m));
                if !read_ok || bytes != expected.as_bytes() || identity_now.as_ref() != Some(before) {
                    let _ = fs::remove_file(tmp);
                    return Ok(CompareOutcome { outcome: "conflict", late_write_recovery: None });
                }
                if platform::replace_file(tmp, abs).is_ok() {
                    return Ok(CompareOutcome { outcome: "written", late_write_recovery: None });
                }
            }
        }
        let again = fs::read(abs).ok();
        let meta_again = fs::symlink_metadata(abs).ok().map(|m| identity(&m));
        if again.as_deref() != Some(expected.as_bytes()) || meta_again.as_ref() != Some(before) {
            let _ = fs::remove_file(tmp);
            return Ok(CompareOutcome { outcome: "conflict", late_write_recovery: None });
        }
        if let Err(e) = platform::replace_file(tmp, abs) {
            let _ = fs::remove_file(tmp);
            return Err(io_err(&e, rel));
        }
        Ok(CompareOutcome { outcome: "written", late_write_recovery: None })
    }

    /// Exclusive rename: never replaces. `op` is `rename` or `codex-rename`.
    pub fn rename(&self, op: &str, from: &str, to: &str) -> FsResult<()> {
        let guard_op = GuardOp::from_spec(op, None, Some(from), Some(to), None).map_err(|m| FsError::new("UNKNOWN", m, Some(from)))?;
        if !matches!(guard_op, GuardOp::Rename { .. } | GuardOp::CodexRename { .. }) {
            return Err(FsError::forbidden(format!("{op} is not a rename operation"), from));
        }
        self.guard(&guard_op, &format!("{from} -> {to}"))?;
        self.rename_unguarded(from, to)
    }

    fn rename_unguarded(&self, from: &str, to: &str) -> FsResult<()> {
        let src = self.inside(from)?;
        let dst = self.inside(to)?;
        let src_meta = fs::symlink_metadata(&src).map_err(|e| io_err(&e, from))?;
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent).map_err(|e| io_err(&e, to))?;
        }
        if let Ok(dst_meta) = fs::symlink_metadata(&dst) {
            let _ = &dst_meta; // compared by inode on Unix only
            #[cfg(unix)]
            let same = {
                use std::os::unix::fs::MetadataExt;
                dst_meta.ino() == src_meta.ino() && dst_meta.dev() == src_meta.dev()
            };
            #[cfg(windows)]
            let same = platform::same_path(&src, &dst);
            #[cfg(not(any(unix, windows)))]
            let same = false;
            if !same {
                return Err(FsError::new("EEXIST", format!("\"{to}\" already exists"), Some(to)));
            }
            if from == to {
                return Ok(());
            }
            // A case-only (or Unicode-only) rename on a case-insensitive file system: through a temp name.
            let hop = PathBuf::from(format!("{}.{}.hop", src.to_string_lossy(), unique_suffix()));
            fs::rename(&src, &hop).map_err(|e| io_err(&e, to))?;
            return fs::rename(&hop, &dst).map_err(|e| io_err(&e, to));
        }
        let moved = if src_meta.is_file() {
            link_excl(&src, &dst).and_then(|_| {
                // a hard link was made (or the rename happened): drop the old name if it is still there
                if src.exists() && dst.exists() && src != dst {
                    fs::remove_file(&src)
                } else {
                    Ok(())
                }
            })
        } else {
            match platform::rename_excl(&src, &dst) {
                Ok(true) => Ok(()),
                Ok(false) => fs::rename(&src, &dst),
                Err(e) => Err(e),
            }
        };
        moved.map_err(|e| io_err(&e, to))
    }

    /// The app's own leftover temporary files (`.<target>.<hex id>.tmp`) inside storyForge's folders and `_sf-backup/`:
    /// path, size and time, and nothing else. Read-only. Never follows a link, never looks in a hidden folder, and
    /// never lists `.obsidian/`, `.trash/` or any other folder (they are not in the roots).
    pub fn list_temp_leftovers(&self) -> FsResult<Vec<TempLeftover>> {
        let mut out = Vec::new();
        for root in ["_story-library", "Codex", "notes", "_backstage/storyforge", "_sf-backup"] {
            self.walk_temps(root, &mut out)?;
        }
        out.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(out)
    }

    fn walk_temps(&self, rel: &str, out: &mut Vec<TempLeftover>) -> FsResult<()> {
        let abs = self.root.join(rel);
        let Ok(rd) = fs::read_dir(&abs) else { return Ok(()) }; // a missing folder has none
        for entry in rd.filter_map(Result::ok) {
            let name = entry.file_name().to_string_lossy().to_string();
            let child = format!("{rel}/{name}");
            let Ok(meta) = fs::symlink_metadata(entry.path()) else { continue };
            let ft = meta.file_type();
            if ft.is_symlink() {
                continue; // neither followed nor listed
            }
            if ft.is_dir() {
                if !name.starts_with('.') {
                    self.walk_temps(&child, out)?;
                }
            } else if ft.is_file() && crate::guard::is_temp_name(&name) {
                out.push(TempLeftover { path: child, size: meta.len(), mtime_ms: mtime_ms(&meta) });
            }
        }
        Ok(())
    }

    /// Removes one leftover temporary file. The guard checks the name and the folder; the file must be a regular
    /// file inside the project (never a link). With `expected`, it is removed only if its size and modification time
    /// are still what they were when it was listed; otherwise `ECHANGED` and nothing is removed.
    pub fn remove_temp(&self, rel: &str, expected: Option<(u64, f64)>) -> FsResult<()> {
        self.guard(&GuardOp::TempRemove(rel.to_string()), rel)?;
        let resolved = resolve_path(rel).ok_or_else(|| FsError::new("EACCES", "not a safe project path", Some(rel)))?;
        let abs = self.inside(&resolved)?;
        let meta = fs::symlink_metadata(&abs).map_err(|e| io_err(&e, rel))?;
        if !meta.file_type().is_file() {
            return Err(FsError::forbidden("only a regular file is removed", rel));
        }
        if let Some((size, mtime)) = expected {
            if meta.len() != size || (mtime_ms(&meta) - mtime).abs() > 0.5 {
                return Err(FsError::new("ECHANGED", "the file changed since it was listed", Some(rel)));
            }
        }
        fs::remove_file(&abs).map_err(|e| io_err(&e, rel))
    }

    /// Moves a backstage file into `.trash/` inside the project, never overwriting what is there.
    pub fn retire(&self, rel: &str) -> FsResult<String> {
        self.guard(&GuardOp::Retire(rel.to_string()), rel)?;
        let resolved = resolve_path(rel).ok_or_else(|| FsError::new("EACCES", "not a safe project path", Some(rel)))?;
        let abs = self.inside(&resolved)?;
        let meta = fs::symlink_metadata(&abs).map_err(|e| io_err(&e, rel))?;
        let (dir, base) = match resolved.rfind('/') {
            Some(i) => (&resolved[..i], &resolved[i + 1..]),
            None => ("", resolved.as_str()),
        };
        let dot = if meta.is_file() { base.rfind('.').filter(|i| *i > 0) } else { None };
        let (stem, ext) = match dot {
            Some(i) => (&base[..i], &base[i..]),
            None => (base, ""),
        };
        for n in 1..10_000 {
            let name = if n == 1 { base.to_string() } else { format!("{stem} ({n}){ext}") };
            let candidate = [".trash", dir, &name].iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join("/");
            match self.rename_unguarded(&resolved, &candidate) {
                Ok(()) => return Ok(candidate),
                Err(e) if e.code == "EEXIST" => continue,
                Err(e) => return Err(e),
            }
        }
        Err(FsError::new("UNKNOWN", "no free name in .trash", Some(rel)))
    }
}

/// The largest cover image storyForge will take or show.
pub const COVER_MAX_BYTES: u64 = 10 * 1024 * 1024;
/// The accepted cover types, as the extension a cover is saved under.
pub const COVER_EXTENSIONS: [&str; 4] = ["png", "jpg", "gif", "webp"];
const BACKSTAGE_ROOT: &str = "_backstage/storyforge";
const ACCEPTED: &str = "PNG, JPEG, GIF or WebP";

/// Which image type `bytes` is, judged by its first bytes and never by a file name.
pub fn sniff_image(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some("png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("gif")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

fn is_heic(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && &bytes[4..8] == b"ftyp" && [&b"heic"[..], b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1"].contains(&&bytes[8..12])
}

/// Why `bytes` is not an acceptable cover, naming the accepted types.
pub fn cover_refusal(bytes: &[u8]) -> Option<String> {
    if bytes.len() as u64 > COVER_MAX_BYTES {
        return Some(format!("That image is larger than 10 MB. Choose a {ACCEPTED} image under 10 MB."));
    }
    if sniff_image(bytes).is_some() {
        return None;
    }
    Some(if is_heic(bytes) {
        format!("That is a HEIC image. A cover must be {ACCEPTED}: export it as a JPEG first.")
    } else {
        format!("That file is not an image storyForge can use. A cover must be {ACCEPTED}.")
    })
}

impl Project {
    /// The backstage folder that holds a cover: `{"kind":"series"}` or `{"kind":"book","code":"<book folder>"}`.
    /// The window names which cover, never a path; a book must exist in the library.
    pub fn cover_folder(&self, target: &serde_json::Value) -> FsResult<String> {
        match target.get("kind").and_then(|v| v.as_str()) {
            Some("series") => Ok(format!("{BACKSTAGE_ROOT}/_series")),
            Some("book") => {
                let code = target.get("code").and_then(|v| v.as_str()).unwrap_or("");
                let plain = !code.is_empty() && !code.contains(['/', '\\']) && !code.starts_with('.') && code != "_series" && resolve_path(code).as_deref() == Some(code);
                if !plain {
                    return Err(FsError::forbidden("not a book code", code));
                }
                let library = format!("_story-library/{code}");
                let abs = self.inside(&library)?;
                if !fs::metadata(&abs).map(|m| m.is_dir()).unwrap_or(false) {
                    return Err(FsError::new("ENOENT", "no such book", Some(code)));
                }
                Ok(format!("{BACKSTAGE_ROOT}/{code}"))
            }
            _ => Err(FsError::forbidden("a cover target is the series or a book code", "")),
        }
    }

    /// Puts `bytes` in as the target's cover. The image is checked (type by first bytes, at most 10 MB), written under
    /// a temporary name and synced; then any existing `cover.<png|jpg|gif|webp>` there is retired to `.trash/`, always,
    /// and the new image is moved into place as `cover.<ext>`, create-only. Anything that fails before the retiring
    /// leaves the old cover where it was. Returns the file name; setting `cover-image` is the caller's.
    pub fn install_cover(&self, target: &serde_json::Value, bytes: &[u8]) -> FsResult<String> {
        let folder = self.cover_folder(target)?;
        if let Some(reason) = cover_refusal(bytes) {
            return Err(FsError::forbidden(reason, &folder));
        }
        let ext = sniff_image(bytes).expect("checked above");
        let final_rel = format!("{folder}/cover.{ext}");
        self.guard(&GuardOp::CreateFile(final_rel.clone()), &final_rel)?;
        let final_abs = self.inside(&final_rel)?;
        if let Some(parent) = final_abs.parent() {
            fs::create_dir_all(parent).map_err(|e| io_err(&e, &final_rel))?;
        }
        let tmp = temp_beside(&final_abs);
        let written = (|| -> std::io::Result<()> {
            let mut f = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
            f.write_all(bytes)?;
            f.sync_all()
        })();
        if let Err(e) = written {
            let _ = fs::remove_file(&tmp);
            return Err(io_err(&e, &final_rel));
        }
        for old in COVER_EXTENSIONS {
            let rel = format!("{folder}/cover.{old}");
            let exists = self.inside(&rel).map(|abs| fs::symlink_metadata(abs).is_ok());
            match exists {
                Ok(true) => {
                    if let Err(e) = self.retire(&rel) {
                        let _ = fs::remove_file(&tmp);
                        return Err(e);
                    }
                }
                Ok(false) => {}
                Err(e) => {
                    let _ = fs::remove_file(&tmp);
                    return Err(e);
                }
            }
        }
        let moved = link_excl(&tmp, &final_abs);
        let _ = fs::remove_file(&tmp);
        moved.map_err(|e| io_err(&e, &final_rel))?;
        Ok(format!("cover.{ext}"))
    }

    /// Reads a cover image: only `cover.<png|jpg|gif|webp>` exactly, only from the target's own backstage folder,
    /// at most 10 MB.
    pub fn read_cover(&self, target: &serde_json::Value, filename: &str) -> FsResult<Vec<u8>> {
        let ok = COVER_EXTENSIONS.iter().any(|e| filename == format!("cover.{e}"));
        if !ok {
            return Err(FsError::forbidden("not a cover file name", filename));
        }
        let rel = format!("{}/{filename}", self.cover_folder(target)?);
        let abs = self.read_target(&rel)?;
        let meta = fs::symlink_metadata(&abs).map_err(|e| io_err(&e, &rel))?;
        if !meta.is_file() {
            return Err(FsError::new("ENOENT", "no such cover", Some(&rel)));
        }
        if meta.len() > COVER_MAX_BYTES {
            return Err(FsError::forbidden("that cover is larger than 10 MB", &rel));
        }
        fs::read(&abs).map_err(|e| io_err(&e, &rel))
    }
}

fn temp_beside(target: &Path) -> PathBuf {
    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    target.with_file_name(format!(".{name}.{}.tmp", unique_suffix()))
}

/// Makes `to` exist with `from`'s contents, failing with `AlreadyExists` if `to` exists. Leaves `from` in place
/// when it hard-links, moves it when it renames; callers remove a leftover temp name.
fn link_excl(from: &Path, to: &Path) -> std::io::Result<()> {
    match platform::rename_excl(from, to) {
        Ok(true) => return Ok(()),
        Ok(false) => {}
        Err(e) => return Err(e),
    }
    match fs::hard_link(from, to) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::AlreadyExists => Err(e),
        Err(_) => {
            // No hard links on this volume: an exclusive create plus copy.
            let mut src = File::open(from)?;
            let mut buf = Vec::new();
            src.read_to_end(&mut buf)?;
            let mut dst = OpenOptions::new().write(true).create_new(true).open(to)?;
            dst.write_all(&buf)?;
            dst.sync_all()
        }
    }
}

impl Project {
    /// Opens `root`, read-only if its `project.md` says it was made by a newer storyForge.
    pub fn open_checked(root: &Path) -> FsResult<Project> {
        let probe = Project::open(root, true)?;
        let newer = probe.read_text("_backstage/storyforge/project.md").map(|t| crate::format::is_newer_than_supported(&t)).unwrap_or(false);
        if newer {
            return Ok(probe);
        }
        Project::open(root, false)
    }
}

/// How long to wait for an iCloud download before giving up.
pub const DOWNLOAD_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

impl Project {
    /// Asks macOS to download one iCloud placeholder (`.Name.md.icloud` for `Name.md`) and waits for the
    /// real file to appear. One file at a time, only when the author opens it: never in bulk. Returns
    /// whether the file is now there. Elsewhere, or on failure, the file stays unavailable.
    pub fn download_placeholder(&self, rel: &str, timeout: std::time::Duration) -> FsResult<bool> {
        let resolved = resolve_path(rel).ok_or_else(|| FsError::new("EACCES", "not a safe project path", Some(rel)))?;
        if is_hidden_path(&resolved) {
            return Err(FsError::forbidden("hidden paths are not downloaded", rel));
        }
        let real = self.inside(&resolved)?;
        if real.exists() {
            return Ok(true);
        }
        let (dir, name) = match resolved.rfind('/') {
            Some(i) => (&resolved[..=i], &resolved[i + 1..]),
            None => ("", resolved.as_str()),
        };
        let stub = self.inside(&format!("{dir}.{name}.icloud"))?;
        if !stub.exists() {
            return Err(FsError::new("ENOENT", "there is no iCloud placeholder for this file", Some(rel)));
        }
        match platform::start_download(&real) {
            Ok(true) => {}
            Ok(false) => return Ok(false),
            Err(e) => return Err(FsError::new("UNKNOWN", format!("macOS could not start the download: {e}"), Some(rel))),
        }
        let started = std::time::Instant::now();
        while started.elapsed() < timeout {
            if real.exists() {
                return Ok(true);
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
        }
        Ok(false)
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Peeking at a project that is not open (Brief 16, docs/project-cards.md). Read only: nothing is written, no lock is taken, nothing is
// attached. The start screen's cards use it for a name and an image. It reads only `project.md`, `series.md`, one book's own file, and
// at most one cover image (the series' own, else the first placed book's), with `read_cover`'s exact name check and its size limit.

/// Larger than this, a `project.md` / `series.md` / novel file isn't read for a card: it is treated as unreadable.
const PEEK_TEXT_MAX_BYTES: u64 = 1024 * 1024;

impl Project {
    fn peek_text(&self, rel: &str) -> Option<String> {
        let abs = self.read_target(rel).ok()?;
        let meta = fs::symlink_metadata(&abs).ok()?;
        if !meta.is_file() || meta.len() > PEEK_TEXT_MAX_BYTES {
            return None;
        }
        self.read_text(rel).ok()
    }

    /// The first cover this target has (`cover.png`, `cover.jpg`, ...), as the file name and its bytes in base64.
    fn peek_cover(&self, target: &serde_json::Value) -> Option<serde_json::Value> {
        use base64::{engine::general_purpose::STANDARD, Engine};
        for ext in COVER_EXTENSIONS {
            let filename = format!("cover.{ext}");
            if let Ok(bytes) = self.read_cover(target, &filename) {
                return Some(serde_json::json!({ "filename": filename, "base64": STANDARD.encode(bytes) }));
            }
        }
        None
    }

    /// The book folders under `_story-library` (plain names of real folders), sorted. Display information: the window orders them.
    pub fn peek_book_folders(&self) -> Vec<String> {
        let Ok(dir) = self.read_target("_story-library") else { return vec![] };
        let Ok(entries) = fs::read_dir(&dir) else { return vec![] };
        let mut names: Vec<String> = entries
            .flatten()
            .filter(|e| fs::symlink_metadata(e.path()).map(|m| m.is_dir()).unwrap_or(false))
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| !n.starts_with('.') && n != "_series" && resolve_path(n).as_deref() == Some(n.as_str()))
            .collect();
        names.sort();
        names
    }

    /// What a card needs to know that `project.md`, `series.md` and the folder list can tell. Never fails.
    pub fn peek_summary(&self) -> serde_json::Value {
        let has_library = self.read_target("_story-library").ok().and_then(|p| fs::symlink_metadata(p).ok()).map(|m| m.is_dir()).unwrap_or(false);
        if !has_library {
            return serde_json::json!({ "exists": true, "hasLibrary": false, "projectMd": null, "seriesMd": null, "bookFolders": [], "seriesCover": null });
        }
        serde_json::json!({
            "exists": true,
            "hasLibrary": true,
            "projectMd": self.peek_text("_backstage/storyforge/project.md"),
            "seriesMd": self.peek_text("_story-library/series.md"),
            "bookFolders": self.peek_book_folders(),
            "seriesCover": self.peek_cover(&serde_json::json!({ "kind": "series" })),
        })
    }

    /// The book at `position` in the sorted folder list: its own file and its cover. `expected` is the list the window was given; the folder
    /// is listed again, and if the name at `position` is no longer the one that was listed (the folder changed in between) this is refused.
    pub fn peek_book(&self, position: usize, expected: &[String]) -> FsResult<serde_json::Value> {
        let now = self.peek_book_folders();
        let name = now.get(position).ok_or_else(|| FsError::new("ENOENT", "no such book", None))?;
        if expected.get(position) != Some(name) {
            return Err(FsError::new("CHANGED", "the books in this project changed", None));
        }
        Ok(serde_json::json!({
            "folder": name,
            "novelMd": self.peek_text(&format!("_story-library/novel-{name}.md")),
            "cover": self.peek_cover(&serde_json::json!({ "kind": "book", "code": name })),
        }))
    }
}

/// The summary for a folder by its path (the recent list's entry), whether or not it still exists. A folder that is gone, or is not a folder,
/// is "not found"; one that can't be looked at for another reason is an error (the card stays as drawn). Opens read-only.
pub fn peek_root(root: &Path) -> FsResult<serde_json::Value> {
    match fs::metadata(root) {
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(serde_json::json!({ "exists": false, "hasLibrary": false, "projectMd": null, "seriesMd": null, "bookFolders": [], "seriesCover": null })),
        Err(e) => return Err(FsError::from_io(&e, "")),
        Ok(m) if !m.is_dir() => return Ok(serde_json::json!({ "exists": false, "hasLibrary": false, "projectMd": null, "seriesMd": null, "bookFolders": [], "seriesCover": null })),
        Ok(_) => {}
    }
    Ok(Project::open(root, true)?.peek_summary())
}
