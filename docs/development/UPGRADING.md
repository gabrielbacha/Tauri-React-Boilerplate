# Upgrading

## Dependencies

- JavaScript: `pnpm outdated`, then `pnpm update --interactive`. `.ncurc` keeps `@types/node` on the Node major in `.nvmrc`.
- Rust: `cargo update --manifest-path src-tauri/Cargo.toml` for compatible releases. Change versions in `Cargo.toml` for new minors.
- Keep `@tauri-apps/api` and the `tauri` crate on the same minor, and each `@tauri-apps/plugin-*` package on its crate's minor.
- `specta`, `specta-typescript`, and `tauri-specta` are release candidates pinned with `=`. Upgrade all three together, run `pnpm run bindings`, and review the diff of `src/shared/bindings.ts`.
- Rust toolchain: change `src-tauri/rust-toolchain.toml` and `rust-version` in `Cargo.toml` together.

After any upgrade run `pnpm run check`, `pnpm run package`, and `pnpm run smoke`.

## Pulling template changes

`template-origin.json` records the template revision your project started from. To bring in later template changes:

```bash
git remote add template https://github.com/gabrielbacha/Tauri-React-Boilerplate.git
git fetch template
git diff <recorded-revision> template/main -- src-tauri/src src/platform scripts .github
```

Apply the changes that matter to you, then run `pnpm run bindings` and `pnpm run check`. Identity files (`package.json`, `tauri.conf.json`, `Cargo.toml`) differ by design; merge them by hand.

## Stored data

Preferences, permissions, window state, and the database each carry a schema version. When an upgrade changes a stored shape, increment the version and add a migration. An older app refuses newer data instead of overwriting it, so users can move forward but not back.
