"""
Lefty Engine - Proceso aislado native low-level
Mismo hook que remapper.py pero en proceso pythonw sin Tkinter, TIME_CRITICAL.
No OEM expansion, no scan priority — Lefty 1:1.
"""
import sys
import os
import time
import ctypes
import ctypes.wintypes as wt

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

WH_KEYBOARD_LL = 13
WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
WM_SYSKEYDOWN = 0x0104
WM_SYSKEYUP = 0x0105
HC_ACTION = 0
KEYBOARDMANAGER_INJECTED_FLAG = 0x1
KEYBOARDMANAGER_SINGLEKEY_FLAG = 0x11
KEYBOARDMANAGER_SUPPRESS_FLAG = 0x111
INPUT_KEYBOARD = 1
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
VK_DISABLED = 0x100
EXTENDED_VKS = {
    0xA3, 0xA5, 0x90, 0x2C, 0x03,
    0x2D, 0x24, 0x21, 0x2E, 0x23, 0x22,
    0x25, 0x26, 0x27, 0x28,
    0x6F,
    0xAD, 0xAE, 0xAF, 0xB0, 0xB1, 0xB2, 0xB3,
    0xB4, 0xB7,
    0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xAB, 0xAC,
    0x5B, 0x5C,
}

class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ("vkCode", wt.DWORD),
        ("scanCode", wt.DWORD),
        ("flags", wt.DWORD),
        ("time", wt.DWORD),
        ("dwExtraInfo", ctypes.c_ulonglong),
    ]
class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wt.WORD), ("wScan", wt.WORD), ("dwFlags", wt.DWORD), ("time", wt.DWORD), ("dwExtraInfo", ctypes.c_ulonglong)]
class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", wt.LONG), ("dy", wt.LONG), ("mouseData", wt.DWORD), ("dwFlags", wt.DWORD), ("time", wt.DWORD), ("dwExtraInfo", ctypes.c_ulonglong)]
class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [("uMsg", wt.DWORD), ("wParamL", wt.WORD), ("wParamH", wt.WORD)]
class INPUT_UNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]
class INPUT(ctypes.Structure):
    _fields_ = [("type", wt.DWORD), ("union", INPUT_UNION)]

LowLevelKeyboardProc = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_int, wt.WPARAM, wt.LPARAM)

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
user32.SendInput.argtypes = [wt.UINT, ctypes.c_void_p, ctypes.c_int]
user32.SendInput.restype = wt.UINT
user32.SetWindowsHookExW.argtypes = [ctypes.c_int, LowLevelKeyboardProc, wt.HINSTANCE, wt.DWORD]
user32.SetWindowsHookExW.restype = wt.HHOOK
user32.UnhookWindowsHookEx.argtypes = [wt.HHOOK]
user32.CallNextHookEx.argtypes = [wt.HHOOK, ctypes.c_int, wt.WPARAM, wt.LPARAM]
user32.CallNextHookEx.restype = ctypes.c_long
kernel32.GetModuleHandleW.argtypes = [wt.LPCWSTR]
kernel32.GetModuleHandleW.restype = wt.HMODULE
user32.GetMessageW.argtypes = [ctypes.POINTER(wt.MSG), wt.HWND, wt.UINT, wt.UINT]
user32.GetMessageW.restype = wt.BOOL
user32.TranslateMessage.argtypes = [ctypes.POINTER(wt.MSG)]
user32.DispatchMessageW.argtypes = [ctypes.POINTER(wt.MSG)]
user32.MapVirtualKeyW.argtypes = [wt.UINT, wt.UINT]
user32.MapVirtualKeyW.restype = wt.UINT
kernel32.GetCurrentThread.argtypes = []
kernel32.GetCurrentThread.restype = wt.HANDLE
kernel32.SetThreadPriority.argtypes = [wt.HANDLE, ctypes.c_int]
kernel32.SetThreadPriority.restype = wt.BOOL
kernel32.GetCurrentThreadId.argtypes = []
kernel32.GetCurrentThreadId.restype = wt.DWORD
user32.PostThreadMessageW.argtypes = [wt.DWORD, wt.UINT, wt.WPARAM, wt.LPARAM]

def _encode_numpad_origin(vk, extended):
    numpad_originated = False
    if vk in (0x25,0x26,0x27,0x28,0x2D,0x2E,0x21,0x22,0x24,0x23):
        numpad_originated = not extended
    elif vk in (0x0D,0x6F):
        numpad_originated = extended
    if numpad_originated:
        return vk | (1 << 31)
    return vk

def _ensure_lowlevel_timeout(min_ms=3000):
    try:
        import winreg
        k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop", 0, winreg.KEY_READ|winreg.KEY_WRITE)
        try:
            v,_ = winreg.QueryValueEx(k, "LowLevelHooksTimeout")
            cur = int(v)
        except:
            cur = 300
        if cur < min_ms:
            winreg.SetValueEx(k, "LowLevelHooksTimeout", 0, winreg.REG_SZ, str(min_ms))
            print(f"[LeftyEngine] LowLevelHooksTimeout {cur}->{min_ms}", flush=True)
        winreg.CloseKey(k)
    except Exception as e:
        print(f"[LeftyEngine] timeout err {e}", flush=True)

def _vk_to_scan(vk):
    try:
        return user32.MapVirtualKeyW(vk & 0xFFFF, 0) & 0xFF
    except:
        return 0

def _is_numpad_affected(vk):
    return vk in (0x60,0x61,0x62,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6E)

_g_vk_map = {}
_g_send_map = {}
_g_scan_map = {}
_g_numpad_pressed = {}
_g_injection_failed = set()
_g_stats = {"remaps":0, "suppress":0}
_g_hook_handle = None
_g_hook_handle_copy = None
_g_hook_proc_ptr = None
_running = True

def _set_mappings(vk_map):
    global _g_vk_map, _g_send_map, _g_scan_map, _g_numpad_pressed, _g_injection_failed
    # native low-level: no expansion
    _g_vk_map = dict(vk_map)
    send_map = {}
    scan_map = {}
    for src, dst in vk_map.items():
        if dst == VK_DISABLED or dst == 0xFF or dst == 0:
            send_map[src] = (0,0,VK_DISABLED)
            continue
        scan = _vk_to_scan(dst)
        flags = 0
        if dst in EXTENDED_VKS:
            flags |= KEYEVENTF_EXTENDEDKEY
        send_map[src] = (scan, flags, dst)
        if _is_numpad_affected(src):
            sc = _vk_to_scan(src)
            if sc != 0:
                scan_map[sc] = src
    _g_send_map = send_map
    _g_scan_map = scan_map
    _g_numpad_pressed = {}
    _g_injection_failed = set()
    print(f"[LeftyEngine] Mapeos actualizados {len(vk_map)} (native)", flush=True)

def _send_input_hybrid(scan, flags, vk, is_keyup):
    if vk == VK_DISABLED or vk == 0xFF or vk == 0x100:
        return True
    inp = INPUT()
    inp.type = INPUT_KEYBOARD
    inp.union.ki.wVk = vk & 0xFFFF
    inp.union.ki.wScan = scan
    f = flags
    if is_keyup:
        f |= KEYEVENTF_KEYUP
    inp.union.ki.dwFlags = f
    inp.union.ki.time = 0
    inp.union.ki.dwExtraInfo = KEYBOARDMANAGER_SINGLEKEY_FLAG
    sent = user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
    return sent != 0

def _low_level_proc(nCode, wParam, lParam):
    global _g_stats, _g_numpad_pressed, _g_injection_failed
    if nCode != HC_ACTION:
        return user32.CallNextHookEx(_g_hook_handle_copy, nCode, wParam, lParam)
    kb = ctypes.cast(lParam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
    vk_raw = kb.vkCode
    scan = kb.scanCode
    flags = kb.flags
    extra = kb.dwExtraInfo
    if extra == KEYBOARDMANAGER_SUPPRESS_FLAG:
        return 1
    if extra & KEYBOARDMANAGER_INJECTED_FLAG:
        return user32.CallNextHookEx(_g_hook_handle_copy, nCode, wParam, lParam)
    extended = bool(flags & 0x01)
    vk = _encode_numpad_origin(vk_raw, extended)
    # UpdateNumpadWithShift minimal
    if (vk & (1 << 31)) != 0 or vk_raw == 0x0C:
        decoded = vk & ~(1 << 31)
        if decoded == 0x0C:
            decoded = vk_raw
        sc = _vk_to_scan(decoded)
        origin = _g_scan_map.get(sc)
        if origin is not None:
            rem = _g_send_map.get(origin)
            if rem is not None:
                _, _, dst = rem
                if dst in (0x10, 0xA0, 0xA1):
                    if _g_numpad_pressed.get(origin, False):
                        vk = origin
    clean = vk & ~(1 << 31)
    if _is_numpad_affected(clean):
        is_down = (wParam == WM_KEYDOWN or wParam == WM_SYSKEYDOWN)
        _g_numpad_pressed[clean] = is_down
    is_keydown = (wParam == WM_KEYDOWN or wParam == WM_SYSKEYDOWN)
    is_keyup = not is_keydown

    send_info = _g_send_map.get(vk)
    if send_info is None:
        vk_clear = vk & ~(1 << 31)
        if vk_clear != vk:
            send_info = _g_send_map.get(vk_clear)
        if send_info is None:
            return user32.CallNextHookEx(_g_hook_handle_copy, nCode, wParam, lParam)

    # Injection failed passthrough for key-up
    if is_keyup and vk in _g_injection_failed:
        _g_injection_failed.discard(vk)
        return user32.CallNextHookEx(_g_hook_handle_copy, nCode, wParam, lParam)

    scan_dst, flags_base, vk_dst = send_info
    if vk_dst == VK_DISABLED or (scan_dst==0 and flags_base==0):
        _g_stats["suppress" if is_keyup else "remaps"]+=1
        return 1

    # IME workaround: if original modifier -> non-modifier, send suppress for original
    if is_keydown:
        try:
            from core.keys import is_modifier
            if is_modifier(clean) and not is_modifier(vk_dst) and vk_dst != 0x14 and clean not in (0x5B,0x5C):
                inp = INPUT()
                inp.type = INPUT_KEYBOARD
                inp.union.ki.wVk = clean & 0xFFFF
                inp.union.ki.wScan = _vk_to_scan(clean)
                inp.union.ki.dwFlags = KEYEVENTF_KEYUP
                inp.union.ki.dwExtraInfo = KEYBOARDMANAGER_SUPPRESS_FLAG
                user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
        except:
            pass

    ok = _send_input_hybrid(scan_dst, flags_base, vk_dst, is_keyup)
    if not ok:
        if is_keydown:
            _g_injection_failed.add(vk)
        return user32.CallNextHookEx(_g_hook_handle_copy, nCode, wParam, lParam)
    else:
        if is_keydown:
            _g_injection_failed.discard(vk)
    _g_stats["remaps" if is_keydown else "suppress"]+=1
    return 1

def isolated_main(mappings_queue=None, stop_event=None, initial_mappings=None):
    global _g_hook_handle, _g_hook_handle_copy, _g_hook_proc_ptr, _running
    _ensure_lowlevel_timeout(3000)
    if initial_mappings:
        _set_mappings(initial_mappings)
    try:
        kernel32.SetThreadPriority(kernel32.GetCurrentThread(), 15)
    except:
        pass
    _g_hook_proc_ptr = LowLevelKeyboardProc(_low_level_proc)
    mod = kernel32.GetModuleHandleW(None)
    _g_hook_handle = user32.SetWindowsHookExW(WH_KEYBOARD_LL, _g_hook_proc_ptr, mod, 0)
    if not _g_hook_handle:
        _g_hook_handle = user32.SetWindowsHookExW(WH_KEYBOARD_LL, _g_hook_proc_ptr, 0, 0)
    if not _g_hook_handle:
        print(f"[LeftyEngine] SetWindowsHookEx falló {kernel32.GetLastError()}", flush=True)
        return
    _g_hook_handle_copy = _g_hook_handle
    tid = kernel32.GetCurrentThreadId()
    print(f"[LeftyEngine] PID={os.getpid()} Hook={_g_hook_handle} TID={tid} modo=native", flush=True)
    print(f"[LeftyEngine] Esperando mappings vía queue...", flush=True)

    import threading
    _poll_tid = tid
    def poll_loop():
        global _running
        while _running:
            try:
                if mappings_queue is not None:
                    try:
                        new_map = mappings_queue.get(timeout=0.2)
                        if new_map is None:
                            continue
                        if isinstance(new_map, dict) and new_map.get("__cmd")=="stop":
                            _running = False
                            try: user32.PostThreadMessageW(_poll_tid, 0x0012, 0, 0)
                            except: pass
                            break
                        _set_mappings(new_map)
                    except:
                        pass
                time.sleep(0.05)
                if stop_event is not None and stop_event.is_set():
                    _running = False
                    try: user32.PostThreadMessageW(_poll_tid, 0x0012, 0, 0)
                    except: pass
                    break
            except Exception as e:
                print(f"[LeftyEngine] poll err {e}", flush=True)
                time.sleep(0.5)
    poll_thr = threading.Thread(target=poll_loop, daemon=True)
    poll_thr.start()

    msg = wt.MSG()
    while _running:
        if stop_event is not None and stop_event.is_set():
            break
        ret = user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
        if ret == 0 or ret == -1:
            break
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))
    print("[LeftyEngine] Saliendo", flush=True)
    _running = False
    if _g_hook_handle:
        try:
            user32.UnhookWindowsHookEx(_g_hook_handle)
        except:
            pass

if __name__ == "__main__":
    import json, pathlib
    init = {}
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        try:
            with open(sys.argv[1],"r") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    init = {int(k):int(v) for k,v in data.items()}
        except Exception as e:
            print(f"load err {e}")
    isolated_main(initial_mappings=init)
