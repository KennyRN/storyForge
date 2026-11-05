use storyforge_fs::recent::{forget, parse, remember, to_text, MAX_RECENT};

fn l(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}

#[test]
fn parse_reads_a_list_and_treats_anything_else_as_empty() {
    assert_eq!(parse(Some("[\"/a\",\"/b\"]")), l(&["/a", "/b"]));
    assert!(parse(None).is_empty());
    assert!(parse(Some("not json")).is_empty());
    assert!(parse(Some("{\"a\":1}")).is_empty());
}

#[test]
fn remember_puts_the_project_first_once_and_keeps_ten() {
    assert_eq!(remember(l(&["/a", "/b"]), "/b"), l(&["/b", "/a"]));
    assert_eq!(remember(vec![], "/x"), l(&["/x"]));
    let many: Vec<String> = (0..MAX_RECENT).map(|i| format!("/p{i}")).collect();
    let out = remember(many, "/new");
    assert_eq!(out.len(), MAX_RECENT);
    assert_eq!(out[0], "/new");
    assert!(!out.contains(&"/p9".to_string()));
}

#[test]
fn forget_removes_one_entry_and_refuses_an_index_out_of_range() {
    assert_eq!(forget(l(&["/a", "/b", "/c"]), 1), Some(l(&["/a", "/c"])));
    assert_eq!(forget(l(&["/a"]), 1), None);
    assert_eq!(forget(vec![], 0), None);
}

#[test]
fn the_list_round_trips() {
    let list = l(&["/a b", "/ü"]);
    assert_eq!(parse(Some(&to_text(&list))), list);
}
