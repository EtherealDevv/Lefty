"""
Lefty Engine - Remapper Low-Level — native low-level port (single-key)
No OEM expansion, no scan priority, no VkKeyScan heuristics.
Keep TIME_CRITICAL / no-GIL (isolated process) optimization but mapping 1:1 Lefty.
"""
import ctypes
import ctypes.wintypes as wt
import threading
import time
import atexit
import os
import sys
import pathlib

# Win32 constants
WH_KEYBOARD_LL = 13
WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
WM_SYSKEYDOWN = 0x0104
WM_SYSKEYUP = 0x0105
HC_ACTION = 0
VK_PACKET = 0xE7
LLKHF_INJECTED = 0x10
LLKHF_LOWER_IL_INJECTED = 0x02

# Keyboard manager constants
KEYBOARDMANAGER_INJECTED_FLAG = 0x1
KEYBOARDMANAGER_SINGLEKEY_FLAG = 0x11
KEYBOARDMANAGER_SUPPRESS_FLAG = 0x111
VK_DISABLED = 0x100
VK_DISABLED_LEGACY = 0xFF  # compat only for reading old files

INPUT_KEYBOARD = 1
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002

# Helpers::IsExtendedKey list (Helpers.cpp)
EXTENDED_VKS = {
    0xA3, 0xA5, 0x90, 0x2C, 0x03,
    0x2D, 0x24, 0x21, 0x2E, 0x23, 0x22,
    0x25, 0x26, 0x27, 0x28,
    0x5F,  # SLEEP
    0xAD, 0xAE, 0xAF, 0xB0, 0xB1, 0xB2, 0xB3,
    0xB4, 0xB5, 0xB6, 0xB7,  # LAUNCH_MAIL/APP1/APP2/MEDIA_SELECT
    0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xAB, 0xAC,
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
    _fields_ = [
        ("wVk", wt.WORD),
        ("wScan", wt.WORD),
        ("dwFlags", wt.DWORD),
        ("time", wt.DWORD),
        ("dwExtraInfo", ctypes.c_ulonglong),
    ]

class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wt.LONG),
        ("dy", wt.LONG),
        ("mouseData", wt.DWORD),
        ("dwFlags", wt.DWORD),
        ("time", wt.DWORD),
        ("dwExtraInfo", ctypes.c_ulonglong),
    ]

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
user32.UnhookWindowsHookEx.restype = wt.BOOL
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
user32.MapVirtualKeyExW.argtypes = [wt.UINT, wt.UINT, wt.HKL]
user32.MapVirtualKeyExW.restype = wt.UINT
user32.PostThreadMessageW.argtypes = [wt.DWORD, wt.UINT, wt.WPARAM, wt.LPARAM]
user32.PostThreadMessageW.restype = wt.BOOL
user32.SwapMouseButton.argtypes = [wt.BOOL]
user32.SwapMouseButton.restype = wt.BOOL
user32.GetSystemMetrics.argtypes = [ctypes.c_int]
user32.GetSystemMetrics.restype = ctypes.c_int
kernel32.GetCurrentThread.argtypes = []
kernel32.GetCurrentThread.restype = wt.HANDLE
kernel32.SetThreadPriority.argtypes = [wt.HANDLE, ctypes.c_int]
kernel32.SetThreadPriority.restype = wt.BOOL
kernel32.GetCurrentThreadId.argtypes = []
kernel32.GetCurrentThreadId.restype = wt.DWORD

try:
    from core.keys import SPECIFIC_TO_GENERIC, GENERIC_TO_SPECIFIC
except ImportError:
    SPECIFIC_TO_GENERIC = {}
    GENERIC_TO_SPECIFIC = {}

try:
    is_admin = bool(ctypes.windll.shell32.IsUserAnAdmin())
except:
    is_admin = False

def _ensure_lowlevel_timeout(min_ms=2000):
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop", 0, winreg.KEY_READ|winreg.KEY_WRITE)
        try:
            val, _ = winreg.QueryValueEx(key, "LowLevelHooksTimeout")
            cur = int(val)
        except:
            cur = 300
        if cur < min_ms:
            winreg.SetValueEx(key, "LowLevelHooksTimeout", 0, winreg.REG_SZ, str(min_ms))
            print(f"[Lefty] LowLevelHooksTimeout {cur} -> {min_ms}ms")
        winreg.CloseKey(key)
    except Exception as e:
        print(f"[Lefty] No se pudo ajustar LowLevelHooksTimeout: {e}")

def _vk_to_scan(vk):
    try:
        return user32.MapVirtualKeyW(vk & 0xFFFF, 0) & 0xFF
    except:
        return 0

def _encode_numpad_origin(vk, extended):
    """Encode numpad origin helper"""
    numpad_originated = False
    if vk in (0x25,0x26,0x27,0x28,0x2D,0x2E,0x21,0x22,0x24,0x23):
        numpad_originated = not extended
    elif vk in (0x0D,0x6F):
        numpad_originated = extended
    if numpad_originated:
        return vk | (1 << 31)
    return vk

# Numpad shift workaround state
def _is_numpad_affected(vk):
    return vk in (0x60,0x61,0x62,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6E)

class LeftyRemapper:
    def __init__(self):
        self.hook_handle = None
        self.hook_handle_copy = None
        self.hook_proc_ptr = None
        self.thread = None
        self.running = False
        self._vk_map: dict[int, int] = {}
        # State: singleKeyRemap + scanMap + numpadPressed + injectionFailed
        self._send_map: dict[int, tuple[int, int, int]] = {}
        self._scan_map: dict[int, int] = {}
        self._numpad_pressed: dict[int, bool] = {}
        self._injection_failed: set[int] = set()
        self.stats = {"remaps": 0, "suppress": 0, "latency_sum": 0.0, "count": 0}
        self._latency_enabled = False
        self._hook_thread_id = None
        self._invert_clicks = False
        self._invert_clicks_original = None
        self._last_hook_time = 0.0
        self._watchdog_thread = None
        self._watchdog_running = False
        atexit.register(self.stop)
        _ensure_lowlevel_timeout(3000)

    def set_mappings(self, vk_map: dict[int, int]):
        # No expansion — exact VK->VK only
        self._vk_map = dict(vk_map)
        send_map = {}
        scan_map = {}
        numpad_pressed = {}
        for src, dst in vk_map.items():
            if dst == VK_DISABLED or dst == VK_DISABLED_LEGACY or dst == 0:
                send_map[src] = (0, 0, VK_DISABLED)
                continue
            scan = _vk_to_scan(dst)
            flags = 0
            if dst in EXTENDED_VKS:
                flags |= KEYEVENTF_EXTENDEDKEY
            send_map[src] = (scan, flags, dst)
            # scanMap for numpad shift workaround
            if _is_numpad_affected(src):
                sc = _vk_to_scan(src)
                if sc != 0:
                    scan_map[sc] = src
        self._send_map = send_map
        self._scan_map = scan_map
        self._numpad_pressed = numpad_pressed
        self._injection_failed = set()
        print(f"[Lefty] Mapeos actualizados: {len(vk_map)} remaps (native, no OEM expansion)")
        for s, d in list(vk_map.items())[:12]:
            sc, fl, _ = send_map.get(s, (0,0,0))
            print(f"  {s:02X} -> {d:02X} (scan {sc:02X} flags {fl:X})")
        if len(vk_map) > 12:
            print(f"  ... +{len(vk_map)-12} más")

    def set_mouse_invert(self, enabled: bool):
        self._invert_clicks = enabled
        try:
            if self._invert_clicks_original is None:
                self._invert_clicks_original = bool(user32.GetSystemMetrics(23))
            user32.SwapMouseButton(enabled)
            print(f"[Lefty] Inversión clicks {'ACTIVADA' if enabled else 'DESACTIVADA'} (SwapMouseButton 0ms)")
        except Exception as e:
            print(f"[Lefty] Error SwapMouseButton: {e}")

    def get_mouse_inverted(self) -> bool:
        return self._invert_clicks

    def _send_input(self, scan: int, flags_base: int, vk: int, is_keyup: bool):
        if vk == VK_DISABLED or vk == VK_DISABLED_LEGACY or vk == 0:
            return True
        inp = INPUT()
        inp.type = INPUT_KEYBOARD
        inp.union.ki.wVk = vk & 0xFFFF
        inp.union.ki.wScan = scan
        f = flags_base
        if is_keyup:
            f |= KEYEVENTF_KEYUP
        inp.union.ki.dwFlags = f
        inp.union.ki.time = 0
        inp.union.ki.dwExtraInfo = KEYBOARDMANAGER_SINGLEKEY_FLAG
        sent = user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
        return sent != 0

    def _low_level_proc(self, nCode, wParam, lParam):
        if nCode != HC_ACTION:
            return user32.CallNextHookEx(self.hook_handle_copy or self.hook_handle, nCode, wParam, lParam)
        t0 = time.perf_counter() if self._latency_enabled else 0.0
        kb = ctypes.cast(lParam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
        vk_raw = kb.vkCode
        scan = kb.scanCode
        flags = kb.flags
        extra = kb.dwExtraInfo
        # Lefty: SUPPRESS_FLAG check first
        if extra == KEYBOARDMANAGER_SUPPRESS_FLAG:
            return 1
        if extra & KEYBOARDMANAGER_INJECTED_FLAG:
            return user32.CallNextHookEx(self.hook_handle_copy or self.hook_handle, nCode, wParam, lParam)
        extended = bool(flags & 0x01)
        vk = _encode_numpad_origin(vk_raw, extended)
        # Lefty UpdateNumpadWithShift
        # Decode if numpad originated or VK_CLEAR
        if (vk & (1 << 31)) != 0 or vk_raw == 0x0C:
            decoded = vk & ~(1 << 31)
            if decoded == 0x0C:
                decoded = vk_raw
            # scan for decoded
            sc = _vk_to_scan(decoded)
            origin = self._scan_map.get(sc)
            if origin is not None:
                rem = self._send_map.get(origin)
                if rem is not None:
                    _, _, dst = rem
                    if dst in (0x10, 0xA0, 0xA1):
                        if self._numpad_pressed.get(origin, False):
                            vk = origin
        # Track numpad press
        clean_vk = vk & ~(1 << 31)
        if _is_numpad_affected(clean_vk):
            is_down = (wParam == WM_KEYDOWN or wParam == WM_SYSKEYDOWN)
            self._numpad_pressed[clean_vk] = is_down

        is_keydown = (wParam == WM_KEYDOWN or wParam == WM_SYSKEYDOWN)
        is_keyup = not is_keydown

        # native low-level lookup: singleKeyRemap via vk only, no scan fallback, no OEM/gen expansion
        send_info = self._send_map.get(vk)
        if send_info is None:
            vk_clear = vk & ~(1 << 31)
            if vk_clear != vk:
                send_info = self._send_map.get(vk_clear)
            if send_info is None:
                return user32.CallNextHookEx(self.hook_handle_copy or self.hook_handle, nCode, wParam, lParam)

        # Injection failed passthrough: if previous down was blocked, pass the up through
        if is_keyup and vk in self._injection_failed:
            self._injection_failed.discard(vk)
            return user32.CallNextHookEx(self.hook_handle_copy or self.hook_handle, nCode, wParam, lParam)

        scan_dst, flags_base, vk_dst = send_info
        if vk_dst == VK_DISABLED or vk_dst == VK_DISABLED_LEGACY:
            if self._latency_enabled:
                dt = (time.perf_counter() - t0) * 1000.0
                self.stats["latency_sum"] += dt
                self.stats["count"] += 1
            self.stats["remaps" if is_keydown else "suppress"] += 1
            return 1

        # Lefty IME workaround: before sending target down, if original is modifier and target is not, send suppress for original
        # Minimal port: send suppressed key-up for original with SUPPRESS_FLAG if needed
        if is_keydown:
            # Check is_modifier
            try:
                from core.keys import is_modifier
                if is_modifier(vk_clear) and not is_modifier(vk_dst) and vk_dst != 0x14 and vk_clear not in (0x5B, 0x5C):
                    # send suppressed
                    inp = INPUT()
                    inp.type = INPUT_KEYBOARD
                    inp.union.ki.wVk = vk_clear & 0xFFFF
                    inp.union.ki.wScan = _vk_to_scan(vk_clear)
                    inp.union.ki.dwFlags = KEYEVENTF_KEYUP
                    inp.union.ki.dwExtraInfo = KEYBOARDMANAGER_SUPPRESS_FLAG
                    user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
            except:
                pass

        ok = self._send_input(scan_dst, flags_base, vk_dst, is_keyup)
        if not ok:
            # Injection blocked by UIPI — pass original through and remember to pass the up
            if is_keydown:
                self._injection_failed.add(vk)
            return user32.CallNextHookEx(self.hook_handle_copy or self.hook_handle, nCode, wParam, lParam)
        else:
            if is_keydown:
                self._injection_failed.discard(vk)

        if self._latency_enabled:
            dt = (time.perf_counter() - t0) * 1000.0
            self.stats["latency_sum"] += dt
            self.stats["count"] += 1
        self.stats["remaps" if is_keydown else "suppress"] += 1
        return 1

    def _hook_thread_proc(self):
        try:
            kernel32.SetThreadPriority(kernel32.GetCurrentThread(), 15)
        except:
            pass
        self.hook_proc_ptr = LowLevelKeyboardProc(self._low_level_proc)
        self.hook_handle = user32.SetWindowsHookExW(WH_KEYBOARD_LL, self.hook_proc_ptr, 0, 0)
        if not self.hook_handle:
            mod_handle = kernel32.GetModuleHandleW(None)
            self.hook_handle = user32.SetWindowsHookExW(WH_KEYBOARD_LL, self.hook_proc_ptr, mod_handle, 0)
        if not self.hook_handle:
            err = kernel32.GetLastError()
            print(f"[Lefty] ERROR SetWindowsHookEx falló: {err}")
            self.running = False
            return
        self.hook_handle_copy = self.hook_handle
        self._hook_thread_id = kernel32.GetCurrentThreadId()
        self._last_hook_time = time.monotonic()
        print(f"[Lefty] Hook TECLADO instalado handle={self.hook_handle} admin={bool(is_admin)} modo=native")
        self._watchdog_running = True
        self._watchdog_thread = threading.Thread(target=self._watchdog_proc, daemon=True, name="LeftyWatchdog")
        self._watchdog_thread.start()
        msg = wt.MSG()
        while self.running:
            ret = user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
            if ret == 0 or ret == -1:
                break
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))
        print("[Lefty] Hook thread terminado")
        self._watchdog_running = False

    def _watchdog_proc(self):
        time.sleep(1.0)
        while self._watchdog_running and self.running:
            time.sleep(2.0)
            if not self.running or not self.hook_handle:
                continue
            if self.thread and not self.thread.is_alive():
                print("[Lefty][Watchdog] Hook thread muerto -> reinstalando...")
                self._reinstall_hook()
                continue
            try:
                import winreg
                k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop", 0, winreg.KEY_READ)
                v,_ = winreg.QueryValueEx(k, "LowLevelHooksTimeout")
                winreg.CloseKey(k)
                if int(v) < 1000:
                    print(f"[Lefty][Watchdog] LowLevelHooksTimeout bajo ({v}) -> corrigiendo a 3000")
                    _ensure_lowlevel_timeout(3000)
            except:
                pass

    def _reinstall_hook(self):
        try:
            old = self.hook_handle
            if old:
                try:
                    user32.UnhookWindowsHookEx(old)
                except:
                    pass
            self.hook_handle = None
            time.sleep(0.15)
            if self.hook_proc_ptr is None:
                self.hook_proc_ptr = LowLevelKeyboardProc(self._low_level_proc)
            h = user32.SetWindowsHookExW(WH_KEYBOARD_LL, self.hook_proc_ptr, 0, 0)
            if not h:
                mod = kernel32.GetModuleHandleW(None)
                h = user32.SetWindowsHookExW(WH_KEYBOARD_LL, self.hook_proc_ptr, mod, 0)
            if h:
                self.hook_handle = h
                self.hook_handle_copy = h
                self._last_hook_time = time.monotonic()
                print(f"[Lefty][Watchdog] Hook reinstalado ok handle={h}")
                return True
            else:
                print(f"[Lefty][Watchdog] Reinstall falló err={kernel32.GetLastError()}")
        except Exception as e:
            print(f"[Lefty][Watchdog] reinstall error: {e}")
        return False

    def force_reinstall(self):
        return self._reinstall_hook()

    def start(self):
        if self.running:
            return False
        _ensure_lowlevel_timeout(3000)
        self.running = True
        self.thread = threading.Thread(target=self._hook_thread_proc, daemon=True, name="LeftyHook")
        self.thread.start()
        for _ in range(30):
            if self.hook_handle:
                break
            time.sleep(0.05)
        ok = self.hook_handle is not None
        if ok:
            print("[Lefty] Engine iniciado OK - native engine")
        return ok

    def stop(self):
        if not self.running:
            if self._invert_clicks and self._invert_clicks_original is not None:
                try:
                    user32.SwapMouseButton(self._invert_clicks_original)
                except:
                    pass
            return
        self.running = False
        self._watchdog_running = False
        if self.hook_handle:
            try:
                user32.UnhookWindowsHookEx(self.hook_handle)
            except:
                pass
            self.hook_handle = None
            self.hook_handle_copy = None
        try:
            if self._hook_thread_id:
                user32.PostThreadMessageW(self._hook_thread_id, 0x0012, 0, 0)
        except:
            pass
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        if self._invert_clicks_original is not None:
            try:
                current = bool(user32.GetSystemMetrics(23))
                if current != self._invert_clicks_original:
                    user32.SwapMouseButton(self._invert_clicks_original)
                    print(f"[Lefty] Restaurado estado mouse original={self._invert_clicks_original}")
            except:
                pass
        print("[Lefty] Engine detenido")

    def get_avg_latency(self) -> float:
        if self.stats["count"] == 0:
            return 0.0
        return self.stats["latency_sum"] / self.stats["count"]

    def is_running(self) -> bool:
        return self.running and self.hook_handle is not None and (self.thread is None or self.thread.is_alive())

    def is_hook_responsive(self) -> bool:
        return self.is_running()

    def enable_latency_measure(self, enabled: bool):
        self._latency_enabled = enabled
        if not enabled:
            self.stats["latency_sum"] = 0.0
            self.stats["count"] = 0

USE_ISOLATED_ENGINE = True
USE_RUST_ENGINE = True

def _get_rust_exe() -> pathlib.Path | None:
    import pathlib, sys
    if hasattr(sys, "_MEIPASS"):
        p = pathlib.Path(sys._MEIPASS) / "lefty_engine.exe"
        if p.exists():
            return p
    p = pathlib.Path(__file__).parent.parent / "engine_native" / "target" / "release" / "lefty_engine.exe"
    if p.exists():
        return p
    p2 = pathlib.Path(__file__).parent.parent / "lefty_engine.exe"
    if p2.exists():
        return p2
    try:
        exe_dir = pathlib.Path(sys.executable).parent
        p3 = exe_dir / "lefty_engine.exe"
        if p3.exists():
            return p3
    except:
        pass
    return None

def _mappings_path() -> pathlib.Path:
    import pathlib, os
    appdata = os.getenv("APPDATA", str(pathlib.Path.home()))
    d = pathlib.Path(appdata) / "Lefty"
    d.mkdir(parents=True, exist_ok=True)
    return d / "engine_mappings.json"

def _write_mappings_file(vk_map: dict):
    try:
        import json, pathlib
        p = _mappings_path()
        with open(p, "w", encoding="utf-8") as f:
            json.dump({str(k): v for k, v in vk_map.items()}, f)
    except Exception as e:
        print(f"[Lefty Proxy] write mappings err {e}")

class LeftyRemapperProxy:
    def __init__(self):
        self._core = LeftyRemapper()
        self._proc = None
        self._queue = None
        self._stop_event = None
        self._use_isolated = USE_ISOLATED_ENGINE
        self._use_rust = USE_RUST_ENGINE
        self._vk_map_cache = {}
        self._running_proxy = False
        self._is_rust = False
        atexit.register(self.stop)

    def _spawn(self, vk_map):
        if not self._use_isolated:
            return False
        if self._use_rust:
            rust_exe = _get_rust_exe()
            if rust_exe:
                try:
                    import subprocess, pathlib
                    _write_mappings_file(vk_map or self._vk_map_cache)
                    cmd = [str(rust_exe), "--parent-pid", str(os.getpid()), "--mappings", str(_mappings_path())]
                    CREATE_NO_WINDOW = 0x08000000
                    self._proc = subprocess.Popen(
                        cmd,
                        creationflags=CREATE_NO_WINDOW if os.name=="nt" else 0,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        stdin=subprocess.DEVNULL,
                        close_fds=False
                    )
                    self._is_rust = True
                    time.sleep(0.35)
                    if self._proc.poll() is None:
                        print(f"[Lefty Proxy] Engine Rust native PID={self._proc.pid} (native)")
                        self._running_proxy = True
                        return True
                    else:
                        print(f"[Lefty Proxy] Rust engine exit code {self._proc.returncode}, fallback Python", flush=True)
                        self._proc = None
                except Exception as e:
                    print(f"[Lefty Proxy] Rust spawn err {e}, fallback Python", flush=True)
        try:
            import multiprocessing
            ctx = multiprocessing.get_context("spawn")
            self._queue = ctx.Queue()
            self._stop_event = ctx.Event()
            import engine.engine_process as ep
            self._proc = ctx.Process(target=ep.isolated_main, args=(self._queue, self._stop_event, vk_map), daemon=True, name="LeftyEngine")
            self._proc.start()
            for _ in range(20):
                if self._proc.is_alive():
                    break
                time.sleep(0.05)
            if self._proc.is_alive():
                print(f"[Lefty Proxy] Engine Python aislado PID={self._proc.pid}")
                self._is_rust = False
                self._running_proxy = True
                return True
        except Exception as e:
            print(f"[Lefty Proxy] Fallback a in-process por error: {e}", flush=True)
            import traceback; traceback.print_exc()
        self._proc = None
        self._queue = None
        self._stop_event = None
        self._use_isolated = False
        return False

    def _is_proc_alive(self) -> bool:
        if not self._proc:
            return False
        if self._is_rust:
            try:
                return self._proc.poll() is None
            except:
                return False
        try:
            return self._proc.is_alive()
        except:
            return False

    def set_mappings(self, vk_map: dict[int, int]):
        self._vk_map_cache = dict(vk_map)
        try:
            self._core.set_mappings(vk_map)
        except: pass
        if self._is_rust and self._proc and self._is_proc_alive():
            try:
                _write_mappings_file(vk_map)
                print(f"[Lefty Proxy] Mappings escritos para Rust PID={self._proc.pid}", flush=True)
            except Exception as e:
                print(f"[Lefty Proxy] rust write err {e}", flush=True)
        elif self._proc and self._is_proc_alive() and self._queue:
            try:
                while not self._queue.empty():
                    try: self._queue.get_nowait()
                    except: break
                self._queue.put(dict(vk_map))
                print(f"[Lefty Proxy] Mappings enviados a engine PID={self._proc.pid}", flush=True)
            except Exception as e:
                print(f"[Lefty Proxy] queue put err {e}", flush=True)
        if self._running_proxy and not self._is_proc_alive():
            print("[Lefty Proxy] Engine muerto, respawn", flush=True)
            self._spawn(vk_map)

    def set_mouse_invert(self, enabled: bool):
        return self._core.set_mouse_invert(enabled)

    def get_mouse_inverted(self) -> bool:
        return self._core.get_mouse_inverted()

    def start(self):
        if self._running_proxy or self._is_proc_alive():
            return True
        vk_map = self._vk_map_cache
        if not vk_map:
            vk_map = getattr(self._core, "_vk_map", {})
        if self._use_isolated:
            ok = self._spawn(vk_map)
            if ok:
                self._running_proxy = True
                time.sleep(0.35)
                return self.is_running()
        print("[Lefty Proxy] Usando engine in-process (fallback)", flush=True)
        self._use_isolated = False
        ok = self._core.start()
        self._running_proxy = ok
        return ok

    def stop(self):
        if self._proc:
            try:
                if self._is_rust:
                    try:
                        self._proc.terminate()
                        try:
                            self._proc.wait(timeout=1.2)
                        except:
                            pass
                        if self._proc.poll() is None:
                            try: self._proc.kill()
                            except: pass
                    except: pass
                else:
                    if self._queue:
                        try: self._queue.put({"__cmd":"stop"})
                        except: pass
                    if self._stop_event:
                        self._stop_event.set()
                    self._proc.join(timeout=1.2)
                    if self._proc.is_alive():
                        self._proc.terminate()
                        self._proc.join(timeout=0.8)
                    if self._proc.is_alive():
                        try: self._proc.kill()
                        except: pass
            except: pass
            self._proc = None
            self._queue = None
            self._stop_event = None
            self._is_rust = False
        try:
            if self._core.is_running():
                self._core.stop()
        except: pass
        self._running_proxy = False

    def is_running(self) -> bool:
        if self._proc:
            return self._is_proc_alive()
        return self._core.is_running()

    def is_hook_responsive(self) -> bool:
        return self.is_running()

    def force_reinstall(self):
        if self._proc and not self._is_proc_alive():
            return self._spawn(self._vk_map_cache)
        if self._use_isolated and self._proc:
            try:
                self.stop()
                time.sleep(0.2)
                return self._spawn(self._vk_map_cache) and self.start()
            except: pass
        return self._core.force_reinstall() if hasattr(self._core, "force_reinstall") else False

    def get_avg_latency(self) -> float:
        return self._core.get_avg_latency()

    def enable_latency_measure(self, enabled: bool):
        return self._core.enable_latency_measure(enabled)

    @property
    def stats(self):
        return self._core.stats

    @property
    def hook_handle(self):
        if self._proc and self._is_proc_alive():
            try:
                return self._proc.pid
            except:
                return 1
        return self._core.hook_handle

_global_remapper = None
def get_remapper():
    global _global_remapper
    if _global_remapper is None:
        if USE_ISOLATED_ENGINE:
            _global_remapper = LeftyRemapperProxy()
        else:
            _global_remapper = LeftyRemapper()
    return _global_remapper
