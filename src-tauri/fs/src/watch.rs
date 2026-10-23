//! Batching for the file watcher (docs/tauri-shell.md §6). Events from the operating system are
//! gathered, and sent to the window as one batch after a short settling time, so a burst of changes
//! (a sync service, a folder moved in Finder) becomes one change set. The times are constants, named
//! and tested with a fake clock: they are not classification rules.
use std::collections::BTreeSet;
use std::time::{Duration, Instant};

use crate::paths::{icloud_placeholder_target, is_hidden_path, resolve_path};

/// A batch is sent after this much quiet.
pub const WATCH_QUIET: Duration = Duration::from_millis(300);
/// ...or this long after its first event, so a long burst still flushes.
pub const WATCH_MAX: Duration = Duration::from_secs(2);
/// If the wall clock ran this much further than the monotonic clock between two looks, the Mac slept.
pub const SLEEP_GAP: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Eq, Default, serde::Serialize)]
pub struct Batch {
    pub paths: Vec<String>,
    /// Events may have been missed (the system says so, the Mac woke from sleep, the watcher restarted): rescan everything.
    pub rescan: bool,
}

/// True for a path the app watches: not inside `_sf-backup/` or `.trash/`, and not hidden.
pub fn is_watched(rel: &str) -> bool {
    let Some(p) = resolve_path(rel) else { return false };
    if p.is_empty() {
        return false;
    }
    let key = p.to_lowercase();
    if key == "_sf-backup" || key.starts_with("_sf-backup/") {
        return false;
    }
    // An iCloud stub is hidden by name but is the real file changing state, so it is watched.
    let looked_at = icloud_placeholder_target(&p).unwrap_or_else(|| p.clone());
    !is_hidden_path(&looked_at)
}

pub struct Batcher {
    pending: BTreeSet<String>,
    rescan: bool,
    first: Option<Instant>,
    last: Option<Instant>,
}

impl Default for Batcher {
    fn default() -> Self {
        Self::new()
    }
}

impl Batcher {
    pub fn new() -> Batcher {
        Batcher { pending: BTreeSet::new(), rescan: false, first: None, last: None }
    }

    fn touch(&mut self, now: Instant) {
        self.first.get_or_insert(now);
        self.last = Some(now);
    }

    /// A changed path, relative to the project root. Unwatched paths are dropped.
    pub fn push(&mut self, rel: &str, now: Instant) {
        if is_watched(rel) {
            self.pending.insert(resolve_path(rel).unwrap_or_default());
            self.touch(now);
        }
    }

    /// The system says events may have been missed.
    pub fn push_rescan(&mut self, now: Instant) {
        self.rescan = true;
        self.touch(now);
    }

    /// The batch if it is ready: quiet for `WATCH_QUIET`, or `WATCH_MAX` since its first event.
    pub fn poll(&mut self, now: Instant) -> Option<Batch> {
        let (first, last) = (self.first?, self.last?);
        if now.duration_since(last) < WATCH_QUIET && now.duration_since(first) < WATCH_MAX {
            return None;
        }
        Some(self.take())
    }

    fn take(&mut self) -> Batch {
        let batch = Batch { paths: std::mem::take(&mut self.pending).into_iter().collect(), rescan: self.rescan };
        self.rescan = false;
        self.first = None;
        self.last = None;
        batch
    }
}

/// Notices that the Mac slept: between two looks the wall clock ran further than the monotonic one
/// (which does not count sleep on macOS).
pub struct SleepDetector {
    last_wall: std::time::SystemTime,
    last_mono: Instant,
}

impl SleepDetector {
    pub fn new(wall: std::time::SystemTime, mono: Instant) -> SleepDetector {
        SleepDetector { last_wall: wall, last_mono: mono }
    }

    pub fn woke(&mut self, wall: std::time::SystemTime, mono: Instant) -> bool {
        let wall_delta = wall.duration_since(self.last_wall).unwrap_or_default();
        let mono_delta = mono.duration_since(self.last_mono);
        self.last_wall = wall;
        self.last_mono = mono;
        wall_delta.saturating_sub(mono_delta) >= SLEEP_GAP
    }
}
