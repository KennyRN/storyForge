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

use storyforge_fs::recent::{folder_name, match_names, NAME_MAX_CHARS};

fn entries(items: &[(&str, &str)]) -> Vec<(String, String)> {
    items.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect()
}

#[test]
fn names_are_labels_matched_by_position_and_only_for_the_list_they_were_made_for() {
    let list = l(&["/x/Lantern", "/y/Harbour"]);
    assert_eq!(folder_name("/x/Lantern"), "Lantern");
    let ok = match_names(&list, &entries(&[("Lantern", "The Lantern Cycle"), ("Harbour", "")]));
    assert_eq!(ok, Some(l(&["The Lantern Cycle", "Harbour"]))); // an empty name falls back to the folder's
    // The list has changed since (another length, or another folder at a position): nothing is used.
    assert_eq!(match_names(&list, &entries(&[("Lantern", "A")])), None);
    assert_eq!(match_names(&list, &entries(&[("Harbour", "A"), ("Lantern", "B")])), None);
    assert_eq!(match_names(&[], &[]), Some(vec![]));
}

#[test]
fn a_name_is_cleaned_and_length_capped_and_is_never_a_path() {
    let list = l(&["/x/A"]);
    let long = "n".repeat(NAME_MAX_CHARS + 50);
    let out = match_names(&list, &entries(&[("A", &long)])).unwrap();
    assert_eq!(out[0].chars().count(), NAME_MAX_CHARS);
    let out = match_names(&list, &entries(&[("A", "  Two\nLines\u{7}  ")])).unwrap();
    assert_eq!(out[0], "TwoLines");
}
