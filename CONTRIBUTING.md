# Contributing to Lefty

Thanks for helping left-handed gamers!

## Build

```bash
# Engine (Rust, 0.02ms)
cd engine_native
cargo build --release

# UI (Tauri + React)
cd tauri-app
npm install
npm run tauri dev      # dev with hot reload
npm run tauri build    # release MSI + setup.exe in src-tauri/target/release/bundle/
```

Requirements: Rust 1.77+, Node 18+, Windows 10/11, WebView2.

## Structure

- `core/` — keys, profiles (VK_MAP 105 LATAM)
- `engine/` — Python fallback remapper
- `engine_native/` — Rust engine (WH_KEYBOARD_LL, SendInput, TIME_CRITICAL)
- `tauri-app/` — React + Tailwind + Tauri

## Pull Requests

- Keep UI `LASK` + `12-col` distribution
- Keep `F6` global toggle and `tray` behavior
- Test `Ñ` `'` `´` `~` LATAM with `Capture` before PR
- Run `cargo check` in `engine_native` and `tauri-app/src-tauri`

## Issues

Use templates: `bug_report.md` / `feature_request.md`.
