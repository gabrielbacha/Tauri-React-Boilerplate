#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseAction {
    /// Close immediately.
    Allow,
    /// Keep work alive: the last window on Windows and Linux quits through the quit flow instead.
    Quit,
    /// Ask about unsaved work in this window first.
    Confirm,
}

/// Decide what a close request does. macOS keeps the app running after its last window closes.
#[allow(clippy::fn_params_excessive_bools, reason = "each flag is an independent fact about the window")]
pub fn close_action(mac: bool, quitting: bool, close_allowed: bool, last_window: bool, dirty: bool) -> CloseAction {
    if quitting || close_allowed {
        return CloseAction::Allow;
    }
    if !mac && last_window {
        return CloseAction::Quit;
    }
    if dirty { CloseAction::Confirm } else { CloseAction::Allow }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quitting_or_confirmed_windows_close() {
        assert_eq!(close_action(false, true, false, true, true), CloseAction::Allow);
        assert_eq!(close_action(true, false, true, false, true), CloseAction::Allow);
    }

    #[test]
    fn last_window_quits_outside_macos() {
        assert_eq!(close_action(false, false, false, true, false), CloseAction::Quit);
        assert_eq!(close_action(true, false, false, true, false), CloseAction::Allow);
    }

    #[test]
    fn dirty_windows_confirm() {
        assert_eq!(close_action(true, false, false, true, true), CloseAction::Confirm);
        assert_eq!(close_action(false, false, false, false, true), CloseAction::Confirm);
        assert_eq!(close_action(false, false, false, false, false), CloseAction::Allow);
    }
}
