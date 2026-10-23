//! The real operating-system watcher feeding the batcher, on a temp folder: a write, a rename and a
//! burst each reach one batch with project-relative paths.
use notify::{RecursiveMode, Watcher};
use std::collections::BTreeSet;
use std::fs;
use std::sync::mpsc;
use std::time::{Duration, Instant};
use storyforge_fs::watch::Batcher;

fn gather(rx: &mpsc::Receiver<notify::Result<notify::Event>>, root: &std::path::Path, within: Duration) -> (BTreeSet<String>, bool) {
    let mut batcher = Batcher::new();
    let mut paths = BTreeSet::new();
    let mut rescan = false;
    let start = Instant::now();
    while start.elapsed() < within {
        if let Ok(Ok(ev)) = rx.recv_timeout(Duration::from_millis(50)) {
            let now = Instant::now();
            if ev.need_rescan() {
                batcher.push_rescan(now);
            }
            for p in &ev.paths {
                if let Ok(rel) = p.strip_prefix(root) {
                    batcher.push(&rel.to_string_lossy(), now);
                }
            }
        }
        if let Some(b) = batcher.poll(Instant::now()) {
            paths.extend(b.paths);
            rescan |= b.rescan;
            if !paths.is_empty() {
                break;
            }
        }
    }
    (paths, rescan)
}

#[test]
fn real_changes_reach_a_batch_with_project_relative_paths() {
    let dir = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(dir.path()).unwrap();
    fs::create_dir_all(root.join("_story-library/aaa")).unwrap();
    fs::create_dir_all(root.join("_sf-backup")).unwrap();
    let (tx, rx) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(tx).unwrap();
    watcher.watch(&root, RecursiveMode::Recursive).unwrap();
    std::thread::sleep(Duration::from_millis(300));

    fs::write(root.join("_story-library/aaa/ch.md"), "one").unwrap();
    fs::write(root.join("_sf-backup/x.zip"), "ignored").unwrap();
    let (paths, _) = gather(&rx, &root, Duration::from_secs(8));
    assert!(paths.contains("_story-library/aaa/ch.md"), "{paths:?}");
    assert!(!paths.iter().any(|p| p.starts_with("_sf-backup")), "{paths:?}");

    fs::rename(root.join("_story-library/aaa/ch.md"), root.join("_story-library/aaa/renamed.md")).unwrap();
    let (paths, _) = gather(&rx, &root, Duration::from_secs(8));
    assert!(paths.contains("_story-library/aaa/ch.md") && paths.contains("_story-library/aaa/renamed.md"), "a rename arrives as a disappearance and an appearance: {paths:?}");
}
