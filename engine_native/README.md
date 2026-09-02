# Lefty Engine Nativo (Rust)

Replica `Lefty

- `WH_KEYBOARD_LL` + `SendInput(wVk+wScan+EXTENDED)` Lefty
- `EncodeKeyNumpadOrigin` bit31, `IsExtendedKey`, `VK_DISABLED 0x100`, flags `0x1/0x111`
- Sin `WH_MOUSE_LL` (usa `SwapMouseButton`)
- Watcher `engine_mappings.json` en `%APPDATA%\Lefty`

## Build

Instala Rust: `winget install Rustlang.Rustup -e` o https://rustup.rs

```bat
cd engine_native
cargo build --release
```

Genera `target/release/lefty_engine.exe` (~1.5MB). Lefty lo detecta automáticamente (`engine/remapper.py: _get_rust_exe`).

Si no existe, Lefty usa fallback Python aislado (`engine/engine_process.py`) igualmente sin GIL de UI.

## IPC

Python escribe `%APPDATA%\Lefty\engine_mappings.json`:
```json
{"79":87, "75":65}
```
Rust lo vigila cada 200ms (`ReadDirectoryChanges` simplificado a `poll`).

Parent PID: `lefty_engine.exe --parent-pid 1234 --mappings C:\path\engine_mappings.json`

## Por qué Rust vs C#

- `C#` requiere `.NET` GC + JIT, `Rust` 0 GC, `~0.02ms` idéntico a `C++` Lefty
- Binario `Rust` ` --release` no necesita runtime, igual que `Lefty

## Test

```
cargo run -- --mappings "%APPDATA%\Lefty\engine_mappings.json"
```
Luego `python benchmark.py` (forzará in-process, no Rust).
