//! The editor's text defaults (decision 46): the Mac's own substitutions are off for this app and the spellcheck
//! underlines are on. macOS only; a no-op elsewhere.
#![cfg(target_os = "macos")]

use storyforge_fs::platform::{editor_text_default, register_editor_text_defaults, EDITOR_TEXT_DEFAULTS};

#[test]
fn registers_the_editor_defaults_as_ruled() {
    register_editor_text_defaults().unwrap();
    let answer = |key: &str| editor_text_default(&std::ffi::CString::new(key).unwrap());
    for off in ["WebAutomaticQuoteSubstitutionEnabled", "WebAutomaticDashSubstitutionEnabled", "WebAutomaticTextReplacementEnabled", "WebAutomaticSpellingCorrectionEnabled"] {
        assert_eq!(answer(off), Some(false), "{off} is off");
    }
    assert_eq!(answer("WebContinuousSpellCheckingEnabled"), Some(true), "the red underlines are on");
}

#[test]
fn registers_exactly_these_keys_and_nothing_global() {
    // The list is the whole of what is registered: four off, one on, all WebKit's own per-app keys.
    let keys: Vec<String> = EDITOR_TEXT_DEFAULTS.iter().map(|(k, _)| k.to_string_lossy().into_owned()).collect();
    assert_eq!(keys.len(), 5);
    assert!(keys.iter().all(|k| k.starts_with("Web")), "{keys:?}");
    // registerDefaults is in memory: a key we did not register has no answer.
    register_editor_text_defaults().unwrap();
    assert_eq!(editor_text_default(c"NSAutomaticQuoteSubstitutionEnabled"), None);
}

#[test]
fn registering_twice_is_harmless() {
    register_editor_text_defaults().unwrap();
    register_editor_text_defaults().unwrap();
    assert_eq!(editor_text_default(c"WebAutomaticDashSubstitutionEnabled"), Some(false));
}
