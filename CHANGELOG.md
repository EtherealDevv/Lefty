# Changelog

## 1.3.0 — 2026-10-03
- Engine: fixed hotkey dead after manual Activate (singleton self-kill via
  taskkill + zombie parent-watcher missing WM_QUIT); `start_engine` now reaps
  orphans and respawns dead children
- Settings redesigned with sidebar tabs: General, Appearance, Input, Profiles, About
- Accent Color: 10 presets + custom picker, whole M3 theme regenerates from seed
- Add Mapping validation: duplicate sources and self-maps blocked inline
- Profile Import/Export to `.json` with merge or replace modes
- Interface sounds: synthesized activate/pause chimes (no Windows sounds)

## 1.1.0 — 2026-09-02
- low-level port (WH_KEYBOARD_LL, SendInput, wScan, SINGLEKEY_FLAG)
- Rust engine 0.02ms TIME_CRITICAL, no GIL
- Tauri + React + Tailwind, LASK icon, By Sycho
- 105 keys LATAM/US, Capture via low-level hook, F6 global toggle
- Tray (close to tray, left-click show, right-click Close)
- Persist profiles/localStorage + engine_mappings.json
- MSI/NSIS installers (C:\Program Files\Lefty)

## 1.0.0 — Initial
- Python Lefty with Material You 3
