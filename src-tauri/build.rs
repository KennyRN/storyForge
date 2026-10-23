/// Every command the window may call. Each is granted by name in capabilities/main.json
/// (test/tauriConfig.test.ts checks the two lists agree and nothing else is granted).
const COMMANDS: &[&str] = &[
    "app_info",
    "pick_project",
    "open_recent",
    "recent_projects",
    "project_info",
    "close_project",
    "scan",
    "stat",
    "read_text",
    "read_binary",
    "read_outside",
    "write_text",
    "write_binary",
    "create_file",
    "create_folder",
    "compare_write",
    "rename",
    "retire",
    "machine_get",
    "machine_set",
    "watch_start",
    "watch_stop",
];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS))).expect("failed to run tauri-build");
}
