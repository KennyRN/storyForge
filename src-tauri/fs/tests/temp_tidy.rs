//! `list_temp_leftovers` and `remove_temp` (docs/temp-tidy.md): the only way the window can find or remove the
//! app's own leftover temporary files.
use std::fs;
mod common;
use common::link_dir;
use storyforge_fs::ops::Project;
use tempfile::TempDir;

const ID: &str = "19f2a3b4c5d6e7f8a9b0c1d2";

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
fn exists(dir: &TempDir, rel: &str) -> bool {
    dir.path().join(rel).exists()
}

#[test]
fn lists_only_the_apps_own_temp_names_in_storyforges_folders() {
    let (dir, p) = project();
    let real = [
        format!("_story-library/aaa/.ch-a1.md.{ID}.tmp"),
        format!("Codex/.Jane.md.{ID}.tmp"),
        format!("notes/.idea.md.{ID}.tmp"),
        format!("_backstage/storyforge/.project.md.a1b2c3d4e5f6.tmp"),
        format!("_sf-backup/.20261023 - p.zip.{ID}.tmp"),
        format!("_sf-backup/recovery/aaa/.x.md.{ID}.tmp"),
    ];
    for r in &real {
        put(&dir, r, "leftover");
    }
    // decoys: never listed
    for decoy in [
        "_story-library/aaa/.DS_Store".to_string(),
        "_story-library/aaa/.Jane.md.icloud".to_string(),
        format!("_story-library/aaa/ch-a1.md.{ID}.tmp"),
        "_story-library/aaa/.ch-a1.md.zzzz.tmp".to_string(),
        format!(".obsidian/.workspace.json.{ID}.tmp"),
        format!(".trash/.a.md.{ID}.tmp"),
        format!("_export/.o.json.{ID}.tmp"),
        format!("elsewhere/.x.md.{ID}.tmp"),
        format!("_story-library/.hidden/.x.md.{ID}.tmp"),
        "_sf-backup/20261023 - p.zip".to_string(),
    ] {
        put(&dir, &decoy, "decoy");
    }
    let listed: Vec<String> = p.list_temp_leftovers().unwrap().into_iter().map(|t| t.path).collect();
    let mut expected = real.to_vec();
    expected.sort();
    assert_eq!(listed, expected);
    let one = p.list_temp_leftovers().unwrap().into_iter().find(|t| t.path.ends_with("ch-a1.md.19f2a3b4c5d6e7f8a9b0c1d2.tmp")).unwrap();
    assert_eq!(one.size, "leftover".len() as u64);
    assert!(one.mtime_ms > 0.0);
}

#[test]
fn never_follows_a_link_out_of_the_project_or_lists_one() {
    let (dir, p) = project();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join(format!(".x.md.{ID}.tmp")), "outside").unwrap();
    fs::create_dir_all(dir.path().join("_story-library")).unwrap();
    link_dir(outside.path(), &dir.path().join("_story-library/escape")).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path().join(format!(".x.md.{ID}.tmp")), dir.path().join("Codex-link.tmp")).ok();
    assert!(p.list_temp_leftovers().unwrap().is_empty());
    // and a removal through the link is refused, the outside file untouched
    let err = p.remove_temp(&format!("_story-library/escape/.x.md.{ID}.tmp"), None).unwrap_err();
    assert!(err.code == "EACCES" || err.code == "FORBIDDEN", "{err:?}");
    assert!(outside.path().join(format!(".x.md.{ID}.tmp")).exists());
}

#[test]
fn removes_one_matching_temp_and_nothing_else() {
    let (dir, p) = project();
    let t = format!("_story-library/aaa/.ch-a1.md.{ID}.tmp");
    put(&dir, &t, "partial");
    put(&dir, "_story-library/aaa/ch-a1.md", "the chapter");
    p.remove_temp(&t, None).unwrap();
    assert!(!exists(&dir, &t));
    assert!(exists(&dir, "_story-library/aaa/ch-a1.md"));
}

#[test]
fn the_guard_refuses_anything_that_is_not_a_temp_name_in_an_allowed_folder() {
    let (dir, p) = project();
    for rel in ["_story-library/aaa/ch-a1.md", "_story-library/aaa/.DS_Store", "_sf-backup/20261023 - p.zip", &format!(".obsidian/.x.md.{ID}.tmp"), &format!(".trash/.x.md.{ID}.tmp"), &format!("elsewhere/.x.md.{ID}.tmp")] {
        put(&dir, rel, "keep");
        let err = p.remove_temp(rel, None).unwrap_err();
        assert_eq!(err.code, "FORBIDDEN", "{rel}");
        assert!(exists(&dir, rel), "{rel} must still be there");
    }
}

#[test]
fn removes_only_if_size_and_time_are_unchanged_since_listed() {
    let (dir, p) = project();
    let t = format!("Codex/.Jane.md.{ID}.tmp");
    put(&dir, &t, "one");
    let listed = p.list_temp_leftovers().unwrap().remove(0);
    put(&dir, &t, "one and more"); // written to again after it was listed
    let err = p.remove_temp(&t, Some((listed.size, listed.mtime_ms))).unwrap_err();
    assert_eq!(err.code, "ECHANGED");
    assert!(exists(&dir, &t));
    let now = p.list_temp_leftovers().unwrap().remove(0);
    p.remove_temp(&t, Some((now.size, now.mtime_ms))).unwrap();
    assert!(!exists(&dir, &t));
}

#[test]
fn a_directory_with_a_temp_name_is_not_removed() {
    let (dir, p) = project();
    let t = format!("notes/.d.md.{ID}.tmp");
    fs::create_dir_all(dir.path().join(&t)).unwrap();
    assert!(p.remove_temp(&t, None).is_err());
    assert!(exists(&dir, &t));
}

#[test]
fn a_read_only_project_removes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let t = format!("notes/.i.md.{ID}.tmp");
    put(&dir, &t, "x");
    let p = Project::open(dir.path(), true).unwrap();
    assert_eq!(p.remove_temp(&t, None).unwrap_err().code, "READONLY");
    assert!(exists(&dir, &t));
}
