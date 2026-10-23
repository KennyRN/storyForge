//! Machine settings: things that only make sense on this computer, kept in the app's data folder
//! (on macOS `~/Library/Application Support/io.github.kennyrn.storyforge/`), never in a project.
//! The window can only read and write a short allow-list of names; each is one JSON file.
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::error::{FsError, FsResult};

pub struct MachineStore {
    dir: PathBuf,
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// `window`, `recent`, `snapshots/<sha256 of a project path>`, `project-ui/<sha256 of a project path>`.
pub fn is_allowed_name(name: &str) -> bool {
    match name.split_once('/') {
        None => name == "window" || name == "recent",
        Some((folder, key)) => (folder == "snapshots" || folder == "project-ui") && is_hex64(key),
    }
}

impl MachineStore {
    pub fn new(dir: &Path) -> MachineStore {
        MachineStore { dir: dir.to_path_buf() }
    }

    fn file(&self, name: &str) -> FsResult<PathBuf> {
        if !is_allowed_name(name) {
            return Err(FsError::forbidden("not a machine-settings name", name));
        }
        Ok(self.dir.join(format!("{name}.json")))
    }

    pub fn get(&self, name: &str) -> FsResult<Option<String>> {
        let path = self.file(name)?;
        match fs::read_to_string(&path) {
            Ok(t) => Ok(Some(t)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(FsError::from_io(&e, name)),
        }
    }

    /// Atomic: a temp file, then a rename.
    pub fn set(&self, name: &str, text: &str) -> FsResult<()> {
        let path = self.file(name)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| FsError::from_io(&e, name))?;
        }
        let tmp = path.with_extension(format!("json.{}.tmp", std::process::id()));
        let result = (|| -> std::io::Result<()> {
            let mut f = OpenOptions::new().write(true).create(true).truncate(true).open(&tmp)?;
            f.write_all(text.as_bytes())?;
            f.sync_all()?;
            fs::rename(&tmp, &path)
        })();
        if let Err(e) = result {
            let _ = fs::remove_file(&tmp);
            return Err(FsError::from_io(&e, name));
        }
        Ok(())
    }
}
