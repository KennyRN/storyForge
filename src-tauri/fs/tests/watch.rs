use std::time::{Duration, Instant, SystemTime};
use storyforge_fs::watch::{is_watched, Batcher, SleepDetector, WATCH_MAX, WATCH_QUIET};

#[test]
fn a_burst_becomes_one_batch_after_the_quiet_period() {
    let t0 = Instant::now();
    let mut b = Batcher::new();
    assert_eq!(b.poll(t0), None);
    b.push("_story-library/aaa/ch1.md", t0);
    b.push("_story-library/aaa/ch1.md", t0 + Duration::from_millis(50)); // duplicates collapse
    b.push("Codex/Jane.md", t0 + Duration::from_millis(100));
    assert_eq!(b.poll(t0 + Duration::from_millis(100) + WATCH_QUIET - Duration::from_millis(1)), None);
    let batch = b.poll(t0 + Duration::from_millis(100) + WATCH_QUIET).unwrap();
    assert_eq!(batch.paths, vec!["Codex/Jane.md".to_string(), "_story-library/aaa/ch1.md".to_string()]);
    assert!(!batch.rescan);
    assert_eq!(b.poll(t0 + Duration::from_secs(60)), None, "a sent batch is gone");
}

#[test]
fn a_long_burst_still_flushes_at_the_ceiling() {
    let t0 = Instant::now();
    let mut b = Batcher::new();
    let mut t = t0;
    while t < t0 + WATCH_MAX {
        b.push("notes/n.md", t);
        t += Duration::from_millis(100); // never quiet for 300 ms
        if t < t0 + WATCH_MAX {
            assert_eq!(b.poll(t), None);
        }
    }
    assert_eq!(b.poll(t0 + WATCH_MAX).unwrap().paths, vec!["notes/n.md".to_string()]);
}

#[test]
fn a_rescan_signal_is_carried_in_the_batch_and_cleared_after() {
    let t0 = Instant::now();
    let mut b = Batcher::new();
    b.push_rescan(t0);
    let batch = b.poll(t0 + WATCH_QUIET).unwrap();
    assert!(batch.rescan);
    assert!(batch.paths.is_empty());
    b.push("a.md", t0 + Duration::from_secs(5));
    assert!(!b.poll(t0 + Duration::from_secs(6)).unwrap().rescan);
}

#[test]
fn backups_the_trash_and_hidden_folders_are_not_watched() {
    for p in ["_sf-backup/x.zip", "_SF-BACKUP/recovery/a/b.md", ".trash/x.md", ".obsidian/app.json", "notes/.hidden/x.md", "notes/.hidden/.y.md.icloud", ".x.md.icloud.bak", "", "..", "../x", "/abs"] {
        assert!(!is_watched(p), "{p}");
    }
    for p in ["_story-library/aaa/ch.md", "Codex/Jane.md", "notes/n.md", "_backstage/storyforge/codex.md", "elsewhere/readme.md", "_story-library/aaa/.ch.md.icloud"] {
        assert!(is_watched(p), "{p}");
    }
    let t0 = Instant::now();
    let mut b = Batcher::new();
    b.push("_sf-backup/x.zip", t0);
    assert_eq!(b.poll(t0 + Duration::from_secs(10)), None, "ignored paths never make a batch");
}

#[test]
fn sleep_is_noticed_when_the_wall_clock_outruns_the_monotonic_one() {
    let w0 = SystemTime::now();
    let m0 = Instant::now();
    let mut d = SleepDetector::new(w0, m0);
    assert!(!d.woke(w0 + Duration::from_secs(30), m0 + Duration::from_secs(30)), "ordinary time passing");
    assert!(!d.woke(w0 + Duration::from_secs(60), m0 + Duration::from_secs(57)), "a little drift");
    assert!(d.woke(w0 + Duration::from_secs(3660), m0 + Duration::from_secs(90)), "an hour of sleep");
    assert!(!d.woke(w0 + Duration::from_secs(3690), m0 + Duration::from_secs(120)));
}
