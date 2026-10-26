//! Guards the system-quit hook (docs/quit-paths.md) against a tao update that would silently undo it.
//! The hook adds `applicationShouldTerminate:` to tao's application delegate. That is only right while tao
//! does not answer it itself, so this pins the tao version the hook was proved against and checks tao's source.
use std::path::PathBuf;

const PROVED_AGAINST: &str = "0.37.1";

fn locked_tao_version() -> String {
    let lock = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.lock")).expect("Cargo.lock");
    let at = lock.find("name = \"tao\"\nversion = \"").expect("tao in Cargo.lock") + "name = \"tao\"\nversion = \"".len();
    lock[at..].split('"').next().unwrap().to_string()
}

#[test]
fn tao_is_the_version_the_quit_hook_was_proved_against() {
    assert_eq!(
        locked_tao_version(),
        PROVED_AGAINST,
        "tao changed. Check its app delegate for applicationShouldTerminate:, run `npm run test:quit`, then update PROVED_AGAINST in test/quit_hook.rs"
    );
}

#[test]
fn tao_does_not_answer_should_terminate_itself() {
    let home = std::env::var("CARGO_HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from(std::env::var("HOME").unwrap()).join(".cargo"));
    let registry = home.join("registry/src");
    let Ok(indexes) = std::fs::read_dir(&registry) else { return };
    for index in indexes.flatten() {
        let delegate = index.path().join(format!("tao-{PROVED_AGAINST}/src/platform_impl/macos/app_delegate.rs"));
        if let Ok(source) = std::fs::read_to_string(&delegate) {
            assert!(source.contains("applicationWillTerminate"), "tao's delegate layout changed; recheck the quit hook");
            assert!(!source.contains("applicationShouldTerminate"), "tao now answers applicationShouldTerminate:; our hook would be shadowed or refused");
            return;
        }
    }
}
