//! Keeps every write inside the project root, whatever symbolic links are on disk.
//! The Rust twin of `NodeFsBackend.assertInside`: walk the path from the root; no existing component
//! may be a symbolic link that leaves the root, dangles, or is the final component itself.
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use crate::paths::resolve_path;

/// Resolves `rel` (a project-relative path) to an absolute path under `root`, or says why not.
/// `root` must be canonical (`fs::canonicalize`) and fixed for the life of the project.
pub fn ensure_inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let resolved = resolve_path(rel).ok_or_else(|| format!("\"{rel}\" is not a safe relative path"))?;
    let parts: Vec<&str> = resolved.split('/').filter(|s| !s.is_empty()).collect();
    let mut cur = root.to_path_buf();
    for (i, part) in parts.iter().enumerate() {
        cur.push(part);
        let meta = match fs::symlink_metadata(&cur) {
            Ok(m) => m,
            // Nothing below here exists yet, so nothing below here can be a link.
            Err(e) if e.kind() == ErrorKind::NotFound || e.raw_os_error() == Some(20) => {
                for rest in &parts[i + 1..] {
                    cur.push(rest);
                }
                return Ok(cur);
            }
            Err(e) => return Err(format!("\"{rel}\": {e}")),
        };
        if !meta.file_type().is_symlink() {
            continue;
        }
        let real = fs::canonicalize(&cur).map_err(|_| format!("\"{rel}\" passes through a symbolic link that points nowhere"))?;
        if !real.starts_with(root) {
            return Err(format!("\"{rel}\" resolves outside the project"));
        }
        if i == parts.len() - 1 {
            return Err(format!("\"{rel}\" is a symbolic link"));
        }
    }
    Ok(cur)
}
