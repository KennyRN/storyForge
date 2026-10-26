//! The shared write-guard table (`test/guard-spec/guard.json`). The TypeScript guard passes the same
//! rows (`src/core/__tests__/guard.test.ts`). The table is never edited to make a row pass.
use serde::Deserialize;
use storyforge_fs::guard::{check_guard, GuardOp};

#[derive(Deserialize)]
struct Row {
    id: String,
    op: String,
    path: Option<String>,
    from: Option<String>,
    to: Option<String>,
    keys: Option<Vec<String>>,
    expect: String,
    /// Rows with a symbolic link are covered by `containment_table.rs`; the guard decides on the path alone.
    #[allow(dead_code)]
    symlink: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct Table {
    rows: Vec<Row>,
}

fn table() -> Table {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../test/guard-spec/guard.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("guard.json")).expect("valid table")
}

#[test]
fn every_row_of_the_shared_table_passes() {
    let table = table();
    assert!(table.rows.len() >= 216, "the table has shrunk: {}", table.rows.len());
    let mut failures = Vec::new();
    for row in &table.rows {
        let op = GuardOp::from_spec(&row.op, row.path.as_deref(), row.from.as_deref(), row.to.as_deref(), row.keys.clone()).expect("a known operation");
        let decision = check_guard(&op);
        // A row with a symlink expects the combined verdict; the path-only guard must at least not refuse what the row allows.
        if row.symlink.is_some() {
            if row.expect == "allow" && !decision.is_allowed() {
                failures.push(format!("{}: guard refused a row that should be allowed: {:?}", row.id, decision));
            }
            continue;
        }
        if decision.is_allowed() != (row.expect == "allow") {
            failures.push(format!("{}: expected {}, got {:?}", row.id, row.expect, decision));
        }
    }
    assert!(failures.is_empty(), "{} rows failed:\n{}", failures.len(), failures.join("\n"));
}

#[test]
fn row_ids_are_unique_and_every_operation_has_an_allow_and_a_refuse() {
    let table = table();
    let mut ids: Vec<&str> = table.rows.iter().map(|r| r.id.as_str()).collect();
    ids.sort();
    let n = ids.len();
    ids.dedup();
    assert_eq!(ids.len(), n);
    for op in ["write-file", "write-binary", "create-file", "create-folder", "rename", "retire", "temp-remove", "frontmatter-edit", "prose-write", "link-rewrite", "backup-create", "recovery-create", "codex-rename"] {
        assert!(table.rows.iter().any(|r| r.op == op && r.expect == "allow" && r.symlink.is_none()), "{op} has no allow row");
        assert!(table.rows.iter().any(|r| r.op == op && r.expect == "refuse" && r.symlink.is_none()), "{op} has no refuse row");
    }
}
