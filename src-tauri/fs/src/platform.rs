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

#[cfg(not(target_os = "macos"))]
pub fn rename_excl(_from: &Path, _to: &Path) -> io::Result<bool> {
    Ok(false)
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

#[cfg(not(target_os = "macos"))]
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
