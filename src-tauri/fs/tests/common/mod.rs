//! Test helpers shared by the integration tests.
use std::io;
use std::path::Path;

/// A link from `link` to the folder `target`: a symbolic link on Unix, a directory junction on Windows (a symbolic
/// link there needs a right most people do not have; a junction needs none, and it is what OneDrive and some tools make).
#[cfg(unix)]
pub fn link_dir(target: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(windows)]
pub fn link_dir(target: &Path, link: &Path) -> io::Result<()> {
    let status = std::process::Command::new("cmd").arg("/C").arg("mklink").arg("/J").arg(link).arg(target).output()?;
    if status.status.success() {
        Ok(())
    } else {
        Err(io::Error::new(io::ErrorKind::Other, String::from_utf8_lossy(&status.stdout).to_string()))
    }
}
