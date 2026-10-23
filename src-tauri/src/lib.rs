//! storyForge's desktop shell. Rust owns the disk; the window runs the TypeScript core and reaches the
//! project folder only through this crate's narrow commands (docs/tauri-shell.md).
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use storyforge_fs::api::dispatch;
use storyforge_fs::error::{FsError, FsResult};
use storyforge_fs::machine::MachineStore;
use storyforge_fs::ops::Project;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, State, Theme};

const MAX_RECENT: usize = 10;

/// What the app holds about the open project. The folder is chosen by the native picker (or the recent
/// list) in Rust and stays here: the window can be told the path to display, but can never send a path
/// back to be treated as the project folder.
pub struct AppState {
    project: Mutex<Option<Arc<Project>>>,
    machine: MachineStore,
}

impl AppState {
    fn project(&self) -> FsResult<Arc<Project>> {
        self.project.lock().unwrap().clone().ok_or_else(|| FsError::new("UNKNOWN", "no project is open", None))
    }

    fn recent(&self) -> Vec<String> {
        self.machine.get("recent").ok().flatten().and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok()).unwrap_or_default()
    }

    fn remember(&self, root: &str) {
        let mut list = self.recent();
        list.retain(|r| r != root);
        list.insert(0, root.to_string());
        list.truncate(MAX_RECENT);
        let _ = self.machine.set("recent", &serde_json::to_string(&list).unwrap_or_default());
    }

    fn open(&self, root: &std::path::Path) -> FsResult<Value> {
        let project = Project::open_checked(root)?;
        let info = project_summary(&project);
        self.remember(&project.root().to_string_lossy());
        *self.project.lock().unwrap() = Some(Arc::new(project));
        Ok(info)
    }
}

fn project_summary(p: &Project) -> Value {
    json!({ "root": p.root().to_string_lossy(), "readOnly": p.is_read_only() })
}

#[tauri::command]
fn app_info() -> Value {
    json!({ "name": "storyForge", "version": env!("CARGO_PKG_VERSION") })
}

/// The native folder picker. `kind` is `open` or `create` (only the title differs; whether a folder is
/// fit to create a project in is decided by `createProject`, which refuses a folder that is not empty).
#[tauri::command]
async fn pick_project(state: State<'_, AppState>, kind: String) -> Result<Option<Value>, FsError> {
    let title = if kind == "create" { "Choose an empty folder for the new project" } else { "Open a storyForge project folder" };
    let Some(handle) = rfd::AsyncFileDialog::new().set_title(title).pick_folder().await else { return Ok(None) };
    state.open(handle.path()).map(Some)
}

/// Opens the `index`th entry of the recent list. The window names an entry, never a path.
#[tauri::command]
async fn open_recent(state: State<'_, AppState>, index: usize) -> Result<Value, FsError> {
    let list = state.recent();
    let root = list.get(index).ok_or_else(|| FsError::new("ENOENT", "no such recent project", None))?;
    state.open(&PathBuf::from(root))
}

#[tauri::command]
fn recent_projects(state: State<'_, AppState>) -> Vec<String> {
    state.recent()
}

#[tauri::command]
fn project_info(state: State<'_, AppState>) -> Option<Value> {
    state.project().ok().map(|p| project_summary(&p))
}

#[tauri::command]
fn close_project(state: State<'_, AppState>) {
    *state.project.lock().unwrap() = None;
}

#[tauri::command]
fn machine_get(state: State<'_, AppState>, name: String) -> Result<Option<String>, FsError> {
    state.machine.get(&name)
}

#[tauri::command]
fn machine_set(state: State<'_, AppState>, name: String, text: String) -> Result<(), FsError> {
    state.machine.set(&name, &text)
}

/// One Tauri command per file-system operation, each a thin wrapper over the single dispatch in
/// `storyforge_fs::api` (the same code the test bridge runs). Async, so a big scan never blocks the window.
macro_rules! fs_commands {
    ($($name:ident),* $(,)?) => {
        $(
            #[tauri::command]
            async fn $name(state: State<'_, AppState>, args: Value) -> Result<Value, FsError> {
                let project = state.project()?;
                tauri::async_runtime::spawn_blocking(move || dispatch(&project, stringify!($name), &args))
                    .await
                    .map_err(|e| FsError::new("UNKNOWN", e.to_string(), None))?
            }
        )*
    };
}
fs_commands!(scan, stat, read_text, read_binary, read_outside, write_text, write_binary, create_file, create_folder, compare_write, rename, retire);

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
            let data_dir = app.path().app_data_dir()?;
            app.manage(AppState { project: Mutex::new(None), machine: MachineStore::new(&data_dir) });
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
        .invoke_handler(tauri::generate_handler![
            app_info, pick_project, open_recent, recent_projects, project_info, close_project, scan, stat, read_text, read_binary, read_outside, write_text, write_binary,
            create_file, create_folder, compare_write, rename, retire, machine_get, machine_set
        ])
        .run(tauri::generate_context!())
        .expect("error while running storyForge");
}
