//! The only platform-specific code: the atomic swap and the exclusive rename. macOS has both
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
