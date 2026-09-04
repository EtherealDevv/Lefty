"""
Lefty - Main Entry
Lefty
Ejecuta: py main.py

Requiere admin para juegos elevados (como Lefty
Si no eres admin, muestra aviso pero funciona para juegos no elevados.
"""
import sys
import ctypes
import os
import multiprocessing

# Ensure current directory is in path
sys.path.insert(0, os.path.dirname(__file__))

def is_admin():
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except:
        return False

def try_elevate_if_needed():
    # No auto-elevar agresivamente; dejar que el usuario decida desde UI
    # Pero si se pasa flag --admin, elevar
    if "--elevate" in sys.argv and not is_admin():
        print("[Lefty] Elevando a admin...")
        try:
            ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, f'"{__file__}"', None, 1)
            sys.exit(0)
        except Exception as e:
            print(f"[Lefty] No se pudo elevar: {e}")

def main():
    multiprocessing.freeze_support()
    # DPI awareness for sharp high-res UI (professional monochrome)
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except:
            pass
    try_elevate_if_needed()
    print(f"[Lefty] Iniciando... Admin={is_admin()}")

    # Verificar dependencias
    try:
        import customtkinter  # noqa
    except ImportError:
        print("[Lefty] Instalando dependencias...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        import customtkinter

    from ui.app import LeftyApp
    app = LeftyApp()
    # Hotkey global ESC para pausar rápido (opcional)
    # Lo dejamos a la UI para no complicar
    app.mainloop()

if __name__ == "__main__":
    main()
