//! storyForge's desktop shell. Rust owns the disk; the window runs the TypeScript core and reaches the
//! project folder only through this crate's narrow commands (docs/tauri-shell.md).
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, Theme};

#[tauri::command]
fn app_info() -> serde_json::Value {
    serde_json::json!({ "name": "storyForge", "version": env!("CARGO_PKG_VERSION") })
}

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open-project", "Open Project…", true, Some("CmdOrCtrl+O"))?;
    let new = MenuItem::with_id(app, "new-project", "New Project…", true, Some("CmdOrCtrl+N"))?;
    let app_menu = Submenu::with_items(
        app,
        "storyForge",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;
    let file = Submenu::with_items(app, "File", true, &[&open, &new])?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[&PredefinedMenuItem::minimize(app, None)?, &PredefinedMenuItem::maximize(app, None)?, &PredefinedMenuItem::close_window(app, None)?],
    )?;
    Menu::with_items(app, &[&app_menu, &file, &edit, &window])
}

pub fn run() {
    tauri::Builder::default()
        // A second launch focuses the first: two copies would be two writers on one folder.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            if let Some(w) = app.get_webview_window("main") {
                w.set_theme(Some(Theme::Dark))?;
            }
            app.on_menu_event(|app, event| {
                // The window decides what to do; Rust never opens a path on its own initiative.
                let _ = app.emit("menu", event.id().0.as_str());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running storyForge");
}
