fn main() {
    // The window may call only the app's own commands, each granted by name in capabilities/main.json.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["app_info"]),
        ),
    )
    .expect("failed to run tauri-build");
}
