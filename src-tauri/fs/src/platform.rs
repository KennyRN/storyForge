//! The only platform-specific code: the atomic swap, the exclusive rename, iCloud downloads and showing a file in Finder. macOS has both
//! (`renamex_np` with `RENAME_SWAP` and `RENAME_EXCL`, on APFS); everywhere else, and on file systems
//! without them, these report "unsupported" and the callers fall back to a stat check and a hard
//! link. Nothing else in the crate is platform-specific.
use std::io;
use std::path::Path;

/// Atomically exchanges two paths. `Ok(true)`: exchanged. `Ok(false)`: not supported here.
#[cfg(target_os = "macos")]
pub fn swap(a: &Path, b: &Path) -> io::Result<bool> {
    renamex(a, b, libc::RENAME_SWAP)
}

/// Renames `from` to `to`, failing with `AlreadyExists` instead of replacing. `Ok(false)`: not supported here.
#[cfg(target_os = "macos")]
pub fn rename_excl(from: &Path, to: &Path) -> io::Result<bool> {
    renamex(from, to, libc::RENAME_EXCL)
}

#[cfg(target_os = "macos")]
fn renamex(a: &Path, b: &Path, flags: libc::c_uint) -> io::Result<bool> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let ca = CString::new(a.as_os_str().as_bytes()).map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, e))?;
    let cb = CString::new(b.as_os_str().as_bytes()).map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, e))?;
    // SAFETY: both pointers are valid NUL-terminated strings that live for the call.
    let rc = unsafe { libc::renamex_np(ca.as_ptr(), cb.as_ptr(), flags) };
    if rc == 0 {
        return Ok(true);
    }
    let err = io::Error::last_os_error();
    match err.raw_os_error() {
        Some(libc::ENOTSUP) | Some(libc::EINVAL) => Ok(false), // the volume does not support it
        _ => Err(err),
    }
}

#[cfg(not(target_os = "macos"))]
pub fn swap(_a: &Path, _b: &Path) -> io::Result<bool> {
    Ok(false)
}

#[cfg(all(not(target_os = "macos"), not(windows)))]
pub fn rename_excl(_from: &Path, _to: &Path) -> io::Result<bool> {
    Ok(false)
}

/// Windows: a move that never replaces (`MoveFileExW` without `MOVEFILE_REPLACE_EXISTING`), atomic on one volume, so
/// the exclusive create and the exclusive rename need no hard link and no second name (Brief 22, §3.4).
#[cfg(windows)]
pub fn rename_excl(from: &Path, to: &Path) -> io::Result<bool> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::MoveFileExW;
    let wide = |p: &Path| p.as_os_str().encode_wide().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let (a, b) = (wide(from), wide(to));
    // SAFETY: both buffers are NUL-terminated and live for the call.
    retry_sharing(|| if unsafe { MoveFileExW(a.as_ptr(), b.as_ptr(), 0) } != 0 { Ok(()) } else { Err(io::Error::last_os_error()) })?;
    Ok(true)
}

/// Whether another program is holding a file for a moment: antivirus, the search indexer, a sync client, an editor
/// that has it open. Windows reports it as a sharing or lock violation, or as "access denied".
#[cfg(windows)]
fn is_sharing_error(e: &io::Error) -> bool {
    e.kind() == io::ErrorKind::PermissionDenied || matches!(e.raw_os_error(), Some(5) | Some(32) | Some(33))
}

/// Runs `f`, and on Windows tries again a few times (about two seconds in all) while another program holds the file.
/// Any other error, and the last sharing error, is returned as it came. Elsewhere it is one call: the Mac never retries.
pub fn retry_sharing<T>(mut f: impl FnMut() -> io::Result<T>) -> io::Result<T> {
    #[cfg(windows)]
    {
        for ms in [10u64, 20, 40, 80, 160, 300, 300, 300, 300, 300] {
            match f() {
                Err(e) if is_sharing_error(&e) => std::thread::sleep(std::time::Duration::from_millis(ms)),
                other => return other,
            }
        }
    }
    f()
}

/// Renames `from` over `to`, replacing it (the last step of every atomic write). On Windows it waits out a program
/// that has the target open for a moment (`retry_sharing`); elsewhere it is `fs::rename`.
pub fn replace_file(from: &Path, to: &Path) -> io::Result<()> {
    retry_sharing(|| std::fs::rename(from, to))
}

/// Whether two existing paths are the same file or folder. A case-only rename on a case-insensitive file system names
/// the same one twice. Unix compares inodes (done by the caller); Windows compares the canonical paths.
#[cfg(windows)]
pub fn same_path(a: &Path, b: &Path) -> bool {
    matches!((std::fs::canonicalize(a), std::fs::canonicalize(b)), (Ok(x), Ok(y)) if x == y)
}

/// Asks macOS to download an iCloud file that has not been downloaded (`startDownloadingUbiquitousItem`).
/// `Ok(true)`: the request was made. `Ok(false)`: not supported here.
#[cfg(target_os = "macos")]
pub fn start_download(real_path: &Path) -> io::Result<bool> {
    use objc2_foundation::{NSFileManager, NSString, NSURL};
    let path = NSString::from_str(&real_path.to_string_lossy());
    let url = NSURL::fileURLWithPath(&path);
    let manager = NSFileManager::defaultManager();
    match manager.startDownloadingUbiquitousItemAtURL_error(&url) {
        Ok(()) => Ok(true),
        Err(e) => Err(io::Error::new(io::ErrorKind::Other, e.localizedDescription().to_string())),
    }
}

#[cfg(not(target_os = "macos"))]
pub fn start_download(_real_path: &Path) -> io::Result<bool> {
    Ok(false)
}

/// Shows a file in Finder with it selected (`open -R`). It only reveals: nothing is opened, launched or written.
/// `Ok(true)`: asked. `Ok(false)`: not supported here.
#[cfg(target_os = "macos")]
pub fn reveal(path: &Path) -> io::Result<bool> {
    let status = std::process::Command::new("/usr/bin/open").arg("-R").arg(path).status()?;
    if status.success() {
        Ok(true)
    } else {
        Err(io::Error::new(io::ErrorKind::Other, "Finder could not show the file"))
    }
}

/// Windows: File Explorer with the file selected (`explorer /select,`). Explorer answers with exit code 1 even when it
/// worked, so only a failure to start it is an error. It only reveals: nothing is opened or written.
#[cfg(windows)]
pub fn reveal(path: &Path) -> io::Result<bool> {
    use std::os::windows::process::CommandExt;
    let shown = path.to_string_lossy().replace('/', "\\");
    std::process::Command::new("explorer.exe").raw_arg(format!("/select,\"{shown}\"")).spawn()?;
    Ok(true)
}

#[cfg(all(not(target_os = "macos"), not(windows)))]
pub fn reveal(_path: &Path) -> io::Result<bool> {
    Ok(false)
}

// ---- Quitting -----------------------------------------------------------------------------------------------
//
// The Dock's Quit, Log Out, Shut Down and the quit Apple event all reach the app as `[NSApp terminate:]`. tao's
// delegate answers only `applicationWillTerminate:` (too late to save anything), so these add
// `applicationShouldTerminate:` to the delegate's class. See docs/quit-paths.md.

/// What `applicationShouldTerminate:` should answer.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Terminate {
    /// Quit now (a close has already finished).
    Now,
    /// Not yet: the app will call `reply_to_terminate` once, when it has saved.
    Later,
}

#[cfg(target_os = "macos")]
static TERMINATE_HANDLER: std::sync::OnceLock<fn() -> Terminate> = std::sync::OnceLock::new();

#[cfg(target_os = "macos")]
const NS_TERMINATE_NOW: usize = 1;
#[cfg(target_os = "macos")]
const NS_TERMINATE_LATER: usize = 2;

#[cfg(target_os = "macos")]
extern "C" fn should_terminate(_this: &objc2::runtime::AnyObject, _cmd: objc2::runtime::Sel, _sender: *mut objc2::runtime::AnyObject) -> usize {
    match TERMINATE_HANDLER.get().map(|f| f()) {
        Some(Terminate::Later) => NS_TERMINATE_LATER,
        _ => NS_TERMINATE_NOW,
    }
}

/// Adds `applicationShouldTerminate:` to the application delegate's class. Call on the main thread after the
/// event loop exists (the delegate is set by then). `Err` means it was not installed (no delegate, or the class
/// already answers it): the caller logs it and the app behaves as it did before.
#[cfg(target_os = "macos")]
pub fn install_terminate_hook(handler: fn() -> Terminate) -> io::Result<()> {
    use objc2::runtime::{AnyClass, AnyObject, Bool, Sel};
    use objc2::{class, msg_send, sel};
    let other = |m: &str| io::Error::new(io::ErrorKind::Other, m.to_string());
    unsafe {
        let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        if app.is_null() {
            return Err(other("no NSApplication"));
        }
        let delegate: *mut AnyObject = msg_send![app, delegate];
        if delegate.is_null() {
            return Err(other("the application has no delegate"));
        }
        let cls = objc2::ffi::object_getClass(delegate) as *mut AnyClass;
        let selector = sel!(applicationShouldTerminate:);
        if (*cls).instance_method(selector).is_some() {
            return Err(other("the delegate already answers applicationShouldTerminate:"));
        }
        let imp: extern "C" fn(&AnyObject, Sel, *mut AnyObject) -> usize = should_terminate;
        // The type encoding: returns an unsigned integer (Q), takes self, _cmd and one object.
        let added: Bool = objc2::ffi::class_addMethod(cls, selector, std::mem::transmute(imp), c"Q@:@".as_ptr());
        if !added.as_bool() {
            return Err(other("class_addMethod refused"));
        }
    }
    let _ = TERMINATE_HANDLER.set(handler);
    Ok(())
}

/// True once our `applicationShouldTerminate:` is installed.
#[cfg(target_os = "macos")]
pub fn terminate_hook_installed() -> bool {
    TERMINATE_HANDLER.get().is_some()
}

/// Tells macOS the termination it was asked to wait for may go ahead (`allow`) or not. Main thread only.
#[cfg(target_os = "macos")]
pub fn reply_to_terminate(allow: bool) {
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{class, msg_send};
    unsafe {
        let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        if !app.is_null() {
            let _: () = msg_send![app, replyToApplicationShouldTerminate: Bool::new(allow)];
        }
    }
}

/// The per-app text defaults WebKit reads for the editor (decision 46). The Mac's own smart quotes, smart dashes,
/// Text Replacements and spelling autocorrection would otherwise act inside the manuscript, before any code of ours
/// and inside `[[links]]`, code and comments; they are off. The red spellcheck underlines are on (they were not in
/// 0.12.0, where the web view's continuous spellchecking defaulted off).
#[cfg(target_os = "macos")]
pub const EDITOR_TEXT_DEFAULTS: [(&std::ffi::CStr, bool); 5] = [
    (c"WebAutomaticQuoteSubstitutionEnabled", false),
    (c"WebAutomaticDashSubstitutionEnabled", false),
    (c"WebAutomaticTextReplacementEnabled", false),
    (c"WebAutomaticSpellingCorrectionEnabled", false),
    (c"WebContinuousSpellCheckingEnabled", true),
];

/// Registers `EDITOR_TEXT_DEFAULTS` as this app's own defaults (`registerDefaults`: in memory, lowest priority, for
/// this process only). It writes nothing to disk and nothing to the Mac's global settings or any other app, and the
/// author's own Text Replacements elsewhere are untouched. Call before the first window is created.
#[cfg(target_os = "macos")]
pub fn register_editor_text_defaults() -> io::Result<()> {
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{class, msg_send};
    let other = |m: &str| io::Error::new(io::ErrorKind::Other, m.to_string());
    unsafe {
        let dict: *mut AnyObject = msg_send![class!(NSMutableDictionary), dictionary];
        if dict.is_null() {
            return Err(other("no NSMutableDictionary"));
        }
        for (key, on) in EDITOR_TEXT_DEFAULTS {
            let k: *mut AnyObject = msg_send![class!(NSString), stringWithUTF8String: key.as_ptr()];
            let v: *mut AnyObject = msg_send![class!(NSNumber), numberWithBool: Bool::new(on)];
            if k.is_null() || v.is_null() {
                return Err(other("could not build a default"));
            }
            let _: () = msg_send![dict, setObject: v, forKey: k];
        }
        let defaults: *mut AnyObject = msg_send![class!(NSUserDefaults), standardUserDefaults];
        if defaults.is_null() {
            return Err(other("no NSUserDefaults"));
        }
        let _: () = msg_send![defaults, registerDefaults: dict];
    }
    Ok(())
}

/// What the app's defaults answer for one of the editor's text keys, after `register_editor_text_defaults`.
#[cfg(target_os = "macos")]
pub fn editor_text_default(key: &std::ffi::CStr) -> Option<bool> {
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{class, msg_send};
    unsafe {
        let defaults: *mut AnyObject = msg_send![class!(NSUserDefaults), standardUserDefaults];
        let k: *mut AnyObject = msg_send![class!(NSString), stringWithUTF8String: key.as_ptr()];
        if defaults.is_null() || k.is_null() {
            return None;
        }
        let present: *mut AnyObject = msg_send![defaults, objectForKey: k];
        if present.is_null() {
            return None;
        }
        let on: Bool = msg_send![defaults, boolForKey: k];
        Some(on.as_bool())
    }
}

#[cfg(not(target_os = "macos"))]
pub fn register_editor_text_defaults() -> io::Result<()> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn install_terminate_hook(_handler: fn() -> Terminate) -> io::Result<()> {
    Err(io::Error::new(io::ErrorKind::Other, "not macOS"))
}
#[cfg(not(target_os = "macos"))]
pub fn terminate_hook_installed() -> bool {
    false
}
#[cfg(not(target_os = "macos"))]
pub fn reply_to_terminate(_allow: bool) {}

/// SIGTERM, SIGHUP and SIGINT only set a flag (the one thing a signal handler may safely do); the app polls
/// `take_quit_signal` and runs its ordinary close.
#[cfg(unix)]
static QUIT_SIGNAL: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[cfg(unix)]
extern "C" fn on_quit_signal(_sig: libc::c_int) {
    QUIT_SIGNAL.store(true, std::sync::atomic::Ordering::SeqCst);
}

#[cfg(unix)]
pub fn install_quit_signals() -> io::Result<()> {
    for sig in [libc::SIGTERM, libc::SIGHUP, libc::SIGINT] {
        let previous = unsafe { libc::signal(sig, on_quit_signal as extern "C" fn(libc::c_int) as libc::sighandler_t) };
        if previous == libc::SIG_ERR {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

/// True once if a quit signal arrived since the last call.
#[cfg(unix)]
pub fn take_quit_signal() -> bool {
    QUIT_SIGNAL.swap(false, std::sync::atomic::Ordering::SeqCst)
}

#[cfg(not(unix))]
pub fn install_quit_signals() -> io::Result<()> {
    Ok(())
}
#[cfg(not(unix))]
pub fn take_quit_signal() -> bool {
    false
}

// ---- Windows log-off and shutdown (Brief 22, ruling "Shutdown") ---------------------------------------------------
//
// Windows tells every program that a log-off or shutdown is coming (`WM_QUERYENDSESSION`) and, once it is certain,
// that it is happening (`WM_ENDSESSION`), after which it ends the program within seconds. A small hidden window on its
// own thread listens: on the query it starts the app's ordinary close (the same one as the red button) and says so to
// Windows; on the real thing it waits a few seconds, at most, for that close to finish. It never holds the shutdown up
// for longer than that, and a hung window is not waited for.

#[cfg(windows)]
static END_SESSION_HOOKS: std::sync::OnceLock<(fn(), fn() -> bool)> = std::sync::OnceLock::new();

/// How long a real log-off or shutdown waits for the close to finish. Windows allows a few seconds in all.
#[cfg(windows)]
const END_SESSION_WAIT_MS: u64 = 4000;

#[cfg(windows)]
unsafe extern "system" fn end_session_proc(
    hwnd: windows_sys::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows_sys::Win32::Foundation::WPARAM,
    lparam: windows_sys::Win32::Foundation::LPARAM,
) -> windows_sys::Win32::Foundation::LRESULT {
    use windows_sys::Win32::System::Shutdown::{ShutdownBlockReasonCreate, ShutdownBlockReasonDestroy};
    use windows_sys::Win32::UI::WindowsAndMessaging::{DefWindowProcW, WM_ENDSESSION, WM_QUERYENDSESSION};
    match msg {
        WM_QUERYENDSESSION => {
            let reason: Vec<u16> = "storyForge is saving your writing".encode_utf16().chain(std::iter::once(0)).collect();
            ShutdownBlockReasonCreate(hwnd, reason.as_ptr());
            if let Some((start_close, _)) = END_SESSION_HOOKS.get() {
                start_close();
            }
            1 // agree: the close is under way
        }
        WM_ENDSESSION => {
            if wparam != 0 {
                if let Some((_, is_done)) = END_SESSION_HOOKS.get() {
                    let started = std::time::Instant::now();
                    while !is_done() && started.elapsed() < std::time::Duration::from_millis(END_SESSION_WAIT_MS) {
                        std::thread::sleep(std::time::Duration::from_millis(25));
                    }
                }
            }
            ShutdownBlockReasonDestroy(hwnd);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

/// Starts the listener. `start_close` runs the app's ordinary close (it must be quick and must not block);
/// `is_done` says whether that close has finished.
#[cfg(windows)]
pub fn install_end_session_hook(start_close: fn(), is_done: fn() -> bool) -> io::Result<()> {
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{CreateWindowExW, DispatchMessageW, GetMessageW, RegisterClassW, TranslateMessage, MSG, WNDCLASSW};
    END_SESSION_HOOKS.set((start_close, is_done)).map_err(|_| io::Error::new(io::ErrorKind::Other, "the end-session hook is already installed"))?;
    std::thread::Builder::new().name("end-session".into()).spawn(|| unsafe {
        let class: Vec<u16> = "StoryForgeEndSession".encode_utf16().chain(std::iter::once(0)).collect();
        let instance = GetModuleHandleW(std::ptr::null());
        let mut wc: WNDCLASSW = std::mem::zeroed();
        wc.lpfnWndProc = Some(end_session_proc);
        wc.hInstance = instance;
        wc.lpszClassName = class.as_ptr();
        if RegisterClassW(&wc) == 0 {
            return;
        }
        // A hidden top-level window (a message-only window is not told about the end of the session).
        let hwnd = CreateWindowExW(0, class.as_ptr(), class.as_ptr(), 0, 0, 0, 0, 0, std::ptr::null_mut(), std::ptr::null_mut(), instance, std::ptr::null());
        if hwnd.is_null() {
            return;
        }
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    })?;
    Ok(())
}
