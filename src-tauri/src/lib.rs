//! storyForge's desktop shell. Rust owns the disk; the window runs the TypeScript core and reaches the
//! project folder only through this crate's narrow commands (docs/tauri-shell.md).
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use serde_json::{json, Value};
use storyforge_fs::api::dispatch;
use quit_state::{Finish, QuitState};
use storyforge_fs::error::{FsError, FsResult};
use storyforge_fs::machine::MachineStore;
use storyforge_fs::ops::Project;
use storyforge_fs::watch::{Batcher, SleepDetector};
use std::collections::HashMap;
use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, State, Theme};

mod quit_state;


/// What the app holds about the open project. The folder is chosen by the native picker (or the recent
/// list) in Rust and stays here: the window can be told the path to display, but can never send a path
/// back to be treated as the project folder.
pub struct AppState {
    project: Mutex<Option<Arc<Project>>>,
    machine: MachineStore,
    watcher: Mutex<Option<Watching>>,
    /// The quit bookkeeping: one close at a time, one exit, one reply to macOS (quit_state.rs).
    quit: QuitState,
    /// When the close last made progress (it began, or the window said a stage or a rewritten file finished). The watchdog counts from here.
    last_progress: Mutex<Instant>,
    /// Which of the app's own menu items are enabled, as the window last said: kept so a rebuilt menu (the recent list changed) keeps it.
    menu_enabled: Mutex<HashMap<String, bool>>,
}

/// A running watcher: dropping it (and setting `stop`) ends it.
struct Watching {
    stop: Arc<AtomicBool>,
    _watcher: notify::RecommendedWatcher,
}

impl AppState {
    fn project(&self) -> FsResult<Arc<Project>> {
        self.project.lock().unwrap().clone().ok_or_else(|| FsError::new("UNKNOWN", "no project is open", None))
    }

    fn recent(&self) -> Vec<String> {
        storyforge_fs::recent::parse(self.machine.get("recent").ok().flatten().as_deref())
    }

    fn save_recent(&self, list: &[String]) {
        let _ = self.machine.set("recent", &storyforge_fs::recent::to_text(list));
    }

    /// Opens the folder as the project Rust holds. It is **not** put on the recent list here: a folder joins the list only once the window
    /// has opened it as a project (`remember_project`), so a folder that is not a project, or is in an older layout, never does.
    fn open(&self, root: &std::path::Path) -> FsResult<Value> {
        let project = Project::open_checked(root)?;
        let info = project_summary(&project);
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
async fn pick_project(app: tauri::AppHandle, state: State<'_, AppState>, kind: String) -> Result<Option<Value>, FsError> {
    let title = if kind == "create" { "Choose an empty folder for the new project" } else { "Open a storyForge project folder" };
    let Some(handle) = rfd::AsyncFileDialog::new().set_title(title).pick_folder().await else { return Ok(None) };
    let opened = state.open(handle.path()).map(Some);
    refresh_menu(&app);
    opened
}

/// Chooses a cover image. `target` is the series or a book code, never a path. Rust shows the open panel (images
/// only), reads the chosen file itself, checks it and installs it as `cover.<ext>` (the old cover is retired to
/// `.trash/`). The window is told only the new file name, or nothing if the panel was cancelled. Refused in a
/// read-only project, before the panel opens.
#[tauri::command]
async fn pick_cover(state: State<'_, AppState>, target: Value) -> Result<Option<String>, FsError> {
    let project = state.project()?;
    if project.is_read_only() {
        return Err(FsError::new("READONLY", "this project was made by a newer storyForge and is open read-only", None));
    }
    project.cover_folder(&target)?;
    let Some(handle) = rfd::AsyncFileDialog::new().set_title("Choose a cover image").add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp"]).pick_file().await else { return Ok(None) };
    let path = handle.path().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        let shown = path.to_string_lossy().to_string();
        let size = std::fs::metadata(&path).map_err(|e| FsError::from_io(&e, &shown))?.len();
        if size > storyforge_fs::ops::COVER_MAX_BYTES {
            return Err(FsError::forbidden("That image is larger than 10 MB. Choose a PNG, JPEG, GIF or WebP image under 10 MB.", ""));
        }
        let bytes = std::fs::read(&path).map_err(|e| FsError::from_io(&e, &shown))?;
        project.install_cover(&target, &bytes).map(Some)
    })
    .await
    .map_err(|e| FsError::new("UNKNOWN", e.to_string(), None))?
}

/// Opens the `index`th entry of the recent list. The window names an entry, never a path.
#[tauri::command]
async fn open_recent(app: tauri::AppHandle, state: State<'_, AppState>, index: usize) -> Result<Value, FsError> {
    let list = state.recent();
    let root = list.get(index).ok_or_else(|| FsError::new("ENOENT", "no such recent project", None))?;
    let opened = state.open(&PathBuf::from(root));
    refresh_menu(&app);
    opened
}

/// Puts the project Rust holds open on the recent list, once the window has opened it as a project. It takes no path: it records only the
/// folder Rust itself holds (decision 24). It writes only `recent.json` in the app's data folder (decision 121's amendment).
#[tauri::command]
fn remember_project(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), FsError> {
    let root = state.project()?.root().to_string_lossy().to_string();
    let list = storyforge_fs::recent::remember(state.recent(), &root);
    state.save_recent(&list);
    refresh_menu(&app);
    Ok(())
}

/// The window says which of the app's own menu items apply now (no project open, nothing selected, a read-only
/// project). This sets those items enabled or disabled. It touches no files and reads none.
#[tauri::command]
fn set_menu_state(app: tauri::AppHandle, state: State<'_, AppState>, enabled: HashMap<String, bool>) {
    *state.menu_enabled.lock().unwrap() = enabled;
    apply_menu_state(&app);
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
    stop_watching(&state);
    *state.project.lock().unwrap() = None;
}

fn stop_watching(state: &AppState) {
    if let Some(w) = state.watcher.lock().unwrap().take() {
        w.stop.store(true, Ordering::SeqCst);
    }
}

/// Starts watching the open project. Changes arrive in the window as `watch-batch` events: a batch of
/// project-relative paths (after 300 ms of quiet, 2 s at most) and a `rescan` flag, set when the system
/// says events may have been missed or the Mac woke from sleep.
#[tauri::command]
fn watch_start(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), FsError> {
    use notify::{RecursiveMode, Watcher};
    let project = state.project()?;
    stop_watching(&state);
    let root = project.root().to_path_buf();
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher = notify::recommended_watcher(tx).map_err(|e| FsError::new("UNKNOWN", e.to_string(), None))?;
    watcher.watch(&root, RecursiveMode::Recursive).map_err(|e| FsError::new("UNKNOWN", e.to_string(), None))?;
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    std::thread::spawn(move || {
        let mut batcher = Batcher::new();
        let mut sleep = SleepDetector::new(SystemTime::now(), Instant::now());
        while !stop_thread.load(Ordering::SeqCst) {
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(Ok(event)) => {
                    let now = Instant::now();
                    if event.need_rescan() {
                        batcher.push_rescan(now);
                    }
                    for p in &event.paths {
                        if let Ok(rel) = p.strip_prefix(&root) {
                            batcher.push(&rel.to_string_lossy(), now);
                        }
                    }
                }
                Ok(Err(_)) => batcher.push_rescan(Instant::now()),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
            let now = Instant::now();
            if sleep.woke(SystemTime::now(), now) {
                batcher.push_rescan(now);
            }
            if let Some(batch) = batcher.poll(now) {
                let _ = app.emit("watch-batch", batch);
            }
        }
    });
    *state.watcher.lock().unwrap() = Some(Watching { stop, _watcher: watcher });
    Ok(())
}

#[tauri::command]
fn watch_stop(state: State<'_, AppState>) {
    stop_watching(&state);
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
fs_commands!(scan, stat, read_text, read_binary, read_outside, read_cover, write_text, write_binary, create_file, create_folder, compare_write, rename, retire, download_placeholder, list_temp_leftovers, remove_temp);

/// Shows a file of the open project in Finder. The path is relative to the project folder and checked like a
/// read; nothing is opened, launched or written.
#[tauri::command]
fn reveal_in_finder(state: State<'_, AppState>, path: String) -> Result<(), FsError> {
    let project = state.project()?;
    let abs = project.reveal_target(&path)?;
    storyforge_fs::platform::reveal(&abs).map(|_| ()).map_err(|e| FsError::from_io(&e, &path))
}

/// The window has flushed every open editor and saved the snapshot: the app may close now.
#[tauri::command]
fn quit_ready(app: tauri::AppHandle) {
    eprintln!("storyForge: the window finished saving; quitting");
    finish_quit(&app);
}

/// The window's close made real progress (a stage finished, or a file of a link rewrite was written). It carries
/// nothing and touches no file: it only moves the watchdog's deadline. Like `set_menu_state`, it cannot read or write the project.
#[tauri::command]
fn close_progress(state: State<'_, AppState>) {
    *state.last_progress.lock().unwrap() = Instant::now();
}

/// The one way out. If macOS is waiting on a "later" termination, the reply ends the app (and `exit` would be
/// a second exit path); otherwise the app exits itself. Taken once: `quit_ready` and the watchdog race here.
fn finish_quit(app: &tauri::AppHandle) {
    match app.state::<AppState>().quit.finish() {
        Finish::Skip => {}
        Finish::Reply => {
            let _ = app.run_on_main_thread(|| storyforge_fs::platform::reply_to_terminate(true));
        }
        Finish::Exit => app.exit(0),
    }
}

static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// `applicationShouldTerminate:`, on the main thread: the Dock's Quit, Log Out and Shut Down arrive here.
fn on_terminate() -> storyforge_fs::platform::Terminate {
    use storyforge_fs::platform::Terminate;
    let Some(app) = APP.get() else { return Terminate::Now };
    if app.state::<AppState>().quit.terminate_request(|| start_close(app)) {
        Terminate::Now
    } else {
        Terminate::Later
    }
}

/// Closing the window or quitting is stopped, and the window is asked to save everything first. If the window makes no
/// progress for this long (it is hung), the app still closes. The count restarts at each `close_progress`.
const CLOSE_WATCHDOG: Duration = Duration::from_secs(15);

fn request_close(app: &tauri::AppHandle) {
    if !app.state::<AppState>().quit.request_close(|| start_close(app)) {
        eprintln!("storyForge: a close is already under way; joining it");
    }
}

/// Starts the close: the caller has already won `begin_close` (so exactly one close ever starts).
fn start_close(app: &tauri::AppHandle) {
    eprintln!("storyForge: close requested; asking the window to save");
    save_window_state(app);
    let _ = app.emit("close-requested", ());
    let app = app.clone();
    *app.state::<AppState>().last_progress.lock().unwrap() = Instant::now();
    std::thread::spawn(move || loop {
        // 15 s after the LAST progress: a hung window is still caught, a working rewrite always finishes (decision 24).
        let state = app.state::<AppState>();
        if state.quit.is_done() {
            return;
        }
        let deadline = *state.last_progress.lock().unwrap() + CLOSE_WATCHDOG;
        let now = Instant::now();
        if now >= deadline {
            eprintln!("storyForge: the window made no progress for {} s; quitting anyway", CLOSE_WATCHDOG.as_secs());
            finish_quit(&app);
            return;
        }
        std::thread::sleep(deadline - now);
    });
}

/// Window size and position are machine settings: remembered between launches, kept out of projects.
fn save_window_state(app: &tauri::AppHandle) {
    let Some(w) = app.get_webview_window("main") else { return };
    if w.is_minimized().unwrap_or(false) || w.is_fullscreen().unwrap_or(false) {
        return;
    }
    if let (Ok(size), Ok(pos)) = (w.outer_size(), w.outer_position()) {
        let state = json!({ "width": size.width, "height": size.height, "x": pos.x, "y": pos.y });
        let _ = app.state::<AppState>().machine.set("window", &state.to_string());
    }
}

fn restore_window_state(app: &tauri::App) {
    let Some(w) = app.get_webview_window("main") else { return };
    let Some(text) = app.state::<AppState>().machine.get("window").ok().flatten() else { return };
    let Ok(v) = serde_json::from_str::<Value>(&text) else { return };
    let get = |k: &str| v.get(k).and_then(Value::as_i64);
    if let (Some(width), Some(height), Some(x), Some(y)) = (get("width"), get("height"), get("x"), get("y")) {
        // Only if the saved place is on a screen that is still there.
        let on_screen = w.available_monitors().map(|ms| ms.iter().any(|m| {
            let (mp, ms_) = (m.position(), m.size());
            x >= mp.x as i64 - 50 && x < mp.x as i64 + ms_.width as i64 - 100 && y >= mp.y as i64 - 50 && y < mp.y as i64 + ms_.height as i64 - 100
        })).unwrap_or(false);
        if width >= 400 && height >= 300 && on_screen {
            let _ = w.set_size(tauri::PhysicalSize::new(width as u32, height as u32));
            let _ = w.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
        }
    }
}

fn item(app: &tauri::AppHandle, id: &str, label: &str, accel: Option<&str>) -> tauri::Result<MenuItem<tauri::Wry>> {
    MenuItem::with_id(app, id, label, true, accel)
}

/// The menu bar (docs/interface.md §7). Items that act on the window emit the `menu` event with their id; the
/// window decides what to do (Rust never opens a path on its own initiative). Quit is handled here.
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    // Not the predefined Quit, Undo and Redo: Quit would end the app without letting the window save first, and
    // the predefined Undo and Redo act on the web view's own history, which CodeMirror does not use.
    let quit = item(app, "quit", "Quit storyForge", Some("CmdOrCtrl+Q"))?;
    let app_menu = Submenu::with_items(
        app,
        "storyForge",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "settings", "Settings…", Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let recent_menu = Submenu::new(app, "Open Recent", true)?;
    let state = app.state::<AppState>();
    let recent = state.recent();
    if recent.is_empty() {
        recent_menu.append(&MenuItem::with_id(app, "recent-none", "No Recent Projects", false, None::<&str>)?)?;
    }
    for (i, root) in recent.iter().enumerate() {
        let name = std::path::Path::new(root).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| root.clone());
        recent_menu.append(&MenuItem::with_id(app, format!("recent:{i}"), name, true, None::<&str>)?)?;
    }
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item(app, "new-chapter", "New Chapter", Some("CmdOrCtrl+N"))?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "new-project", "New Project…", Some("Shift+CmdOrCtrl+N"))?,
            &item(app, "open-project", "Open Project…", Some("CmdOrCtrl+O"))?,
            &recent_menu,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "close-project", "Close Project", None)?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &item(app, "undo", "Undo", Some("CmdOrCtrl+Z"))?,
            &item(app, "redo", "Redo", Some("Shift+CmdOrCtrl+Z"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "find", "Find…", Some("CmdOrCtrl+F"))?,
            &item(app, "replace", "Find and Replace…", Some("Alt+CmdOrCtrl+F"))?,
        ],
    )?;
    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &item(app, "flip-face", "Flip Side", Some("CmdOrCtrl+\\"))?,
            &item(app, "toggle-lore", "Show or Hide Context", Some("Alt+CmdOrCtrl+\\"))?,
        ],
    )?;
    // The diagnostic page exists only in development builds: this item is compiled out of a release.
    #[cfg(debug_assertions)]
    {
        let developer = Submenu::with_items(app, "Developer", true, &[&item(app, "diagnostics", "Diagnostics", None)?])?;
        view.append(&PredefinedMenuItem::separator(app)?)?;
        view.append(&developer)?;
    }
    let story = Submenu::with_items(app, "Story", true, &[&item(app, "archive", "Archive", None)?, &item(app, "rename", "Rename…", None)?, &PredefinedMenuItem::separator(app)?, &item(app, "backup-now", "Back Up Now", None)?])?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[&PredefinedMenuItem::minimize(app, None)?, &PredefinedMenuItem::maximize(app, None)?, &PredefinedMenuItem::close_window(app, None)?],
    )?;
    Menu::with_items(app, &[&app_menu, &file, &edit, &view, &story, &window])
}

fn apply_items(items: Vec<MenuItemKind<tauri::Wry>>, enabled: &HashMap<String, bool>) {
    for it in items {
        match it {
            MenuItemKind::Submenu(sub) => {
                if let Ok(children) = sub.items() {
                    apply_items(children, enabled);
                }
            }
            MenuItemKind::MenuItem(mi) => {
                if let Some(v) = enabled.get(&mi.id().0) {
                    let _ = mi.set_enabled(*v);
                }
            }
            _ => {}
        }
    }
}

/// Re-applies the enabled flags the window last sent to the current menu.
fn apply_menu_state(app: &tauri::AppHandle) {
    let enabled = app.state::<AppState>().menu_enabled.lock().unwrap().clone();
    if let Some(menu) = app.menu() {
        if let Ok(items) = menu.items() {
            apply_items(items, &enabled);
        }
    }
}

/// Rebuilds the menu bar (the recent list changed) and keeps the enabled flags.
fn refresh_menu(app: &tauri::AppHandle) {
    if let Ok(menu) = build_menu(app) {
        let _ = app.set_menu(menu);
        apply_menu_state(app);
    }
}

/// Makes the Dock's Quit, Log Out, Shut Down and the quit signals run the same close as Cmd+Q. A route that
/// can't be installed is logged and the app behaves as it did before (docs/quit-paths.md).
fn install_quit_routes(app: &tauri::AppHandle) {
    let _ = APP.set(app.clone());
    if let Err(e) = storyforge_fs::platform::install_terminate_hook(on_terminate) {
        eprintln!("storyForge: could not hook the system quit ({e}); the Dock's Quit will not save first");
    }
    if let Err(e) = storyforge_fs::platform::install_quit_signals() {
        eprintln!("storyForge: could not hook the quit signals ({e})");
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(100));
        if storyforge_fs::platform::take_quit_signal() {
            eprintln!("storyForge: quit signal received");
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || request_close(&handle));
        }
    });
}

pub fn run() {
    // Before any window exists: the Mac's own text substitutions are off in the editor and spellcheck underlines on (decision 46).
    if let Err(e) = storyforge_fs::platform::register_editor_text_defaults() {
        eprintln!("storyForge: could not set the editor's text defaults ({e}); the Mac's own smart quotes and replacements may act in the manuscript");
    }
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
            app.manage(AppState { project: Mutex::new(None), machine: MachineStore::new(&data_dir), watcher: Mutex::new(None), quit: QuitState::default(), last_progress: Mutex::new(Instant::now()), menu_enabled: Mutex::new(HashMap::new()) });
            restore_window_state(app);
            install_quit_routes(app.handle());
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            if let Some(w) = app.get_webview_window("main") {
                w.set_theme(Some(Theme::Dark))?;
            }
            app.on_menu_event(|app, event| {
                if event.id().0.as_str() == "quit" {
                    request_close(app);
                    return;
                }
                // The window decides what to do; Rust never opens a path on its own initiative.
                let _ = app.emit("menu", event.id().0.as_str());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info, pick_project, open_recent, remember_project, recent_projects, project_info, close_project, scan, stat, read_text, read_binary, read_outside, write_text, write_binary,
            create_file, create_folder, compare_write, rename, retire, list_temp_leftovers, remove_temp, read_cover, pick_cover, machine_get, machine_set, watch_start, watch_stop, download_placeholder, reveal_in_finder, set_menu_state, quit_ready, close_progress
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if !app.state::<AppState>().quit.is_ok() {
                    api.prevent_close();
                    request_close(app);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building storyForge")
        .run(|app, event| {
            // Cmd+Q and the Dock's Quit arrive here, not as a window close.
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() && !app.state::<AppState>().quit.is_ok() {
                    api.prevent_exit();
                    request_close(app);
                }
            }
        });
}
