//! Path rules shared with the TypeScript core (`src/core/pathRules.ts`): project paths are relative to
//! the project root and use "/"; lookups are case-insensitive and Unicode-normalised (NFC).
use unicode_normalization::UnicodeNormalization;

/// Resolves a raw path to its canonical project-relative form: backslashes become "/", empty and "."
/// segments are dropped, ".." segments are resolved, every segment is NFC-normalised. `None` for
/// anything that is not a safe relative path: absolute paths (POSIX or drive letter), NUL bytes, or
/// ".." escaping the root. `Some("")` is the root itself.
pub fn resolve_path(raw: &str) -> Option<String> {
    if raw.contains('\0') {
        return None;
    }
    let unified = raw.replace('\\', "/");
    if unified.starts_with('/') {
        return None;
    }
    let bytes = unified.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return None;
    }
    let mut out: Vec<String> = Vec::new();
    for segment in unified.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                out.pop()?;
            }
            s => out.push(s.nfc().collect()),
        }
    }
    Some(out.join("/"))
}

/// The case-insensitive, NFC lookup key for a path.
pub fn fold_key(path: &str) -> String {
    resolve_path(path).unwrap_or_else(|| path.to_string()).to_lowercase()
}

pub fn is_hidden_path(path: &str) -> bool {
    path.split('/').any(|s| s.starts_with('.'))
}

/// `.Name.md.icloud` is what macOS leaves for a file iCloud has not downloaded. Returns the real project
/// path (`Name.md`) for such a stub, or `None`. (The twin of `icloudPlaceholderTarget` in pathRules.ts.)
pub fn icloud_placeholder_target(path: &str) -> Option<String> {
    let (dir, base) = match path.rfind('/') {
        Some(i) => (&path[..=i], &path[i + 1..]),
        None => ("", path),
    };
    if !base.starts_with('.') || !base.ends_with(".icloud") || base.len() <= ".icloud".len() + 1 {
        return None;
    }
    Some(format!("{dir}{}", &base[1..base.len() - ".icloud".len()]))
}
