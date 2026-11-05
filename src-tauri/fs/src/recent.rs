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
