use serde::Serialize;
use std::io;

/// An error the window can understand. `code` mirrors the TypeScript `BackendErrorCode`, plus
/// `FORBIDDEN` (the guard refused) and `READONLY` (the project is open read-only).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FsError {
    pub code: String,
    pub message: String,
    pub path: Option<String>,
}

impl FsError {
    pub fn new(code: &str, message: impl Into<String>, path: Option<&str>) -> FsError {
        FsError { code: code.to_string(), message: message.into(), path: path.map(str::to_string) }
    }
    pub fn forbidden(message: impl Into<String>, path: &str) -> FsError {
        FsError::new("FORBIDDEN", message, Some(path))
    }
    pub fn from_io(err: &io::Error, path: &str) -> FsError {
        let code = match err.kind() {
            io::ErrorKind::NotFound => "ENOENT",
            io::ErrorKind::AlreadyExists => "EEXIST",
            io::ErrorKind::PermissionDenied => "EACCES",
            _ => match err.raw_os_error() {
                Some(20) => "ENOTDIR",
                Some(21) => "EISDIR",
                Some(66) => "EEXIST", // ENOTEMPTY on macOS
                Some(39) => "EEXIST", // ENOTEMPTY on Linux
                _ => "UNKNOWN",
            },
        };
        FsError::new(code, err.to_string(), Some(path))
    }
}

impl std::fmt::Display for FsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

pub type FsResult<T> = Result<T, FsError>;
