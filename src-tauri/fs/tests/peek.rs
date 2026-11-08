//! Brief 16: peeking at a project that is not open. Read only, display information, never a failure for a malformed file.
mod common;
use std::fs;
use std::path::Path;
use storyforge_fs::ops::{peek_root, Project, COVER_MAX_BYTES};
use storyforge_fs::recent::at;
use tempfile::tempdir;

const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4];

fn write(root: &Path, rel: &str, bytes: &[u8]) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, bytes).unwrap();
}

fn project(root: &Path) {
    write(root, "_story-library/series.md", b"---\nseries-title: The Lantern Cycle\norder:\n  - bbb\n  - aaa\ncover-image: cover.png\n---\n");
    write(root, "_story-library/novel-aaa.md", b"---\nbook-title-reference: \"A\"\ncover-image: cover.jpg\n---\n");
    write(root, "_story-library/novel-bbb.md", b"---\nbook-title-reference: \"B\"\n---\n");
    fs::create_dir_all(root.join("_story-library/aaa")).unwrap();
    fs::create_dir_all(root.join("_story-library/bbb")).unwrap();
    write(root, "_backstage/storyforge/project.md", b"---\nformat-version: 1\n---\n");
}

fn tree(root: &Path) -> Vec<(String, Vec<u8>)> {
    fn walk(dir: &Path, base: &Path, out: &mut Vec<(String, Vec<u8>)>) {
        let mut entries: Vec<_> = fs::read_dir(dir).unwrap().flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            let p = e.path();
            let rel = p.strip_prefix(base).unwrap().to_string_lossy().to_string();
            if p.is_dir() {
                out.push((format!("{rel}/"), vec![]));
                walk(&p, base, out);
            } else {
                out.push((rel, fs::read(&p).unwrap()));
            }
        }
    }
    let mut out = vec![];
    walk(root, root, &mut out);
    out
}

#[test]
fn an_index_is_all_the_list_gives_and_one_out_of_range_is_refused() {
    let list = vec!["/a".to_string(), "/b".to_string()];
    assert_eq!(at(&list, 1).map(String::as_str), Some("/b"));
    assert_eq!(at(&list, 2), None);
}

#[test]
fn a_missing_folder_and_a_file_are_not_found_and_a_folder_without_the_library_is_not_a_project() {
    let dir = tempdir().unwrap();
    let gone = dir.path().join("gone");
    let out = peek_root(&gone).unwrap();
    assert_eq!(out["exists"], false);
    let file = dir.path().join("a-file");
    fs::write(&file, b"x").unwrap();
    assert_eq!(peek_root(&file).unwrap()["exists"], false);
    let notes = dir.path().join("notes");
    fs::create_dir_all(&notes).unwrap();
    let out = peek_root(&notes).unwrap();
    assert_eq!((out["exists"].as_bool(), out["hasLibrary"].as_bool()), (Some(true), Some(false)));
    assert!(out["seriesMd"].is_null() && out["seriesCover"].is_null());
}

#[test]
fn the_summary_has_the_texts_the_sorted_book_folders_and_the_series_cover() {
    let dir = tempdir().unwrap();
    project(dir.path());
    write(dir.path(), "_backstage/storyforge/_series/cover.png", PNG);
    let out = peek_root(dir.path()).unwrap();
    assert_eq!(out["hasLibrary"], true);
    assert!(out["seriesMd"].as_str().unwrap().contains("The Lantern Cycle"));
    assert!(out["projectMd"].as_str().unwrap().contains("format-version"));
    assert_eq!(out["bookFolders"], serde_json::json!(["aaa", "bbb"]));
    assert_eq!(out["seriesCover"]["filename"], "cover.png");
    assert!(!out["seriesCover"]["base64"].as_str().unwrap().is_empty());
}

#[test]
fn a_cover_is_only_ever_a_cover_dot_extension_and_at_most_ten_megabytes() {
    let dir = tempdir().unwrap();
    project(dir.path());
    // A file that isn't named cover.<ext> is never returned.
    write(dir.path(), "_backstage/storyforge/_series/secret.png", PNG);
    write(dir.path(), "_backstage/storyforge/_series/cover.exe", PNG);
    assert!(peek_root(dir.path()).unwrap()["seriesCover"].is_null());
    // Too big: no cover.
    write(dir.path(), "_backstage/storyforge/_series/cover.png", &vec![0u8; COVER_MAX_BYTES as usize + 1]);
    assert!(peek_root(dir.path()).unwrap()["seriesCover"].is_null());
}

#[test]
fn malformed_or_oversized_texts_never_fail_the_peek() {
    let dir = tempdir().unwrap();
    project(dir.path());
    write(dir.path(), "_story-library/series.md", b"---\nseries-title: [unclosed\n---\n\xff\xfe");
    write(dir.path(), "_backstage/storyforge/project.md", &vec![b'x'; 2 * 1024 * 1024]);
    let out = peek_root(dir.path()).unwrap();
    assert_eq!(out["exists"], true);
    assert!(out["projectMd"].is_null()); // too large: unreadable, not an error
    assert!(out["seriesMd"].is_null() || out["seriesMd"].is_string()); // not valid UTF-8 or read as text: either way no failure
}

#[test]
fn a_book_is_found_by_its_position_with_its_file_and_cover_and_a_changed_list_is_refused() {
    let dir = tempdir().unwrap();
    project(dir.path());
    write(dir.path(), "_backstage/storyforge/aaa/cover.jpg", PNG);
    let p = Project::open(dir.path(), true).unwrap();
    let listed = p.peek_book_folders();
    assert_eq!(listed, vec!["aaa", "bbb"]);
    let b = p.peek_book(0, &listed).unwrap();
    assert_eq!(b["folder"], "aaa");
    assert!(b["novelMd"].as_str().unwrap().contains("book-title-reference"));
    assert_eq!(b["cover"]["filename"], "cover.jpg");
    assert!(p.peek_book(1, &listed).unwrap()["cover"].is_null());
    assert_eq!(p.peek_book(5, &listed).unwrap_err().code, "ENOENT");
    // The folder changes between the two calls: a book is renamed, another added before it.
    fs::rename(dir.path().join("_story-library/aaa"), dir.path().join("_story-library/aab")).unwrap();
    assert_eq!(p.peek_book(0, &listed).unwrap_err().code, "CHANGED");
    fs::create_dir_all(dir.path().join("_story-library/000")).unwrap();
    let p2 = Project::open(dir.path(), true).unwrap();
    assert_eq!(p2.peek_book(0, &["aaa".to_string(), "bbb".to_string()]).unwrap_err().code, "CHANGED");
}

#[test]
fn it_writes_nothing() {
    let dir = tempdir().unwrap();
    project(dir.path());
    write(dir.path(), "_backstage/storyforge/_series/cover.png", PNG);
    write(dir.path(), "_backstage/storyforge/aaa/cover.jpg", PNG);
    let before = tree(dir.path());
    let out = peek_root(dir.path()).unwrap();
    let p = Project::open(dir.path(), true).unwrap();
    let listed: Vec<String> = out["bookFolders"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
    for i in 0..listed.len() {
        p.peek_book(i, &listed).unwrap();
    }
    assert_eq!(tree(dir.path()), before);
}

#[cfg(unix)]
#[test]
fn a_book_folder_that_is_a_link_leaving_the_project_is_not_listed() {
    let dir = tempdir().unwrap();
    project(dir.path());
    let outside = tempdir().unwrap();
    common::link_dir(outside.path(), &dir.path().join("_story-library/escape")).unwrap();
    let out = peek_root(dir.path()).unwrap();
    assert_eq!(out["bookFolders"], serde_json::json!(["aaa", "bbb"]));
}
