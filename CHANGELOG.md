# Changelog

## 1.7.1 — 2026-10-06
- Hotfix: offline-first fonts (blank window without internet fixed)

## 1.7.0 — 2026-10-06
- In-app updater: notice banner, release notes, download and install without a browser
- Combo hold semantics: hold to hold (PTT-ready), auto-repeat ignored, anti-stuck failsafes
- Graceful engine shutdown: releases every key before exit, no stuck keys on pause/quit
- Reset all data (Settings → About, double-click to confirm)
- Elevation warning with restart-as-admin; update spinner wired
- Tour: dedicated combos step, symmetric Add layout, mouse capture mention
- Fixed-height Settings and Edit windows (no more jumping, scroll inside)
- Game browser at root (single scroll), Steam/Epic only, armed capture flow
- Code health: no dead code, no new warnings

## 1.6.0 — 2026-10-06
- Combo targets: any key to Ctrl/Shift/Alt/Win + key (`I→Ctrl+S`)
- Mouse side buttons as sources (`MOUSE_X1`/`MOUSE_X2`, capturable with a click)
- Unified Games list per profile (auto-switch + auto-play from one list)
- Esc closes dialogs top-down (tour, deletes, browser, Add, Edit, Settings)
- Share codes carry combos; JSON files retired (share codes only)
- Updated tour (mouse capture, games)

## 1.5.0 — 2026-10-05
- Per-profile accent color with live preview (falls back to global, shared in codes)
- High-contrast mode (auto-adjusts accent to ≥4.5:1 legibility)
- Pause individual mappings without deleting (engine gets active ones only)
- Games list per profile: auto-switches and works only there (empty = manual)
- Game recommendations: browse installed Steam/Epic games with covers, or capture the app in focus
- Faster, adaptive focus poll (250ms when watched, 2s idle) with stable-focus debounce
- Automatic backups before import/restore, one-click restore
- Share-code import preview with merge/replace confirm
- Live key tester in Add mapping (what the game sees, paused-aware)
- Tabbed profile editor (General/Appearance/Automation) with live sidebar preview
- Tray menu: switch profiles and pause/resume without opening the window
- Hotkey anti-repeat debounce in engine; auto toggles are silent (chime stays manual-only)
- Fixed double-toggle at startup (stale toggle file vs launch preference)
- Hotfixes: no toggle bursts when holding the hotkey; stable focus transitions (settle/debounce, manual control always wins)
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
