//! The native application menu on macOS, built from the command registry and saved shortcuts.
//!
//! Windows and Linux windows are frameless, so they show the in-window app menu and the web interface
//! handles the same shortcuts.

use tauri::menu::{Menu, MenuEvent, MenuItemBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Manager, Runtime};

use crate::app_config::PRODUCT_NAME;
use crate::application;
use crate::commands_registry::{
    CommandId, ShortcutOverrides, accelerator, command_available, effective_binding, spec_of,
};
use crate::known_links::KnownDestination;
use crate::state::AppState;

const QUIT: &str = "quit";
const DESTINATION_PREFIX: &str = "destination:";

/// Rebuild the menu after shortcuts change or recording starts or stops. No-op outside macOS.
pub fn install<R: Runtime>(app: &AppHandle<R>) {
    if !cfg!(target_os = "macos") {
        return;
    }
    let state = app.state::<AppState>();
    let shortcuts = state.preferences.get().shortcuts;
    let recording = state.windows().recording();
    match build(app, &shortcuts, recording, state.packaged) {
        Ok(menu) => {
            if let Err(error) = app.set_menu(menu) {
                log::error!("Unable to install the application menu: {error}");
            }
        }
        Err(error) => log::error!("Unable to build the application menu: {error}"),
    }
}

fn build<R: Runtime>(
    app: &AppHandle<R>,
    shortcuts: &ShortcutOverrides,
    recording: bool,
    packaged: bool,
) -> tauri::Result<Menu<R>> {
    // While a window records a shortcut, accelerators are removed so key presses reach the recorder.
    let item = |id: CommandId| {
        let spec = spec_of(id);
        let key = serde_json::to_value(id).ok().and_then(|value| value.as_str().map(str::to_owned)).unwrap_or_default();
        let mut builder = MenuItemBuilder::with_id(key, spec.label);
        if let Some(binding) = effective_binding(id, shortcuts).filter(|_| !recording) {
            builder = builder.accelerator(accelerator(&binding));
        }
        builder.build(app)
    };
    let mut quit = MenuItemBuilder::with_id(QUIT, format!("Quit {PRODUCT_NAME}"));
    if !recording {
        quit = quit.accelerator("CmdOrCtrl+Q");
    }
    let quit = quit.build(app)?;
    let app_menu = SubmenuBuilder::new(app, PRODUCT_NAME)
        .item(&item(CommandId::About)?)
        .item(&item(CommandId::Settings)?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&quit)
        .build()?;
    let mut file = SubmenuBuilder::new(app, "File").item(&item(CommandId::NewWindow)?);
    for id in
        [CommandId::ImportText, CommandId::ExportText, CommandId::SaveSession, CommandId::HashFile, CommandId::Share]
    {
        if command_available(id, packaged) {
            file = file.item(&item(id)?);
        }
    }
    let edit = SubmenuBuilder::new(app, "Edit").undo().redo().separator().cut().copy().paste().select_all().build()?;
    let mut view = SubmenuBuilder::new(app, "View");
    for id in [
        CommandId::Workspace,
        CommandId::ToggleSidebar,
        CommandId::ToggleDetails,
        CommandId::CommandPalette,
        CommandId::Shortcuts,
    ] {
        view = view.item(&item(id)?);
    }
    view = view
        .separator()
        .item(&item(CommandId::ZoomIn)?)
        .item(&item(CommandId::ZoomOut)?)
        .item(&item(CommandId::ZoomReset)?);
    if command_available(CommandId::Reload, packaged) {
        view = view.separator().item(&item(CommandId::Reload)?);
    }
    let window = SubmenuBuilder::new(app, "Window").minimize().maximize().separator().close_window().build()?;
    let mut help = SubmenuBuilder::new(app, "Help");
    for id in [CommandId::CheckUpdates, CommandId::CopyDiagnostics, CommandId::OpenLogs] {
        help = help.item(&item(id)?);
    }
    help = help.separator();
    for destination in KnownDestination::ALL {
        help = help.item(
            &MenuItemBuilder::with_id(format!("{DESTINATION_PREFIX}{}", destination.key()), destination.label())
                .build(app)?,
        );
    }
    let submenus: [Submenu<R>; 6] = [app_menu, file.build()?, edit, view.build()?, window, help.build()?];
    Menu::with_items(
        app,
        &submenus.iter().map(|submenu| submenu as &dyn tauri::menu::IsMenuItem<R>).collect::<Vec<_>>(),
    )
}

/// Route a menu click: quit and new window run in Rust, everything else goes to the current window.
pub fn handle<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    if id == QUIT {
        application::request_quit(app);
        return;
    }
    if let Some(key) = id.strip_prefix(DESTINATION_PREFIX) {
        if let Some(destination) = KnownDestination::ALL.into_iter().find(|destination| destination.key() == key) {
            application::open_destination(app, destination);
        }
        return;
    }
    let Ok(command) = serde_json::from_value::<CommandId>(serde_json::Value::String(id.to_owned())) else {
        return;
    };
    if command == CommandId::NewWindow {
        if let Err(error) = application::create_window(app, None) {
            log::error!("Unable to open a window: {error}");
        }
        return;
    }
    application::run_command_in_current_window(app, command);
}
