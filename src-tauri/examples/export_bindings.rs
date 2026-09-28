//! Write the TypeScript bindings: `cargo run --example export_bindings -- <output.ts>`.

fn main() {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: export_bindings <output.ts>");
        std::process::exit(2);
    };
    if let Err(error) = tauri_app_lib::ipc::export(std::path::Path::new(&path)) {
        eprintln!("Unable to export bindings: {error}");
        std::process::exit(1);
    }
}
