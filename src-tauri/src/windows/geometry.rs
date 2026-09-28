//! Window placement that survives display changes. All values are logical pixels.

use serde::{Deserialize, Serialize};

pub const MIN_WIDTH: f64 = 760.0;
pub const MIN_HEIGHT: f64 = 540.0;
const MIN_VISIBLE: f64 = 80.0;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub is_maximized: bool,
}

pub const DEFAULT_WINDOW_STATE: WindowState =
    WindowState { x: 80.0, y: 80.0, width: 1120.0, height: 720.0, is_maximized: false };

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Keep a saved placement only when it is a sane size and at least 80×80 px of it is on a display.
pub fn normalize(state: Option<WindowState>, displays: &[Rect]) -> WindowState {
    let Some(state) = state.filter(is_sane) else {
        return DEFAULT_WINDOW_STATE;
    };
    let visible = displays.iter().any(|display| {
        let overlap_x = (state.x + state.width).min(display.x + display.width) - state.x.max(display.x);
        let overlap_y = (state.y + state.height).min(display.y + display.height) - state.y.max(display.y);
        overlap_x >= MIN_VISIBLE && overlap_y >= MIN_VISIBLE
    });
    if visible { state } else { DEFAULT_WINDOW_STATE }
}

fn is_sane(state: &WindowState) -> bool {
    [state.x, state.y, state.width, state.height].iter().all(|value| value.is_finite())
        && state.width >= 640.0
        && state.height >= 480.0
}

#[cfg(test)]
mod tests {
    use super::*;

    const DISPLAY: Rect = Rect { x: 0.0, y: 0.0, width: 1440.0, height: 900.0 };

    fn state(x: f64, y: f64) -> WindowState {
        WindowState { x, y, width: 1000.0, height: 700.0, is_maximized: false }
    }

    #[test]
    fn keeps_visible_windows() {
        assert_eq!(normalize(Some(state(100.0, 100.0)), &[DISPLAY]), state(100.0, 100.0));
        assert_eq!(normalize(Some(state(1360.0, 820.0)), &[DISPLAY]), state(1360.0, 820.0));
    }

    #[test]
    fn resets_windows_that_left_every_display() {
        assert_eq!(normalize(Some(state(1400.0, 100.0)), &[DISPLAY]), DEFAULT_WINDOW_STATE);
        assert_eq!(normalize(Some(state(3000.0, 100.0)), &[DISPLAY]), DEFAULT_WINDOW_STATE);
    }

    #[test]
    fn resets_invalid_sizes() {
        let tiny = WindowState { width: 300.0, ..state(10.0, 10.0) };
        assert_eq!(normalize(Some(tiny), &[DISPLAY]), DEFAULT_WINDOW_STATE);
        let broken = WindowState { x: f64::NAN, ..state(10.0, 10.0) };
        assert_eq!(normalize(Some(broken), &[DISPLAY]), DEFAULT_WINDOW_STATE);
        assert_eq!(normalize(None, &[DISPLAY]), DEFAULT_WINDOW_STATE);
    }
}
