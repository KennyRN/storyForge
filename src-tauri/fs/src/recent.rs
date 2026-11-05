//! The recent-projects list: the last `MAX_RECENT` project folders, newest first, kept as `recent.json` in the app's data folder.
//! Plain functions over the list, so the rules are tested without a window. The list holds absolute paths and is never sent back to
//! Rust by the window: every command that uses it takes an index (decision 24).

pub const MAX_RECENT: usize = 10;

/// What `recent.json` holds, or an empty list when it is missing or unreadable.
pub fn parse(text: Option<&str>) -> Vec<String> {
    text.and_then(|t| serde_json::from_str::<Vec<String>>(t).ok()).unwrap_or_default()
}

/// `root` first, once, the rest after it, at most `MAX_RECENT`.
pub fn remember(mut list: Vec<String>, root: &str) -> Vec<String> {
    list.retain(|r| r != root);
    list.insert(0, root.to_string());
    list.truncate(MAX_RECENT);
    list
}

/// The list without its `index`th entry, or `None` when there is no such entry.
pub fn forget(mut list: Vec<String>, index: usize) -> Option<Vec<String>> {
    if index >= list.len() {
        return None;
    }
    list.remove(index);
    Some(list)
}

pub fn to_text(list: &[String]) -> String {
    serde_json::to_string(list).unwrap_or_default()
}

/// The `index`th entry, if there is one. Every command that uses the list takes an index, never a path.
pub fn at(list: &[String], index: usize) -> Option<&String> {
    list.get(index)
}

/// A folder's path as the start screen shows it: **the current user's own home folder** written as `~`, and nothing else. Only a path that is
/// the home folder, or inside it (a `/` follows it), is shortened; `/Users/Shared`, another user's folder, or a folder whose name merely starts
/// the same way (`/Users/kennyx` against home `/Users/kenny`) is shown in full. With no known home nothing is shortened. The window never works
/// this out for itself: it is told the display path (decision 24 lets it be told a path for display).
pub fn display_path(path: &str, home: Option<&str>) -> String {
    let Some(home) = home.map(|h| h.trim_end_matches('/')).filter(|h| !h.is_empty()) else { return path.to_string() };
    if path == home {
        return "~".to_string();
    }
    match path.strip_prefix(home) {
        Some(rest) if rest.starts_with('/') => format!("~{rest}"),
        _ => path.to_string(),
    }
}

/// `display_path` for every entry of the list, in the list's order.
pub fn display_paths(list: &[String], home: Option<&str>) -> Vec<String> {
    list.iter().map(|p| display_path(p, home)).collect()
}

/// The longest label the menu takes from the window.
pub const NAME_MAX_CHARS: usize = 80;

/// The folder's own name, as the menu shows it when it has nothing better.
pub fn folder_name(root: &str) -> String {
    std::path::Path::new(root).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| root.to_string())
}

fn clean_name(name: &str) -> String {
    let cleaned: String = name.chars().filter(|c| !c.is_control()).collect();
    cleaned.trim().chars().take(NAME_MAX_CHARS).collect()
}

/// The labels the window worked out for the cards, matched to the list **by position** and only if they are still for this list: the same
/// number of entries, and each entry's folder name is the one the window saw at that position. Anything else, and nothing is used (the menu
/// keeps the folders' own names). A label is a label only: control characters removed, at most `NAME_MAX_CHARS` characters, never a path.
pub fn match_names(list: &[String], given: &[(String, String)]) -> Option<Vec<String>> {
    if given.len() != list.len() {
        return None;
    }
    let mut out = Vec::with_capacity(list.len());
    for (root, (folder, name)) in list.iter().zip(given) {
        if *folder != folder_name(root) {
            return None;
        }
        let cleaned = clean_name(name);
        out.push(if cleaned.is_empty() { folder.clone() } else { cleaned });
    }
    Some(out)
}
