//! The rows of `test/guard-spec/guard.json` that carry a `symlink`: the guard's decision on the path,
//! and the containment walk on a real folder. The TypeScript twin is in `guard.test.ts`.
#![cfg(unix)]
use serde::Deserialize;
use std::fs;
use std::os::unix::fs::symlink;
use std::path::Path;
use storyforge_fs::containment::ensure_inside;
use storyforge_fs::guard::{check_guard, GuardOp};

#[derive(Deserialize)]
struct Link {
    link: String,
    target: String,
}
#[derive(Deserialize)]
struct Row {
    id: String,
    op: String,
    path: Option<String>,
    from: Option<String>,
    to: Option<String>,
    keys: Option<Vec<String>>,
    symlink: Option<Link>,
    expect: String,
}
#[derive(Deserialize)]
struct Table {
    rows: Vec<Row>,
}

#[test]
fn the_symlink_rows_pass() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../test/guard-spec/guard.json");
    let table: Table = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    let rows: Vec<&Row> = table.rows.iter().filter(|r| r.symlink.is_some()).collect();
    assert!(rows.len() >= 13, "the symlink rows are missing");
    let mut failures = Vec::new();
    for row in rows {
        let base = tempfile::tempdir().unwrap();
        let root = base.path().join("project");
        let outside = base.path().join("outside");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&outside).unwrap();
        let root = fs::canonicalize(&root).unwrap();
        let l = row.symlink.as_ref().unwrap();
        let link_path = root.join(&l.link);
        fs::create_dir_all(link_path.parent().unwrap()).unwrap();
        let dest = match l.target.as_str() {
            "outside" => outside.clone(),
            "outside-missing" => base.path().join("does-not-exist"),
            inside => {
                let d = root.join(inside);
                fs::create_dir_all(&d).unwrap();
                d
            }
        };
        symlink(&dest, &link_path).unwrap();

        let op = GuardOp::from_spec(&row.op, row.path.as_deref(), row.from.as_deref(), row.to.as_deref(), row.keys.clone()).unwrap();
        let mut allowed = check_guard(&op).is_allowed();
        if allowed {
            let touched: Vec<&str> = match &op {
                GuardOp::Rename { to, .. } | GuardOp::CodexRename { to, .. } => vec![to.as_str()],
                other => other.paths(),
            };
            for p in touched {
                if ensure_inside(&root, p).is_err() {
                    allowed = false;
                }
            }
        }
        if allowed != (row.expect == "allow") {
            failures.push(format!("{}: expected {}, got allowed={}", row.id, row.expect, allowed));
        }
        if fs::read_dir(&outside).unwrap().count() != 0 {
            failures.push(format!("{}: something was written outside the project", row.id));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn a_plain_path_resolves_under_the_root_and_a_missing_one_is_not_an_error() {
    let dir = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(dir.path()).unwrap();
    fs::create_dir_all(root.join("a")).unwrap();
    assert_eq!(ensure_inside(&root, "a/b/c.md").unwrap(), root.join("a/b/c.md"));
    assert!(ensure_inside(&root, "../x").is_err());
    assert!(ensure_inside(&root, "/etc/passwd").is_err());
    let _ = Path::new("");
}
