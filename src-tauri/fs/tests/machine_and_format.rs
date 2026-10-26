use storyforge_fs::format::{format_version, is_newer_than_supported};
use storyforge_fs::machine::{is_allowed_name, MachineStore};
use storyforge_fs::ops::Project;

#[test]
fn only_the_allow_listed_names_work() {
    let hex = "a".repeat(64);
    for ok in ["window", "recent", "computer"] {
        assert!(is_allowed_name(ok));
    }
    assert!(is_allowed_name(&format!("snapshots/{hex}")));
    assert!(is_allowed_name(&format!("project-ui/{hex}")));
    assert!(is_allowed_name(&format!("session/{hex}")));
    assert!(is_allowed_name(&format!("leftovers/{hex}")));
    for bad in ["", "../x", "snapshots/../x", "snapshots/abc", &format!("snapshots/{}", "A".repeat(64)), &format!("other/{hex}"), "window/x", "computer/x", "session/abc", &format!("snapshots/{hex}/x")] {
        assert!(!is_allowed_name(bad), "{bad}");
    }
    let dir = tempfile::tempdir().unwrap();
    let store = MachineStore::new(dir.path());
    assert_eq!(store.get("window").unwrap(), None);
    store.set("window", "{\"w\":1}").unwrap();
    store.set("window", "{\"w\":2}").unwrap();
    assert_eq!(store.get("window").unwrap().as_deref(), Some("{\"w\":2}"));
    store.set(&format!("snapshots/{hex}"), "{}").unwrap();
    assert_eq!(store.set("../escape", "x").unwrap_err().code, "FORBIDDEN");
    assert_eq!(store.get("etc/passwd").unwrap_err().code, "FORBIDDEN");
    let names: Vec<_> = std::fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
    assert!(names.iter().all(|n| !n.ends_with(".tmp")), "{names:?}");
}

#[test]
fn format_version_is_read_from_the_frontmatter_only() {
    assert_eq!(format_version("---\nformat-version: 1\n---\n"), Some(1));
    assert_eq!(format_version("---\nx: 1\nformat-version: 7 # newer\n---\n"), Some(7));
    assert_eq!(format_version("---\nformat-version: \"2\"\n---\n"), Some(2));
    assert_eq!(format_version("no frontmatter\nformat-version: 3\n"), None);
    assert_eq!(format_version("---\nx: 1\n---\nformat-version: 3\n"), None);
    assert_eq!(format_version("---\nformat-version: abc\n---\n"), None);
    assert!(is_newer_than_supported("---\nformat-version: 2\n---\n"));
    assert!(!is_newer_than_supported("---\nformat-version: 1\n---\n"));
    assert!(!is_newer_than_supported(""));
}

#[test]
fn a_newer_project_opens_read_only_and_nothing_is_written() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("_backstage/storyforge")).unwrap();
    std::fs::write(dir.path().join("_backstage/storyforge/project.md"), "---\nformat-version: 99\n---\n").unwrap();
    let p = Project::open_checked(dir.path()).unwrap();
    assert!(p.is_read_only());
    assert_eq!(p.write_text("_backstage/storyforge/project.md", "x", "write-file", None).unwrap_err().code, "READONLY");
    assert_eq!(p.create_file("recovery-create", "_sf-backup/recovery/a/b.md", b"x").unwrap_err().code, "READONLY");
    assert_eq!(p.create_file("backup-create", "_sf-backup/x.zip", b"x").unwrap_err().code, "READONLY");
    let ok = tempfile::tempdir().unwrap();
    assert!(!Project::open_checked(ok.path()).unwrap().is_read_only());
}
