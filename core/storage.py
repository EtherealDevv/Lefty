"""
Lefty - Persistencia de perfiles en JSON
Similar a Lefty
"""
import json
import os
from pathlib import Path

APP_DIR = Path(os.getenv("APPDATA", Path.home())) / "Lefty"
CONFIG_FILE = APP_DIR / "config.json"
PROFILES_FILE = APP_DIR / "profiles.json"

DEFAULT_CONFIG = {
    "active_profile": "zurdo_ijkl",
    "gaming_mode": False,
    "start_minimized": False,
    "run_as_admin": True,
    "disable_win_key": False,
    "invert_clicks": False,  # nuevo: inversión clicks izq/der para zurdos
    "latency_mode": "low",  # low / ultra (interception)
    "theme": "dark",
    "accent": "#D0BCFF"
}

def ensure_app_dir():
    APP_DIR.mkdir(parents=True, exist_ok=True)

def load_config() -> dict:
    ensure_app_dir()
    if not CONFIG_FILE.exists():
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG.copy()
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # merge defaults
            merged = DEFAULT_CONFIG.copy()
            merged.update(data)
            return merged
    except Exception:
        return DEFAULT_CONFIG.copy()

def save_config(cfg: dict):
    ensure_app_dir()
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

def load_profiles() -> dict:
    ensure_app_dir()
    if not PROFILES_FILE.exists():
        from .profile import BUILTIN_PROFILES
        save_profiles(BUILTIN_PROFILES)
        return BUILTIN_PROFILES
    try:
        with open(PROFILES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        from .profile import BUILTIN_PROFILES
        return BUILTIN_PROFILES

def save_profiles(profiles: dict):
    ensure_app_dir()
    with open(PROFILES_FILE, "w", encoding="utf-8") as f:
        json.dump(profiles, f, indent=2, ensure_ascii=False)
