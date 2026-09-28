//! Application entry: plugin order, state, the typed bridge, and event routing. Logic lives in modules.

pub mod app_config;
pub mod application;
pub mod commands;
pub mod commands_registry;
pub mod database;
pub mod deep_links;
pub mod diagnostics;
pub mod dialogs;
pub mod documents;
pub mod error;
pub mod events;
pub mod features;
pub mod interruption;
pub mod ipc;
pub mod known_links;
pub mod menu;
pub mod navigation;
pub mod permissions;
pub mod preferences;
pub mod shutdown;
pub mod state;
pub mod storage;
pub mod tasks;
pub mod updater;
pub mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bridge = ipc::builder();
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // Single instance must be registered first so a second launch exits before opening storage.
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| application::on_second_instance(app, &argv)))
            .plugin(tauri_plugin_deep_link::init())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(navigation::plugin())
        .invoke_handler(bridge.invoke_handler())
        .setup(move |app| {
            bridge.mount_events(app);
            #[cfg(debug_assertions)]
            tauri::Manager::add_capability(app, include_str!("../capabilities-dev/debug.json"))?;
            application::setup(app)
        })
        .on_page_load(application::on_page_load)
        .on_window_event(application::on_window_event)
        .on_menu_event(menu::handle)
        .build(tauri::generate_context!())
        .unwrap_or_else(|error| {
            eprintln!("Unable to start the application: {error}");
            std::process::exit(1);
        })
        .run(|app, event| application::on_run_event(app, &event));
}
