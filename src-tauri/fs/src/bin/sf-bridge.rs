//! A line-oriented bridge to the file-system commands, for tests only: the TypeScript backend
//! contract tests run the very same Rust code the app runs. Not part of the app bundle.
//!
//! Protocol, one JSON object per line on stdin, one per line on stdout:
//!   {"open": "<absolute folder>", "readOnly": false}                  -> {"ok": true}
//!   {"id": 1, "cmd": "read_text", "args": {"path": "a.md"}}           -> {"id": 1, "ok": <value>} | {"id": 1, "err": {...}}
use std::io::{BufRead, Write};
use storyforge_fs::api::dispatch;
use storyforge_fs::ops::Project;

fn main() {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout().lock();
    let mut project: Option<Project> = None;
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let msg: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                let _ = writeln!(out, "{}", serde_json::json!({ "err": { "code": "UNKNOWN", "message": e.to_string() } }));
                continue;
            }
        };
        let reply = if let Some(root) = msg.get("open").and_then(|v| v.as_str()) {
            match Project::open(std::path::Path::new(root), msg.get("readOnly").and_then(|v| v.as_bool()).unwrap_or(false)) {
                Ok(p) => {
                    project = Some(p);
                    serde_json::json!({ "ok": true })
                }
                Err(e) => serde_json::json!({ "err": e }),
            }
        } else {
            let id = msg.get("id").cloned().unwrap_or(serde_json::Value::Null);
            let cmd = msg.get("cmd").and_then(|v| v.as_str()).unwrap_or("");
            let args = msg.get("args").cloned().unwrap_or(serde_json::Value::Null);
            match project.as_ref() {
                None => serde_json::json!({ "id": id, "err": { "code": "UNKNOWN", "message": "no project open" } }),
                Some(p) => match dispatch(p, cmd, &args) {
                    Ok(v) => serde_json::json!({ "id": id, "ok": v }),
                    Err(e) => serde_json::json!({ "id": id, "err": e }),
                },
            }
        };
        let _ = writeln!(out, "{reply}");
        let _ = out.flush();
    }
}
