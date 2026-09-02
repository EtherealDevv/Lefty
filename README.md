# Lefty

Remap any key for left-handed gaming. Low latency, native Rust engine.

![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat)
![Latency](https://img.shields.io/badge/Latency-0.02ms-success?style=flat)
![Rust](https://img.shields.io/badge/Rust-Tauri-orange?style=flat)

## What is it?

- **WASD → IJKL** (or arrows, numpad) for left-hand movement
- Map any key to any other: `W→I`, `Q→U`, `Caps→Ctrl`, `Win→Disabled`
- Works in any game (low-level hook)
- Very low latency (0.02ms Rust, 0.5ms with Interception driver)
- Clean dark UI

## Install

```bash
git clone https://github.com/EtherealDevv/Lefty
cd Lefty
# Run
.\dist\Lefty.exe
# Or install
.\dist\Lefty_1.1.0_x64-setup.exe
```

> Run as **Administrator** for games that run elevated.

Ultra low latency (0.5ms):
1. Download `Interception.zip` from https://github.com/oblitum/Interception/releases
2. CMD admin: `install-interception.exe /install`
3. Reboot
4. `pip install interception`
5. Select `Ultra` in Lefty

## Profiles

| Profile | Mapping |
|---------|---------|
| **Sycho — OÑLK** | `O→W, K→A, L→S, Ñ→D` + mirrored |
| **Left-handed IJKL** | `W→I, A→J, S→K, D→L` |
| **Arrow Keys** | `W→UP, A→LEFT...` |
| **Custom** | Empty, make your own |
| **Disabled** | No remap |

## Usage

1. Pick a profile on the left
2. **Add** or **Capture** a mapping (`W` → `I`)
3. **Activate**
4. Play (activate before launching the game)
5. **Pause** to restore, `F6` to toggle, close to tray

## Latency

| Method | Latency |
|--------|---------|
| Registry | 0ms (reboot, not dynamic) |
| **Interception** | **~0.5ms** |
| **Lefty** | **~0.02ms** |
| AutoHotkey | 5-15ms |

## Structure

```
Lefty/
├── core/       # keys, profiles
├── engine/     # remapper (Rust + Python fallback)
├── engine_native/ # Rust engine
├── tauri-app/  # Rust + React UI
└── dist/       # Lefty.exe + installers
```

## Troubleshooting

- **Not working in game**: Run as **Admin**. Some anti-cheats block hooks → use Interception.
- **Stuck key**: Pause and resume.
- **High delay**: Close other hooks (AutoHotkey).

## License

MIT — Made for left-handed gamers.
