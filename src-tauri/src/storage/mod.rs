//! Profile layout, crash-safe writes, and versioned JSON settings stores.

pub mod atomic;
pub mod bootstrap;
pub mod json_store;

/// Increment when a store's migration changes its on-disk schema.
pub mod versions {
    pub const PREFERENCES: u32 = 6;
    pub const PERMISSIONS: u32 = 1;
    pub const WINDOW_STATE: u32 = 0;

    pub const ALL: [(&str, u32); 3] =
        [("preferences", PREFERENCES), ("permissions", PERMISSIONS), ("window-state", WINDOW_STATE)];
}
