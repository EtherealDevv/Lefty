## Lefty v1.8.0 — Cyberpunk

Night City has a new left-handed layout.

### Highlights

- **Cyberpunk theme** in Settings → Appearance → Theme: neon yellow, cyan and magenta, angular HUD panels, clipped controls and JetBrains Mono labels.
- **Material UI** is the new display name for the default theme (the visual theme and saved settings are unchanged).
- Cyberpunk keeps the existing layout, spacing and overlay structure; only the visual language changes.
- Theme choice persists across restarts.
- Capri easter egg.

### Backend & performance

- Native engine rebuilt with LTO, `opt-level=3`, one codegen unit, `panic=abort` and stripped symbols; the engine binary is ~22% smaller.
- Hot path trimmed: fewer allocations and `SendInput` calls, stack-based key-up batches and per-key injection tracking.
- Hook-to-injection latency measured locally: ~0.07 ms (70 µs) average; no measurable regression from v1.7.1.
- Pausing, remapping or shutting down only releases keys injected by Lefty; physically held keys are never released.
- Mapping reloads are guarded by a sequence check, so a keydown can't use a stale map or leave a target held.
- Removed the unused `notify` file-watcher dependency.
- Faster combo lookup and async backend work keep the UI responsive.
- Mouse inversion lifecycle: stays active while Lefty runs in the tray and is restored on full exit, shutdown/restart or restart-as-admin.

### Visual fixes

- Bundled Inter, Outfit and JetBrains Mono locally for consistent typography and no fallback/blank text without internet.
- Material UI polish: title bar/logo rendering, clipped corners, spacing, contrast and dialog layout.

### Install

- `Lefty_1.8.0_x64-setup.exe` — installer (recommended)
- `Lefty_1.8.0_x64_en-US.msi` — MSI package
- Run as **Administrator** for games that run elevated.
