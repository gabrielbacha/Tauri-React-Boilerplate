#![allow(clippy::expect_used, clippy::unwrap_used)]

use std::collections::BTreeMap;
use std::path::Path;
use std::{env, fs};

use serde::Deserialize;

/// Identity shared with the frontend and release scripts. `package.json` is the single source.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackageJson {
    product_name: String,
    description: String,
    app_config: AppConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    app_id: String,
    protocol: String,
    storage_namespace: String,
    destinations: BTreeMap<String, String>,
    variant: String,
}

const PERMISSIONS: &str = "permissions/app-commands.toml";
const DESTINATIONS: [&str; 4] = ["repository", "documentation", "license", "support"];

fn main() {
    println!("cargo::rerun-if-changed=../package.json");
    println!("cargo::rerun-if-changed={PERMISSIONS}");
    println!("cargo::rustc-check-cfg=cfg(showcase)");

    let package: PackageJson =
        serde_json::from_str(&fs::read_to_string("../package.json").expect("read ../package.json"))
            .expect("package.json must contain productName, description, and appConfig");
    let config = package.app_config;
    assert!(matches!(config.variant.as_str(), "showcase" | "clean"), "appConfig.variant must be showcase or clean");
    if config.variant == "showcase" {
        println!("cargo::rustc-cfg=showcase");
    }

    let destinations = DESTINATIONS
        .iter()
        .map(|id| {
            let url = config.destinations.get(*id).unwrap_or_else(|| panic!("appConfig.destinations.{id} is missing"));
            format!("({id:?}, {url:?})")
        })
        .collect::<Vec<_>>()
        .join(", ");
    let generated = format!(
        "pub const PRODUCT_NAME: &str = {:?};\n\
         pub const DESCRIPTION: &str = {:?};\n\
         pub const APP_ID: &str = {:?};\n\
         pub const PROTOCOL: &str = {:?};\n\
         pub const STORAGE_NAMESPACE: &str = {:?};\n\
         pub const DESTINATIONS: [(&str, &str); {}] = [{destinations}];\n",
        package.product_name,
        package.description,
        config.app_id,
        config.protocol,
        config.storage_namespace,
        DESTINATIONS.len(),
    );
    let out = Path::new(&env::var("OUT_DIR").expect("OUT_DIR")).join("app_config.rs");
    fs::write(out, generated).expect("write app_config.rs");

    // Every app command is denied unless a capability grants its `allow-*` permission.
    let commands: Vec<&'static str> = app_commands().into_iter().map(|name| &*name.leak()).collect();
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(commands.leak())),
    )
    .expect("tauri build");
}

/// Command names come from the `allow-*` entries in the permission file, so it stays the single list.
fn app_commands() -> Vec<String> {
    let source = fs::read_to_string(PERMISSIONS).expect("read app command permissions");
    source.split('"').filter_map(|token| token.strip_prefix("allow-")).map(|name| name.replace('-', "_")).collect()
}
