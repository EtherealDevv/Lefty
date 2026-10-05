# Changelog

## 1.4.0 — 2026-10-05
- Complete researched profiles: IJKL (22 binds), Arrows (17), Numpad 8456 (20),
  OKL; Mirror (23); one-time factory migration for existing users
- Fixed silent key-name resolution (frontend aliases + case-insensitive match,
  covered by Rust tests)
- Profile CRUD: create on Save, rename, duplicate, delete, reorder, Lucide icons
- Settings sidebar, accent themes, interface sounds, share-code import/export
- Engine hardening: no zombie/self-kill states, orphan reap, hidden consoles
- Instant toggle, deterministic startup, launch options, auto-switch per game
- Live engine latency readout, gamer-focus mode, update checker, guided tour
- Engine: fixed hotkey dead after manual Activate (singleton self-kill via
  taskkill + zombie parent-watcher missing WM_QUIT); `start_engine` now reaps
  orphans and respawns dead children
- Settings redesigned with sidebar tabs: General, Appearance, Input, Profiles, About
- Accent Color: 10 presets + custom picker, whole M3 theme regenerates from seed
- Add Mapping validation: duplicate sources and self-maps blocked inline
- Profile Import/Export to `.json` with merge or replace modes
- Interface sounds: synthesized activate/pause chimes
- Engine latency pack: batched SendInput, 1 ms timer resolution, no power
  throttling, plus live per-second latency readout in Settings → About
- Latency claims replaced by "low latency", verifiable live in-app

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
