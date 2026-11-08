//! Windows only (Brief 22, §3): what the disk code does when another program has a file open, and the exclusive
//! and case-only renames. These run on the Windows runner; on the Mac the whole file is compiled out.
#![cfg(windows)]
mod common;

use std::fs::{self, OpenOptions};
use std::os::windows::fs::OpenOptionsExt;
use std::thread;
use std::time::Duration;
use storyforge_fs::containment::ensure_inside;
use storyforge_fs::ops::Project;
use tempfile::TempDir;

fn project() -> (TempDir, Project) {
    let dir = tempfile::tempdir().unwrap();
    let p = Project::open(dir.path(), false).unwrap();
    (dir, p)
}
fn put(dir: &TempDir, rel: &str, text: &str) {
    let path = dir.path().join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}
fn get(dir: &TempDir, rel: &str) -> String {
    fs::read_to_string(dir.path().join(rel)).unwrap()
}
fn temps(dir: &TempDir, rel: &str) -> Vec<String> {
    fs::read_dir(dir.path().join(rel)).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).filter(|n| n.ends_with(".tmp") || n.ends_with(".hop")).collect()
}

#[test]
fn a_rename_never_replaces_and_leaves_one_name() {
    let (dir, p) = project();
    put(&dir, "Codex/A.md", "a");
    put(&dir, "Codex/B.md", "b");
    let err = p.rename("rename", "Codex/A.md", "Codex/B.md").unwrap_err();
    assert_eq!(err.code, "EEXIST");
    assert_eq!((get(&dir, "Codex/A.md"), get(&dir, "Codex/B.md")), ("a".into(), "b".into()));
    p.rename("rename", "Codex/A.md", "Codex/C.md").unwrap();
    assert!(!dir.path().join("Codex/A.md").exists());
    assert_eq!(get(&dir, "Codex/C.md"), "a");
}

#[test]
fn a_case_only_rename_works_and_leaves_one_file() {
    let (dir, p) = project();
    put(&dir, "Codex/jane.md", "j");
    p.rename("rename", "Codex/jane.md", "Codex/Jane.md").unwrap();
    let names: Vec<String> = fs::read_dir(dir.path().join("Codex")).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
    assert_eq!(names, vec!["Jane.md".to_string()]);
    assert!(temps(&dir, "Codex").is_empty());
}

#[test]
fn a_folder_renames_exclusively_too() {
    let (dir, p) = project();
    put(&dir, "Codex/Old/x.md", "x");
    p.rename("rename", "Codex/Old", "Codex/New").unwrap();
    assert_eq!(get(&dir, "Codex/New/x.md"), "x");
    put(&dir, "Codex/Other/y.md", "y");
    assert!(p.rename("rename", "Codex/Other", "Codex/New").is_err());
    assert_eq!(get(&dir, "Codex/Other/y.md"), "y");
}

#[test]
fn a_save_waits_out_a_program_that_has_the_file_for_a_moment() {
    let (dir, p) = project();
    put(&dir, "_story-library/aaa/ch.md", "old\n");
    let path = dir.path().join("_story-library/aaa/ch.md");
    // Antivirus, the indexer or a sync client: it opens the file denying every share, then lets go.
    let holder = OpenOptions::new().read(true).share_mode(0).open(&path).unwrap();
    let release = thread::spawn(move || {
        thread::sleep(Duration::from_millis(400));
        drop(holder);
    });
    p.write_text("_story-library/aaa/ch.md", "new\n", "write-file", None).unwrap();
    release.join().unwrap();
    assert_eq!(get(&dir, "_story-library/aaa/ch.md"), "new\n");
    assert!(temps(&dir, "_story-library/aaa").is_empty());
}

#[test]
fn a_compare_write_waits_too_and_still_writes_exactly_once() {
    let (dir, p) = project();
    put(&dir, "_story-library/aaa/ch.md", "old\n");
    let path = dir.path().join("_story-library/aaa/ch.md");
    let holder = OpenOptions::new().read(true).share_mode(0).open(&path).unwrap();
    let release = thread::spawn(move || {
        thread::sleep(Duration::from_millis(400));
        drop(holder);
    });
    let out = p.compare_write("prose-write", "_story-library/aaa/ch.md", "old\n", "new\n").unwrap();
    release.join().unwrap();
    assert_eq!(out.outcome, "written");
    assert_eq!(get(&dir, "_story-library/aaa/ch.md"), "new\n");
    assert!(temps(&dir, "_story-library/aaa").is_empty());
}

#[test]
fn a_file_held_for_good_fails_the_save_and_loses_nothing() {
    let (dir, p) = project();
    put(&dir, "_story-library/aaa/ch.md", "old\n");
    let path = dir.path().join("_story-library/aaa/ch.md");
    let _holder = OpenOptions::new().read(true).share_mode(0).open(&path).unwrap();
    assert!(p.compare_write("prose-write", "_story-library/aaa/ch.md", "old\n", "new\n").is_err());
    assert!(p.write_text("_story-library/aaa/ch.md", "new\n", "write-file", None).is_err());
    drop(_holder);
    assert_eq!(get(&dir, "_story-library/aaa/ch.md"), "old\n"); // untouched
    assert!(temps(&dir, "_story-library/aaa").is_empty()); // our temp files are gone
}

#[test]
fn a_compare_write_against_a_changed_file_is_a_conflict() {
    let (dir, p) = project();
    put(&dir, "_story-library/aaa/ch.md", "outside\n");
    let out = p.compare_write("prose-write", "_story-library/aaa/ch.md", "old\n", "new\n").unwrap();
    assert_eq!(out.outcome, "conflict");
    assert_eq!(get(&dir, "_story-library/aaa/ch.md"), "outside\n");
}

#[test]
fn a_writer_cannot_get_in_while_the_compare_holds_the_file() {
    // The window is tiny, so this proves the mechanism instead: the sharing the compare asks for denies a writer.
    let (dir, _p) = project();
    put(&dir, "f.md", "x");
    let path = dir.path().join("f.md");
    let held = OpenOptions::new().read(true).share_mode(0x1 | 0x4).open(&path).unwrap();
    assert!(OpenOptions::new().write(true).open(&path).is_err(), "a writer got in beside the held file");
    assert!(OpenOptions::new().read(true).open(&path).is_ok(), "a reader should still be able to read");
    drop(held);
}

#[test]
fn a_junction_that_leaves_the_project_is_refused_like_a_symbolic_link() {
    let base = tempfile::tempdir().unwrap();
    let root = base.path().join("p");
    let outside = base.path().join("out");
    fs::create_dir_all(root.join("Codex")).unwrap();
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("secret.md"), "s").unwrap();
    common::link_dir(&outside, &root.join("escape")).unwrap();
    let root = fs::canonicalize(&root).unwrap();
    assert!(ensure_inside(&root, "escape/secret.md").is_err(), "a junction out of the project was followed");
    let p = Project::open(&root, false).unwrap();
    assert!(p.write_text("escape/new.md", "x", "write-file", None).is_err());
    assert!(!outside.join("new.md").exists());
}
