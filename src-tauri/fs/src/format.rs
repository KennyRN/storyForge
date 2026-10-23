//! The project format marker (decision 23): `format-version` in `_backstage/storyforge/project.md`.
//! A project without the file is format 0 (plain 0.17). Rust reads just this one key so it can open a
//! newer project read-only before any write is possible; the window reads the whole file.

/// The highest format this build understands.
pub const SUPPORTED_FORMAT: u64 = 1;

/// `format-version` from the frontmatter of `text`, or `None` if absent or not a whole number.
pub fn format_version(text: &str) -> Option<u64> {
    let mut lines = text.lines();
    if lines.next()?.trim_end() != "---" {
        return None;
    }
    for line in lines {
        let line = line.trim_end();
        if line == "---" {
            return None;
        }
        if let Some(rest) = line.strip_prefix("format-version:") {
            let value = rest.split('#').next().unwrap_or("").trim().trim_matches(|c| c == '"' || c == '\'');
            return value.parse::<u64>().ok();
        }
    }
    None
}

/// True when the project was made by a newer storyForge than this one.
pub fn is_newer_than_supported(text: &str) -> bool {
    format_version(text).map(|v| v > SUPPORTED_FORMAT).unwrap_or(false)
}
