//! The command surface, as one dispatch over JSON. The Tauri commands and the test bridge
//! (`sf-bridge`, which lets the TypeScript contract tests drive this very code) both go through it, so
//! there is exactly one implementation of every command.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};

use crate::error::{FsError, FsResult};
use crate::ops::Project;

fn str_arg<'a>(args: &'a Value, key: &str) -> FsResult<&'a str> {
    args.get(key).and_then(Value::as_str).ok_or_else(|| FsError::new("UNKNOWN", format!("missing argument \"{key}\""), None))
}

fn opt_str<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(Value::as_str)
}

fn bytes_arg(args: &Value, text_key: &str, b64_key: &str) -> FsResult<Vec<u8>> {
    if let Some(t) = opt_str(args, text_key) {
        return Ok(t.as_bytes().to_vec());
    }
    let b = str_arg(args, b64_key)?;
    STANDARD.decode(b).map_err(|e| FsError::new("UNKNOWN", format!("bad base64: {e}"), None))
}

/// The commands that touch the project folder. `cmd` uses snake_case, arguments camelCase.
pub fn dispatch(project: &Project, cmd: &str, args: &Value) -> FsResult<Value> {
    match cmd {
        "scan" => Ok(json!(project.scan(opt_str(args, "dir"))?)),
        "stat" => Ok(json!(project.stat(str_arg(args, "path")?)?)),
        "read_text" => Ok(json!(project.read_text(str_arg(args, "path")?)?)),
        "read_binary" => Ok(json!(STANDARD.encode(project.read_bytes(str_arg(args, "path")?)?))),
        "read_outside" => Ok(json!(project.read_outside(str_arg(args, "path")?)?)),
        "write_text" => {
            let keys = args.get("keys").and_then(Value::as_array).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect());
            project.write_text(str_arg(args, "path")?, str_arg(args, "text")?, opt_str(args, "op").unwrap_or("write-file"), keys)?;
            Ok(Value::Null)
        }
        "write_binary" => {
            project.write_binary(str_arg(args, "path")?, &bytes_arg(args, "never", "data")?)?;
            Ok(Value::Null)
        }
        "create_file" => {
            project.create_file(opt_str(args, "op").unwrap_or("create-file"), str_arg(args, "path")?, &bytes_arg(args, "text", "data")?)?;
            Ok(Value::Null)
        }
        "create_folder" => {
            project.create_folder(str_arg(args, "path")?)?;
            Ok(Value::Null)
        }
        "compare_write" => Ok(json!(project.compare_write(str_arg(args, "op")?, str_arg(args, "path")?, str_arg(args, "expected")?, str_arg(args, "text")?)?)),
        "rename" => {
            project.rename(opt_str(args, "op").unwrap_or("rename"), str_arg(args, "from")?, str_arg(args, "to")?)?;
            Ok(Value::Null)
        }
        "download_placeholder" => Ok(json!(project.download_placeholder(str_arg(args, "path")?, crate::ops::DOWNLOAD_TIMEOUT)?)),
        "list_temp_leftovers" => Ok(json!(project.list_temp_leftovers()?)),
        "remove_temp" => {
            let expected = match (args.get("size").and_then(Value::as_u64), args.get("mtimeMs").and_then(Value::as_f64)) {
                (Some(s), Some(m)) => Some((s, m)),
                _ => None,
            };
            project.remove_temp(str_arg(args, "path")?, expected)?;
            Ok(Value::Null)
        }
        "read_cover" => {
            let target = args.get("target").cloned().unwrap_or(Value::Null);
            Ok(json!(STANDARD.encode(project.read_cover(&target, str_arg(args, "filename")?)?)))
        }
        "retire" => Ok(json!(project.retire(str_arg(args, "path")?)?)),
        other => Err(FsError::new("UNKNOWN", format!("unknown command {other}"), None)),
    }
}
