use std::fs;
use std::path::Path;
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
fn leftovers(dir: &Path) -> Vec<String> {
    let mut out = vec![];
    fn walk(d: &Path, out: &mut Vec<String>) {
        for e in fs::read_dir(d).unwrap().flatten() {
            let p = e.path();
            if p.file_name().unwrap().to_string_lossy().ends_with(".tmp") || p.to_string_lossy().ends_with(".hop") {
                out.push(p.to_string_lossy().to_string());
            }
            if p.is_dir() {
                walk(&p, out);
            }
        }
    }
    walk(dir, &mut out);
    out
}

#[test]
fn scan_lists_everything_once_with_text_only_for_eager_markdown() {
    let (dir, p) = project();
    put(&dir, "_story-library/aaa/ch.md", "chapter");
    put(&dir, "Codex/Jane.md", "jane");
    put(&dir, "elsewhere/readme.md", "outside");
    put(&dir, ".obsidian/app.json", "{}");
    put(&dir, "_story-library/aaa/.ch2.md.icloud", "stub");
    put(&dir, "_backstage/storyforge/cover.png", "png");
    #[cfg(unix)]
    std::os::unix::fs::symlink(dir.path().join("elsewhere"), dir.path().join("link")).unwrap();
    let entries = p.scan(None).unwrap();
    let find = |path: &str| entries.iter().find(|e| e.path == path).unwrap_or_else(|| panic!("no {path}"));
    assert_eq!(find("_story-library/aaa/ch.md").text.as_deref(), Some("chapter"));
    assert_eq!(find("Codex/Jane.md").text.as_deref(), Some("jane"));
    assert_eq!(find("elsewhere/readme.md").text, None);
    assert_eq!(find(".obsidian/app.json").text, None);
    assert_eq!(find("_backstage/storyforge/cover.png").text, None);
    assert!(find("_story-library/aaa/.ch2.md.icloud").placeholder);
    assert!(!find("Codex/Jane.md").placeholder);
    assert!(entries.iter().all(|e| e.path != "link"), "symlinks are neither followed nor listed");
    assert_eq!(p.scan(Some("Codex")).unwrap().len(), 1);
}

#[test]
fn write_text_is_atomic_keeps_crlf_and_obeys_the_guard() {
    let (dir, p) = project();
    p.write_text("_backstage/storyforge/a.md", "one\ntwo\n", "write-file", None).unwrap();
    assert_eq!(get(&dir, "_backstage/storyforge/a.md"), "one\ntwo\n");
    put(&dir, "_backstage/storyforge/win.md", "x\r\ny\r\n");
    p.write_text("_backstage/storyforge/win.md", "a\nb\n", "write-file", None).unwrap();
    assert_eq!(get(&dir, "_backstage/storyforge/win.md"), "a\r\nb\r\n");
    put(&dir, "_story-library/aaa/ch.md", "prose");
    assert_eq!(p.write_text("_story-library/aaa/ch.md", "x", "write-file", None).unwrap_err().code, "FORBIDDEN");
    put(&dir, "Codex/Jane.md", "---\naliases: []\n---\nbody");
    assert_eq!(p.write_text("Codex/Jane.md", "x", "write-file", None).unwrap_err().code, "FORBIDDEN");
    p.write_text("Codex/Jane.md", "---\naliases: [J]\n---\nbody", "frontmatter-edit", Some(vec!["aliases".into()])).unwrap();
    assert_eq!(p.write_text("Codex/Jane.md", "x", "frontmatter-edit", Some(vec!["aliases".into(), "type".into()])).unwrap_err().code, "FORBIDDEN");
    assert_eq!(p.write_text("_export/x.json", "{}", "write-file", None).unwrap_err().code, "FORBIDDEN");
    assert_eq!(p.write_text("_sf-backup/x.zip", "{}", "write-file", None).unwrap_err().code, "FORBIDDEN");
    assert!(leftovers(dir.path()).is_empty());
}

#[test]
fn nothing_is_written_through_a_link_that_leaves_the_project() {
    #[cfg(unix)]
    {
        let base = tempfile::tempdir().unwrap();
        let root = base.path().join("p");
        let outside = base.path().join("out");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::create_dir_all(root.join("_backstage/storyforge")).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("_backstage/storyforge/escape")).unwrap();
        let p = Project::open(&root, false).unwrap();
        for result in [
            p.write_text("_backstage/storyforge/escape/x.md", "x", "write-file", None).map(|_| ()),
            p.write_binary("_backstage/storyforge/escape/x.bin", b"x"),
            p.create_file("create-file", "_backstage/storyforge/escape/y.md", b"y"),
            p.create_folder("_backstage/storyforge/escape/sub"),
        ] {
            assert_eq!(result.unwrap_err().code, "EACCES");
        }
        assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
        // reads do not go through it either
        fs::write(outside.join("secret.md"), "secret").unwrap();
        assert!(p.read_text("_backstage/storyforge/escape/secret.md").is_err());
    }
}

#[test]
fn read_only_projects_refuse_every_write() {
    let dir = tempfile::tempdir().unwrap();
    put(&dir, "_backstage/storyforge/a.md", "a");
    let p = Project::open(dir.path(), true).unwrap();
    for e in [
        p.write_text("_backstage/storyforge/a.md", "b", "write-file", None).unwrap_err(),
        p.create_file("create-file", "_backstage/storyforge/b.md", b"x").unwrap_err(),
        p.create_folder("_story-library").unwrap_err(),
        p.rename("rename", "_backstage/storyforge/a.md", "_backstage/storyforge/c.md").unwrap_err(),
        p.retire("_backstage/storyforge/a.md").unwrap_err(),
        p.create_file("recovery-create", "_sf-backup/recovery/x/y.md", b"x").unwrap_err(),
        p.create_file("backup-create", "_sf-backup/x.zip", b"x").unwrap_err(),
    ] {
        assert_eq!(e.code, "READONLY");
    }
    assert_eq!(get(&dir, "_backstage/storyforge/a.md"), "a");
    assert_eq!(p.read_text("_backstage/storyforge/a.md").unwrap(), "a");
}

#[test]
fn create_file_never_overwrites() {
    let (dir, p) = project();
    p.create_file("create-file", "_story-library/aaa/new.md", b"mine").unwrap();
    assert_eq!(p.create_file("create-file", "_story-library/aaa/new.md", b"other").unwrap_err().code, "EEXIST");
    assert_eq!(get(&dir, "_story-library/aaa/new.md"), "mine");
    p.create_file("backup-create", "_sf-backup/20260101 - p.zip", b"zip").unwrap();
    assert_eq!(p.create_file("backup-create", "_sf-backup/20260101 - p.zip", b"zip2").unwrap_err().code, "EEXIST");
    p.create_file("recovery-create", "_sf-backup/recovery/aaa/c 2026.md", b"r").unwrap();
    assert_eq!(p.create_file("recovery-create", "_sf-backup/x.zip", b"r").unwrap_err().code, "FORBIDDEN");
    assert_eq!(p.create_file("write-file", "a.md", b"r").unwrap_err().code, "FORBIDDEN");
    assert!(leftovers(dir.path()).is_empty());
}

#[test]
fn compare_write_writes_only_when_the_file_is_as_expected() {
    let (dir, p) = project();
    put(&dir, "_story-library/aaa/ch.md", "old\r\n");
    let r = p.compare_write("prose-write", "_story-library/aaa/ch.md", "old\r\n", "new\n").unwrap();
    assert_eq!((r.outcome, r.late_write_recovery), ("written", None));
    assert_eq!(get(&dir, "_story-library/aaa/ch.md"), "new\n"); // exactly as given
    let r = p.compare_write("prose-write", "_story-library/aaa/ch.md", "old\r\n", "newer").unwrap();
    assert_eq!(r.outcome, "conflict");
    assert_eq!(get(&dir, "_story-library/aaa/ch.md"), "new\n");
    assert_eq!(p.compare_write("prose-write", "_story-library/aaa/missing.md", "", "x").unwrap_err().code, "ENOENT");
    assert_eq!(p.compare_write("prose-write", "notes/idea.md", "", "x").unwrap_err().code, "FORBIDDEN");
    put(&dir, "notes/idea.md", "a");
    assert_eq!(p.compare_write("link-rewrite", "notes/idea.md", "a", "b").unwrap().outcome, "written");
    assert_eq!(p.compare_write("write-file", "notes/idea.md", "b", "c").unwrap_err().code, "FORBIDDEN");
    assert!(leftovers(dir.path()).is_empty());
}

#[test]
fn compare_write_compares_bytes_not_decoded_text() {
    let (dir, p) = project();
    fs::write(dir.path().join("Codex_note.md"), b"").ok();
    fs::create_dir_all(dir.path().join("Codex")).unwrap();
    fs::write(dir.path().join("Codex/Bad.md"), [b'a', 0xff, b'b']).unwrap();
    // the decoded text is "a\u{fffd}b"; a file with invalid bytes is a conflict, never rewritten
    let r = p.compare_write("prose-write", "Codex/Bad.md", "a\u{fffd}b", "new").unwrap();
    assert_eq!(r.outcome, "conflict");
    assert_eq!(fs::read(dir.path().join("Codex/Bad.md")).unwrap(), vec![b'a', 0xff, b'b']);
}

#[test]
fn an_outside_writer_between_the_check_and_the_swap_wins_and_nothing_is_lost() {
    let (dir, mut p) = project();
    put(&dir, "_story-library/aaa/ch.md", "base");
    p.hooks.before_swap = Some(Box::new(move |abs| {
        fs::write(abs, "written elsewhere in that instant").unwrap();
    }));
    let r = p.compare_write("prose-write", "_story-library/aaa/ch.md", "base", "ours").unwrap();
    assert_eq!(r.outcome, "conflict");
    assert_eq!(get(&dir, "_story-library/aaa/ch.md"), "written elsewhere in that instant");
    assert!(leftovers(dir.path()).is_empty());
}

#[cfg(target_os = "macos")]
#[test]
fn a_late_write_into_the_swapped_out_file_is_kept_in_recovery_not_removed() {
    let (dir, mut p) = project();
    put(&dir, "_story-library/aaa/ch.md", "base");
    p.hooks.after_verify = Some(Box::new(|swapped_out| {
        use std::io::Write;
        let mut f = fs::OpenOptions::new().append(true).open(swapped_out).unwrap();
        f.write_all(b" + a late write").unwrap();
        f.sync_all().unwrap();
    }));
    let r = p.compare_write("prose-write", "_story-library/aaa/ch.md", "base", "ours").unwrap();
    assert_eq!(r.outcome, "written");
    let recovered = r.late_write_recovery.expect("the late bytes are kept");
    assert!(recovered.starts_with("_sf-backup/recovery/_late-write/ch "), "{recovered}");
    assert_eq!(get(&dir, &recovered), "base + a late write");
    assert_eq!(get(&dir, "_story-library/aaa/ch.md"), "ours");
    assert!(leftovers(dir.path()).is_empty());
}

#[cfg(target_os = "macos")]
#[test]
fn the_exclusive_rename_and_the_swap_really_are_used_on_this_volume() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("a"), "a").unwrap();
    fs::write(dir.path().join("b"), "b").unwrap();
    assert!(storyforge_fs::platform::swap(&dir.path().join("a"), &dir.path().join("b")).unwrap(), "RENAME_SWAP is unsupported here");
    assert_eq!(fs::read_to_string(dir.path().join("a")).unwrap(), "b");
    let e = storyforge_fs::platform::rename_excl(&dir.path().join("a"), &dir.path().join("b")).unwrap_err();
    assert_eq!(e.kind(), std::io::ErrorKind::AlreadyExists);
}

#[test]
fn rename_is_exclusive_and_handles_case_only_changes() {
    let (dir, p) = project();
    put(&dir, "_backstage/storyforge/a.md", "a");
    put(&dir, "_backstage/storyforge/b.md", "b");
    assert_eq!(p.rename("rename", "_backstage/storyforge/a.md", "_backstage/storyforge/b.md").unwrap_err().code, "EEXIST");
    p.rename("rename", "_backstage/storyforge/a.md", "_backstage/storyforge/sub/c.md").unwrap();
    assert_eq!(get(&dir, "_backstage/storyforge/sub/c.md"), "a");
    assert!(!dir.path().join("_backstage/storyforge/a.md").exists());
    p.rename("rename", "_backstage/storyforge/sub/c.md", "_backstage/storyforge/sub/C.md").unwrap();
    let names: Vec<String> = fs::read_dir(dir.path().join("_backstage/storyforge/sub")).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
    assert_eq!(names, vec!["C.md".to_string()]);
    // folders move too
    p.rename("rename", "_backstage/storyforge/sub", "_backstage/storyforge/moved").unwrap();
    assert_eq!(get(&dir, "_backstage/storyforge/moved/C.md"), "a");
    // only the link rewriter's rename may touch a Codex note
    put(&dir, "Codex/Jane.md", "j");
    assert_eq!(p.rename("rename", "Codex/Jane.md", "Codex/Janet.md").unwrap_err().code, "FORBIDDEN");
    p.rename("codex-rename", "Codex/Jane.md", "Codex/Janet.md").unwrap();
    assert_eq!(p.rename("codex-rename", "Codex/Janet.md", "notes/Janet.md").unwrap_err().code, "FORBIDDEN");
    assert!(leftovers(dir.path()).is_empty());
}

#[test]
fn retire_moves_into_trash_and_never_overwrites() {
    let (dir, p) = project();
    put(&dir, "_backstage/storyforge/aaa/chapters/c.md", "first");
    assert_eq!(p.retire("_backstage/storyforge/aaa/chapters/c.md").unwrap(), ".trash/_backstage/storyforge/aaa/chapters/c.md");
    put(&dir, "_backstage/storyforge/aaa/chapters/c.md", "second");
    assert_eq!(p.retire("_backstage/storyforge/aaa/chapters/c.md").unwrap(), ".trash/_backstage/storyforge/aaa/chapters/c (2).md");
    assert_eq!(get(&dir, ".trash/_backstage/storyforge/aaa/chapters/c.md"), "first");
    assert_eq!(get(&dir, ".trash/_backstage/storyforge/aaa/chapters/c (2).md"), "second");
    put(&dir, "Codex/Jane.md", "j");
    assert_eq!(p.retire("Codex/Jane.md").unwrap_err().code, "FORBIDDEN");
}

#[test]
fn read_outside_reads_other_notes_but_not_storyforges_own_folders() {
    let (dir, p) = project();
    put(&dir, ".obsidian/plugins/storyforge/data.json", "{\"a\":1}");
    put(&dir, "elsewhere/readme.md", "hello");
    put(&dir, "_backstage/storyforge/x.md", "x");
    assert_eq!(p.read_outside(".obsidian/plugins/storyforge/data.json").unwrap(), "{\"a\":1}");
    assert_eq!(p.read_outside("elsewhere/readme.md").unwrap(), "hello");
    assert_eq!(p.read_outside("_backstage/storyforge/x.md").unwrap_err().code, "FORBIDDEN");
    assert_eq!(p.read_outside("_BACKSTAGE/storyforge/x.md").unwrap_err().code, "FORBIDDEN");
    assert!(p.read_outside("../x").is_err());
}

#[test]
fn download_placeholder_only_for_one_existing_stub_and_never_hidden_or_outside() {
    let (dir, p) = project();
    put(&dir, "notes/here.md", "x");
    assert!(p.download_placeholder("notes/here.md", std::time::Duration::from_millis(10)).unwrap(), "a file that is already there needs nothing");
    assert_eq!(p.download_placeholder("notes/none.md", std::time::Duration::from_millis(10)).unwrap_err().code, "ENOENT");
    assert_eq!(p.download_placeholder(".obsidian/x.md", std::time::Duration::from_millis(10)).unwrap_err().code, "FORBIDDEN");
    assert!(p.download_placeholder("../x.md", std::time::Duration::from_millis(10)).is_err());
    // A stub outside iCloud: macOS cannot download it. That is an error or "not downloaded", never a hang or a write.
    put(&dir, "notes/.later.md.icloud", "stub");
    let r = p.download_placeholder("notes/later.md", std::time::Duration::from_millis(300));
    assert!(matches!(r, Ok(false) | Err(_)), "{r:?}");
    assert!(!dir.path().join("notes/later.md").exists());
}
