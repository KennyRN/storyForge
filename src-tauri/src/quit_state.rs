//! The quit bookkeeping (docs/quit-paths.md): one close at a time, one exit, one reply to macOS. Pure atomics, no
//! Tauri, so the rules are unit-tested here.
use std::sync::atomic::{AtomicBool, Ordering};

/// What the way out must do, decided once.
#[derive(Debug, PartialEq, Eq)]
pub enum Finish {
    /// Already taken (by `quit_ready` or the watchdog): do nothing.
    Skip,
    /// Exit the app.
    Exit,
    /// macOS is waiting on a "later" termination: reply to it (the reply ends the app; never also exit).
    Reply,
}

#[derive(Default)]
pub struct QuitState {
    /// Set when the way out was taken: only then may a close or exit request pass.
    ok: AtomicBool,
    /// A close is under way: a second request joins it.
    closing: AtomicBool,
    /// macOS asked to terminate and was told "later".
    terminate_pending: AtomicBool,
    /// The way out has been taken.
    done: AtomicBool,
}

impl QuitState {
    pub fn is_ok(&self) -> bool {
        self.ok.load(Ordering::SeqCst)
    }

    /// A request to close. True for the first (it starts the close); false for any later one (it joins).
    pub fn begin_close(&self) -> bool {
        !self.closing.swap(true, Ordering::SeqCst)
    }

    /// `applicationShouldTerminate:`. Returns `(quit now, start a close)`. A request mid-close joins it.
    pub fn on_terminate(&self) -> (bool, bool) {
        self.terminate_pending.store(true, Ordering::SeqCst);
        if self.done.load(Ordering::SeqCst) {
            return (true, false);
        }
        (false, self.begin_close())
    }

    /// A request to close (Cmd+Q, the red button, a signal): runs `start_close` if, and only if, it is the first.
    /// Returns whether it started the close. This is the function the app calls, so the close starting is tested here.
    pub fn request_close(&self, start_close: impl FnOnce()) -> bool {
        let first = self.begin_close();
        if first {
            start_close();
        }
        first
    }

    /// `applicationShouldTerminate:` (the Dock's Quit, Log Out, Shut Down): runs `start_close` if no close is under
    /// way, and says whether macOS may quit now (only after the way out was taken). Never does both nothing and "later".
    pub fn terminate_request(&self, start_close: impl FnOnce()) -> bool {
        let (now, start) = self.on_terminate();
        if start {
            start_close();
        }
        now
    }

    /// The one way out. Whichever of `quit_ready` and the watchdog gets here first decides; the other gets `Skip`.
    pub fn finish(&self) -> Finish {
        if self.done.swap(true, Ordering::SeqCst) {
            return Finish::Skip;
        }
        self.ok.store(true, Ordering::SeqCst);
        if self.terminate_pending.load(Ordering::SeqCst) {
            Finish::Reply
        } else {
            Finish::Exit
        }
    }

    pub fn is_done(&self) -> bool {
        self.done.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_termination_mid_close_joins_it_and_macos_gets_one_reply() {
        let q = QuitState::default();
        assert!(q.begin_close()); // Cmd+Q starts the close
        assert_eq!(q.on_terminate(), (false, false)); // the Dock arrives: "later", and no second close
        assert_eq!(q.on_terminate(), (false, false)); // and again
        assert_eq!(q.finish(), Finish::Reply); // quit_ready: the single reply
        assert_eq!(q.finish(), Finish::Skip); // the watchdog loses the race: no second reply
        assert!(q.is_ok());
    }

    #[test]
    fn a_dock_quit_with_no_close_under_way_starts_the_close_exactly_once() {
        // The regression: the hook won `begin_close` and then asked `request_close`, which saw a close under way and
        // did nothing, so the window was never told and macOS waited for ever.
        let q = QuitState::default();
        let mut started = 0;
        assert!(!q.terminate_request(|| started += 1), "not quit yet: the close must run first");
        assert_eq!(started, 1, "the close must actually start");
        assert!(!q.terminate_request(|| started += 1));
        assert!(!q.request_close(|| started += 1)); // a signal, joining
        assert_eq!(started, 1, "and never a second");
        assert_eq!(q.finish(), Finish::Reply);
    }

    #[test]
    fn cmd_q_then_the_dock_starts_one_close() {
        let q = QuitState::default();
        let mut started = 0;
        assert!(q.request_close(|| started += 1));
        assert!(!q.terminate_request(|| started += 1));
        assert_eq!(started, 1);
    }

    #[test]
    fn a_first_termination_starts_the_close() {
        let q = QuitState::default();
        assert_eq!(q.on_terminate(), (false, true));
        assert!(!q.begin_close()); // a signal now joins
        assert_eq!(q.finish(), Finish::Reply);
    }

    #[test]
    fn without_a_termination_the_way_out_is_an_exit_taken_once() {
        let q = QuitState::default();
        assert!(q.begin_close());
        assert_eq!(q.finish(), Finish::Exit);
        assert_eq!(q.finish(), Finish::Skip);
    }

    #[test]
    fn a_termination_after_the_way_out_may_quit_at_once() {
        let q = QuitState::default();
        q.finish();
        assert_eq!(q.on_terminate(), (true, false));
    }
}
