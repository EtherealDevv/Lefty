![Banner](assets/banner.jpg)

# Lefty

Remap any key for left-handed gaming. Low latency, native Rust engine.

![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat)
![Latency](https://img.shields.io/badge/Latency-low-success?style=flat)
![Rust](https://img.shields.io/badge/Rust-Tauri-orange?style=flat)
![Downloads](https://img.shields.io/github/downloads/EtherealDevv/Lefty/total?style=flat)

## What is it?

- **WASD → IJKL** (or arrows, numpad) for left-hand movement
- Map any key to any other: `I→W`, `Q→U`, `Caps→Ctrl`, `Win→Disabled`
- Profiles you can create, rename, duplicate, reorder and delete (Lucide icons)
- Per-game auto-switch: jump to a profile when its app is focused
- Add-mapping validation: duplicate sources and self-maps are blocked inline
- Accent Color themes: 10 presets + custom picker (Settings → Appearance)
- Share profiles with compact codes (`⋯ → Share`), import by pasting
- Interface sounds: distinct chimes for activate vs pause (Settings → General)
- Gaming focus: Sticky/Filter key popups stay silent while active
- Launch options: autostart, start minimized, start active
- Update checker + guided tour included
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

```bash
git clone https://github.com/EtherealDevv/Lefty
cd Lefty
# Run
.\dist\Lefty.exe
# Or install
.\dist\Lefty_1.4.0_x64-setup.exe
```

> Run as **Administrator** for games that run elevated.

## Profiles

| Profile | Mapping |
|---------|---------|
| **Left-handed IJKL** | `I→W, J→A, K→S, L→D` + mirrored cluster |
| **Arrow Keys** | `↑→W, ←→A, ↓→S, →→D` + cluster |
| **Numpad 8456** | `8→W, 4→A, 5→S, 6→D` + digits |
| **OKL; Mirror** | `O→W, K→A, L→S, ;→D` + mirror |

Create your own with `+` (rename, icon, auto-switch and reorder from `⋯`).

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
└── dist/          # Lefty.exe + installers
```

## Troubleshooting

- **Not working in game**: Run as **Admin**. Some anti-cheats block hooks → use Interception.
- **Stuck key**: Pause and resume.
- **High delay**: Close other hooks (AutoHotkey).

## Acknowledgments

- Remapping architecture inspired by [Microsoft PowerToys Keyboard Manager](https://github.com/microsoft/PowerToys) (low-level hook + `SendInput` design, Task Scheduler autostart pattern) — reimplemented from scratch in Rust with a zero-GC hot path, batched injection and live latency telemetry for lower, measurable latency.

## License

MIT — Made for left-handed gamers.
