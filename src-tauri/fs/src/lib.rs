//! storyForge's file-system side. Everything that decides whether, and how, the project folder may be
//! touched lives here, free of any window or Tauri types, so it is tested on Linux CI as well as macOS.
pub mod api;
pub mod containment;
pub mod error;
pub mod format;
pub mod machine;
pub mod platform;
pub mod guard;
pub mod ops;
pub mod paths;
