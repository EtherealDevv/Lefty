@echo off
echo === Lefty Engine Nativo (Rust) ===
where cargo >nul 2>nul
if %errorlevel% neq 0 (
  echo [!] cargo no encontrado. Instala Rust:
  echo     winget install Rustlang.Rustup -e
  echo     o https://rustup.rs
  pause
  exit /b 1
)
cd /d "%~dp0engine_native"
echo [1/2] cargo build --release ...
cargo build --release
if %errorlevel% neq 0 (
  echo [!] build fallo
  pause
  exit /b 1
)
echo [2/2] copiado a dist
if not exist "..\dist" mkdir "..\dist"
copy /y "target\release\lefty_engine.exe" "..\dist\lefty_engine.exe" >nul
copy /y "target\release\lefty_engine.exe" "..\lefty_engine.exe" >nul
echo [OK] lefty_engine.exe listo. Lefty lo detecta automaticamente.
pause
