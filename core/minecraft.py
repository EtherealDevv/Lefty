"""
Lefty - Parcheador de options.txt para Minecraft
Ideal solution for gaming: 0ms, no hook, no frame drops.
Lefty
This module writes directly to options.txt with left-handed binds, replicating Lefty profile.

Ubicación: %APPDATA%\\.minecraft\\options.txt
Formato: key_key.forward:key.keyboard.w
Valores Minecraft 1.13+ (GLFW): key.keyboard.<nombre>
"""
import os
import pathlib
import shutil
import time

MC_KEY_MAP = {
    # Letras
    0x41: "key.keyboard.a", 0x42: "key.keyboard.b", 0x43: "key.keyboard.c",
    0x44: "key.keyboard.d", 0x45: "key.keyboard.e", 0x46: "key.keyboard.f",
    0x47: "key.keyboard.g", 0x48: "key.keyboard.h", 0x49: "key.keyboard.i",
    0x4A: "key.keyboard.j", 0x4B: "key.keyboard.k", 0x4C: "key.keyboard.l",
    0x4D: "key.keyboard.m", 0x4E: "key.keyboard.n", 0x4F: "key.keyboard.o",
    0x50: "key.keyboard.p", 0x51: "key.keyboard.q", 0x52: "key.keyboard.r",
    0x53: "key.keyboard.s", 0x54: "key.keyboard.t", 0x55: "key.keyboard.u",
    0x56: "key.keyboard.v", 0x57: "key.keyboard.w", 0x58: "key.keyboard.x",
    0x59: "key.keyboard.y", 0x5A: "key.keyboard.z",
    # Numbers
    0x30: "key.keyboard.0", 0x31: "key.keyboard.1", 0x32: "key.keyboard.2",
    0x33: "key.keyboard.3", 0x34: "key.keyboard.4", 0x35: "key.keyboard.5",
    0x36: "key.keyboard.6", 0x37: "key.keyboard.7", 0x38: "key.keyboard.8",
    0x39: "key.keyboard.9",
    # Especiales
    0x1B: "key.keyboard.escape", 0x20: "key.keyboard.space", 0x0D: "key.keyboard.enter",
    0x09: "key.keyboard.tab", 0x08: "key.keyboard.backspace", 0x14: "key.keyboard.caps.lock",
    0x10: "key.keyboard.left.shift", 0xA0: "key.keyboard.left.shift", 0xA1: "key.keyboard.right.shift",
    0x11: "key.keyboard.left.control", 0xA2: "key.keyboard.left.control", 0xA3: "key.keyboard.right.control",
    0x12: "key.keyboard.left.alt", 0xA4: "key.keyboard.left.alt", 0xA5: "key.keyboard.right.alt",
    0x5B: "key.keyboard.left.win", 0x5C: "key.keyboard.right.win",
    0x26: "key.keyboard.up", 0x28: "key.keyboard.down", 0x25: "key.keyboard.left", 0x27: "key.keyboard.right",
    0x2D: "key.keyboard.insert", 0x2E: "key.keyboard.delete", 0x24: "key.keyboard.home", 0x23: "key.keyboard.end",
    0x21: "key.keyboard.page.up", 0x22: "key.keyboard.page.down",
    # Symbols
    0xBA: "key.keyboard.semicolon",  # Ñ en ES
    0xBB: "key.keyboard.equal", 0xBC: "key.keyboard.comma", 0xBD: "key.keyboard.minus",
    0xBE: "key.keyboard.period", 0xBF: "key.keyboard.slash", 0xC0: "key.keyboard.grave.accent",
    0xDB: "key.keyboard.left.bracket", 0xDC: "key.keyboard.backslash", 0xDD: "key.keyboard.right.bracket",
    0xDE: "key.keyboard.apostrophe",
    # F
    0x70: "key.keyboard.f1", 0x71: "key.keyboard.f2", 0x72: "key.keyboard.f3", 0x73: "key.keyboard.f4",
    0x74: "key.keyboard.f5", 0x75: "key.keyboard.f6", 0x76: "key.keyboard.f7", 0x77: "key.keyboard.f8",
    0x78: "key.keyboard.f9", 0x79: "key.keyboard.f10", 0x7A: "key.keyboard.f11", 0x7B: "key.keyboard.f12",
}

# Mapeo de dst VK (WASD etc) a key_key.* de Minecraft
MC_CONTROL_MAP = {
    0x57: "key_key.forward",      # W
    0x41: "key_key.left",         # A
    0x53: "key_key.back",         # S
    0x44: "key_key.right",        # D
    0x20: "key_key.jump",         # SPACE
    0xA0: "key_key.sneak",        # LSHIFT
    0x10: "key_key.sneak",
    0xA2: "key_key.sprint",       # LCTRL
    0x11: "key_key.sprint",
    0x51: "key_key.drop",         # Q
    0x45: "key_key.inventory",    # E
    0x54: "key_key.chat",         # T
    0x09: "key_key.playerlist",   # TAB
    0x46: "key_key.swapOffhand",  # F
    0x43: "key_key.saveToolbarActivator", # C
    0x58: "key_key.loadToolbarActivator", # X
    0x4C: "key_key.advancements", # L
    0x32: "key_key.hotbar.2", # 2 etc se mapean vía generic
}

def get_minecraft_options_path() -> pathlib.Path:
    appdata = os.getenv("APPDATA", str(pathlib.Path.home()))
    return pathlib.Path(appdata) / ".minecraft" / "options.txt"

def is_minecraft_installed() -> bool:
    return get_minecraft_options_path().exists()

def is_minecraft_running() -> bool:
    """Detecta javaw/java con Minecraft en cmdline (lightweight)"""
    try:
        import psutil
        for p in psutil.process_iter(["name", "cmdline"]):
            n = (p.info["name"] or "").lower()
            if "javaw" in n or "java" in n:
                cmd = " ".join(p.info.get("cmdline") or []).lower()
                if "minecraft" in cmd or "net.minecraft" in cmd:
                    return True
        return False
    except:
        # Fallback sin psutil: buscar por nombre ventana
        try:
            import ctypes, ctypes.wintypes as wt
            user32 = ctypes.windll.user32
            hwnd = user32.GetForegroundWindow()
            if hwnd:
                pid = wt.DWORD()
                user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                if pid.value:
                    h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid.value)
                    if h:
                        buf = ctypes.create_unicode_buffer(260)
                        sz = wt.DWORD(260)
                        if ctypes.windll.kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(sz)):
                            if "minecraft" in buf.value.lower() or "javaw" in buf.value.lower():
                                ctypes.windll.kernel32.CloseHandle(h)
                                return True
                        ctypes.windll.kernel32.CloseHandle(h)
        except:
            pass
        return False

def backup_options():
    p = get_minecraft_options_path()
    if not p.exists():
        return None
    bak = p.with_suffix(".txt.lefty_bak")
    if not bak.exists():
        shutil.copy2(p, bak)
        return bak
    # backup con timestamp si ya existe
    bak2 = p.parent / f"options.txt.lefty_bak_{int(time.time())}"
    shutil.copy2(p, bak2)
    return bak2

def vk_to_mc_key(vk: int) -> str | None:
    # Maneja 0x100 disabled
    if vk == 0x100 or vk == 0xFF:
        return "key.keyboard.unknown"
    return MC_KEY_MAP.get(vk & 0xFFFF)

def patch_minecraft_for_profile(profile: dict, dry_run=False) -> dict:
    """
    Patch options.txt per Lefty profile.
    profile: {"mappings": [["O","W"], ["K","A"]...]}
    Retorna {"patched": int, "path": Path, "changes": [(control, old, new)]}
    """
    from core.keys import VK_MAP
    p = get_minecraft_options_path()
    if not p.exists():
        return {"error": f"Not found {p}. Open Minecraft at least once."}
    # Leer
    try:
        with open(p, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except Exception as e:
        return {"error": str(e)}
    # Mapa dst->src y src->dst para soportar perfiles invertidos (W->I vs I->W)
    # profile mappings: src -> dst (O -> W). Para Minecraft, si dst es W (forward), forward debe ser src (O)
    # Pero zurdo_ijkl tiene W->I (invertido) donde W es dst esperado pero src es W, dst es I.
    # Para compatibilidad, soportamos ambos: si dst==W, usamos src; si src==W, usamos dst
    dst_to_src = {}
    src_to_dst = {}
    for src_name, dst_name in profile.get("mappings", []):
        sv = VK_MAP.get(src_name.upper())
        dv = VK_MAP.get(dst_name.upper())
        if sv is not None and dv is not None:
            if dv not in dst_to_src:
                dst_to_src[dv] = sv
            if sv not in src_to_dst:
                src_to_dst[sv] = dv

    # Also expand via app_specific? No

    changes = []
    new_lines = []
    patched = 0
    for line in lines:
        if not line.strip() or ":" not in line:
            new_lines.append(line)
            continue
        key, val = line.strip().split(":", 1)
        if key in MC_CONTROL_MAP.values() or key.startswith("key_key."):
            # Check if this control corresponds to any dst in dst_to_src
            # Buscar vk_dst cuyo MC_CONTROL_MAP == key
            target_vk = None
            for vk_dst, mc_key in MC_CONTROL_MAP.items():
                if mc_key == key:
                    target_vk = vk_dst
                    break
            # Also search for hotbar.1-9 generic
            if key.startswith("key_key.hotbar."):
                try:
                    num = int(key.split(".")[-1])
                    vk_num = 0x30 + num if num != 10 else 0x30
                    if num == 0:
                        vk_num = 0x30
                    target_vk = vk_num
                except:
                    pass
            src_vk = None
            if target_vk is not None:
                if target_vk in dst_to_src:
                    src_vk = dst_to_src[target_vk]
                elif target_vk in src_to_dst:
                    # Perfil invertido W->I: W es src, I es dst -> forward debe ser I
                    src_vk = src_to_dst[target_vk]
            if src_vk is not None:
                mc_val = vk_to_mc_key(src_vk)
                if mc_val and mc_val != val:
                    changes.append((key, val, mc_val))
                    line = f"{key}:{mc_val}\n"
                    patched += 1
        new_lines.append(line)

    if dry_run:
        return {"patched": patched, "changes": changes, "path": str(p)}

    if patched == 0:
        return {"patched": 0, "changes": [], "path": str(p), "msg": "Nada que parchear (profile no mapea WASD o ya está aplicado)"}

    # Backup
    backup_options()
    # Escribir
    try:
        with open(p, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except Exception as e:
        return {"error": str(e)}

    return {"patched": patched, "changes": changes, "path": str(p)}

def restore_minecraft_backup() -> dict:
    p = get_minecraft_options_path()
    bak = p.with_suffix(".txt.lefty_bak")
    if not bak.exists():
        # search last backup timestamp
        candidates = list(p.parent.glob("options.txt.lefty_bak_*"))
        if not candidates:
            return {"error": "No hay backup"}
        bak = max(candidates, key=lambda x: x.stat().st_mtime)
    try:
        shutil.copy2(bak, p)
        return {"restored": str(bak), "path": str(p)}
    except Exception as e:
        return {"error": str(e)}
