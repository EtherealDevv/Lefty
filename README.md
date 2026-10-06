![Banner](assets/banner.jpg)

# Lefty

Remap any key for left-handed gaming. Low latency, native Rust engine.

![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat)
![Latency](https://img.shields.io/badge/Latency-low-success?style=flat)
![Rust](https://img.shields.io/badge/Rust-Tauri-orange?style=flat)
![Downloads](https://img.shields.io/github/downloads/EtherealDevv/Lefty/total?style=flat)
[![Telegram](https://img.shields.io/badge/Telegram-Join_Channel-26A5E1?style=flat&logo=telegram&logoColor=white)](https://t.me/+kOXrV-lOGxIyYzkx)

## What is it?

- **WASD → IJKL** (or arrows, numpad) for left-hand movement
- Map any key to any other: `I→W`, `Q→U`, `Caps→Ctrl`, `Win→Disabled` — or combos like `I→Ctrl+S`
- Mouse side buttons as sources: `MOUSE_X1→R`, capturable with a click
- Profiles you can create, rename, duplicate, reorder and delete (Lucide icons, tabbed editor)
- Games list per profile: auto-switches and works only in your games (empty = manual)
- Game recommendations: browse installed Steam/Epic games with covers, or capture the app in focus
- Pause individual mappings without deleting them
- Add-mapping validation: duplicate sources and self-maps are blocked inline
- Live key tester: see what the game receives before saving
- Accent Color themes: 10 presets + custom picker, per-profile override, high-contrast mode (Settings → Appearance)
- Share profiles with compact codes (`⋯ → Share`), review before importing, automatic backups
- Interface sounds: distinct chimes for activate vs pause (Settings → General)
- Gaming focus: Sticky/Filter key popups stay silent while active
- Tray menu: switch profiles and pause/resume without opening the window
- Launch options: autostart, start minimized, start active
- Update checker with in-app download + guided tour included
- Tabbed Settings: General, Appearance, Input, Profiles, About
- Works in any game (low-level hook)
- Very low latency native Rust engine (verify live in Settings → About)
- Clean dark UI

## Screenshots

### Main window

![Main dashboard](assets/screenshots/main-dashboard.png)

### Mappings

| Add mapping | Delete mapping |
|---|---|
| ![Add mapping](assets/screenshots/add-mapping.png) | ![Delete mapping](assets/screenshots/delete-mapping.png) |

### Settings

| General | Appearance |
|---|---|
| ![Settings general](assets/screenshots/settings-general.png) | ![Settings appearance](assets/screenshots/settings-apparence.png) |

| Input | Profiles |
|---|---|
| ![Settings input](assets/screenshots/settings-input.png) | ![Settings profiles](assets/screenshots/settings-profiles.png) |

![Settings about](assets/screenshots/settings-about.png)

## Install

Download the latest installer from [Releases](https://github.com/EtherealDevv/Lefty/releases) (`Lefty_*_x64-setup.exe`).

> Run as **Administrator** for games that run elevated.

## Profiles

| Profile | Mapping |
|---------|---------|
| **Left-handed IJKL** | `I→W, J→A, K→S, L→D` + mirrored cluster |
| **Arrow Keys** | `↑→W, ←→A, ↓→S, →→D` + cluster |
| **Numpad 8456** | `8→W, 4→A, 5→S, 6→D` + digits |
| **OKL; Mirror** | `O→W, K→A, L→S, ;→D` + mirror |

Create your own with `+` (rename, icon, accent and games from tabs, reorder from `⋯`).

## Usage

1. Pick a profile on the left
2. **Add** or **Capture** a mapping (`I` → `W`)
3. **Activate**
4. Play (activate before launching the game)
5. **Pause** to restore, `F6` to toggle, close to tray
6. Share via `⋯ → Share` on any profile, import by pasting the code in Settings → Profiles

## Latency

| Method | Latency |
|--------|---------|
| Registry | 0ms (reboot, not dynamic) |
| **Lefty** | **low latency*** |
| AutoHotkey | 5-15ms |

*Verify it yourself live in the app: Settings → About → Engine latency.

## Structure

```
Lefty/
├── engine_native/ # Rust engine (hook + SendInput + telemetry)
├── tauri-app/     # Tauri v2 + React UI
├── assets/        # banner + screenshots
└── dist/          # local test binaries (gitignored, see Releases)
```

## Troubleshooting

- **Not working in game**: Run as **Admin**. Some anti-cheats block hooks → use Interception.
- **Stuck key**: Pause and resume.
- **High delay**: Close other hooks (AutoHotkey).

## Community

Questions, layouts to share, bug reports with a human on the other side — join us on Telegram:

[![Join the Telegram channel](https://img.shields.io/badge/Telegram-Join_Channel-26A5E1?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/+kOXrV-lOGxIyYzkx)

## Acknowledgments

- Remapping architecture inspired by [Microsoft PowerToys Keyboard Manager](https://github.com/microsoft/PowerToys) (low-level hook + `SendInput` design, Task Scheduler autostart pattern) — reimplemented from scratch in Rust with a zero-GC hot path, batched injection and live latency telemetry for lower, measurable latency.

## License

MIT — Made for left-handed gamers.
