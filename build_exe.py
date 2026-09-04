"""
Lefty - Build script para generar .exe con manifest Admin (como Lefty
Use pyinstaller --uac-admin so Windows prompts for elevation automatically
"""
import subprocess, sys, os, pathlib

# Limpia builds previos
import shutil
for d in ["build","dist"]:
    p = pathlib.Path(d)
    if p.exists():
        shutil.rmtree(p, ignore_errors=True)
for f in pathlib.Path(".").glob("*.spec"):
    f.unlink(missing_ok=True)

# Incluir Rust engine si existe
rust_exe = pathlib.Path("engine_native/target/release/lefty_engine.exe")
if not rust_exe.exists():
    rust_exe = pathlib.Path("lefty_engine.exe")
add_data = []
if rust_exe.exists():
    add_data = ["--add-data", f"{rust_exe};."]

cmd = [
    sys.executable, "-m", "PyInstaller",
    "--noconsole",
    "--onefile",
    "--name", "Lefty",
    "--uac-admin",
    "--clean",
    *add_data,
    "--collect-all", "customtkinter",
    "--hidden-import", "engine.remapper",
    "--hidden-import", "engine.engine_process",
    "--hidden-import", "engine.interception_backend",
    "--hidden-import", "core.keys",
    "--hidden-import", "core.profile",
    "--hidden-import", "core.storage",
    "--hidden-import", "ui.app",
    "--hidden-import", "ui.theme",
    "--hidden-import", "ui.components",
    "main.py"
]
print(" ".join(cmd))
result = subprocess.run(cmd)
# Siempre deja el nuevo Tauri en dist (quita legacy Python)
try:
    tauri_exe = pathlib.Path("tauri-app/src-tauri/target/release/lefty-tauri.exe")
    if tauri_exe.exists():
        import time
        time.sleep(0.5)
        shutil.copy2(tauri_exe, pathlib.Path("dist/Lefty.exe"))
        for src in ["tauri-app/src-tauri/target/release/bundle/msi/Lefty_1.1.0_x64_en-US.msi", "tauri-app/src-tauri/target/release/bundle/nsis/Lefty_1.1.0_x64-setup.exe"]:
            p = pathlib.Path(src)
            if p.exists():
                shutil.copy2(p, pathlib.Path("dist") / p.name)
        print(f"[Lefty] dist\\Lefty.exe is now Tauri Rust+React ({tauri_exe.stat().st_size} bytes) - legacy Python removed")
except Exception as e:
    print(f"[Lefty] Tauri copy skip: {e}")
sys.exit(result.returncode)
