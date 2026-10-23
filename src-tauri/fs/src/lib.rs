//! storyForge's file-system side. Everything that decides whether, and how, the project folder may be
//! touched lives here, free of any window or Tauri types, so it is tested on Linux CI as well as macOS.
pub mod containment;
pub mod guard;
pub mod paths;
