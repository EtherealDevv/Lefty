"""
Lefty - Key definitions and virtual codes
native low-level engine — no improvisation (no OEM expansion, no VkKeyScan, no scan priority)
Basado en Win32 Virtual-Key Codes y Helpers::IsExtendedKey / GetCombinedKey
"""

# VK list — 105-key LATAM (ISO) - distinct per physical position, no OEM alias expansion
# OEM mapping chosen for LATAM where ' (to right of 0) is VK_OEM_PLUS 0xBB and ´ (after P) is VK_OEM_4 0xDB
VK_MAP = {
    # Letters
    "A": 0x41, "B": 0x42, "C": 0x43, "D": 0x44, "E": 0x45, "F": 0x46,
    "G": 0x47, "H": 0x48, "I": 0x49, "J": 0x4A, "K": 0x4B, "L": 0x4C,
    "M": 0x4D, "N": 0x4E, "O": 0x4F, "P": 0x50, "Q": 0x51, "R": 0x52,
    "S": 0x53, "T": 0x54, "U": 0x55, "V": 0x56, "W": 0x57, "X": 0x58,
    "Y": 0x59, "Z": 0x5A,
    # Numbers top row
    "0": 0x30, "1": 0x31, "2": 0x32, "3": 0x33, "4": 0x34,
    "5": 0x35, "6": 0x36, "7": 0x37, "8": 0x38, "9": 0x39,
    # Function row
    "F1": 0x70, "F2": 0x71, "F3": 0x72, "F4": 0x73, "F5": 0x74, "F6": 0x75,
    "F7": 0x76, "F8": 0x77, "F9": 0x78, "F10": 0x79, "F11": 0x7A, "F12": 0x7B,
    "F13": 0x7C, "F14": 0x7D, "F15": 0x7E, "F16": 0x7F,
    "F17": 0x80, "F18": 0x81, "F19": 0x82, "F20": 0x83, "F21": 0x84, "F22": 0x85,
    "F23": 0x86, "F24": 0x87,
    # Specials
    "ESC": 0x1B, "SPACE": 0x20, "ENTER": 0x0D, "TAB": 0x09, "BACKSPACE": 0x08,
    "CAPSLOCK": 0x14, "CAPS": 0x14,
    "SHIFT": 0x10, "LSHIFT": 0xA0, "RSHIFT": 0xA1,
    "CTRL": 0x11, "LCTRL": 0xA2, "RCTRL": 0xA3,
    "ALT": 0x12, "LALT": 0xA4, "RALT": 0xA5,
    "LWIN": 0x5B, "RWIN": 0x5C,
    # Navigation / editing
    "UP": 0x26, "DOWN": 0x28, "LEFT": 0x25, "RIGHT": 0x27,
    "INSERT": 0x2D, "DELETE": 0x2E, "HOME": 0x24, "END": 0x23,
    "PAGEUP": 0x21, "PAGEDOWN": 0x22,
    "NUMLOCK": 0x90, "SCROLLLOCK": 0x91, "SCROLL": 0x91,
    "PRINTSCREEN": 0x2C, "PRTSC": 0x2C,
    "PAUSE": 0x13, "BREAK": 0x03,
    # OEM 105-key LATAM — distinct per VK (LATAM correct)
    # 0xBA OEM_1 — Ñ key (to right of L)
    "Ñ": 0xBA, "OEM_1": 0xBA, ";": 0xBA, ":": 0xBA,
    # 0xBB OEM_PLUS — ' ? ¡ ¿ = key (to right of 0, next to Backspace) — distinct from 0xDE
    "'": 0xBB, "OEM_PLUS": 0xBB, "?": 0xBB, "¡": 0xBB, "¿": 0xBB, "=": 0xBB,
    # 0xBC OEM_COMMA
    ",": 0xBC, "OEM_COMMA": 0xBC,
    # 0xBD OEM_MINUS
    "-": 0xBD, "OEM_MINUS": 0xBD, "_": 0xBD,
    # 0xBE OEM_PERIOD
    ".": 0xBE, "OEM_PERIOD": 0xBE,
    # 0xBF OEM_2 — / 
    "/": 0xBF, "OEM_2": 0xBF,
    # 0xC0 OEM_3 — ` ° key (top-left, before 1)
    "`": 0xC0, "OEM_3": 0xC0, "°": 0xC0,
    # 0xDB OEM_4 — ´ ¨ [ { key (to right of P)
    "´": 0xDB, "OEM_4": 0xDB, "¨": 0xDB, "[": 0xDB, "{": 0xDB,
    # 0xDC OEM_5 — \ | ¬ key
    "\\": 0xDC, "OEM_5": 0xDC, "|": 0xDC, "¬": 0xDC,
    # 0xDD OEM_6 — + * ] } key (to right of ´)
    "+": 0xDD, "OEM_6": 0xDD, "*": 0xDD, "]": 0xDD, "}": 0xDD,
    # 0xDE OEM_7 — Ç ç { ^ ~ [ key (to right of Ñ, before Enter) — distinct from ' at 0xBB
    "Ç": 0xDE, "ç": 0xDE, "OEM_7": 0xDE, "\"": 0xDE,
    # 0xDF OEM_8 (rare)
    "OEM_8": 0xDF,
    # 0xE2 OEM_102 — < > key (ISO extra between Shift and Z) — 105th key (distinct from BC)
    "OEM_102": 0xE2, ">": 0xE2,
    # Numpad
    "NUM0": 0x60, "NUM1": 0x61, "NUM2": 0x62, "NUM3": 0x63, "NUM4": 0x64,
    "NUM5": 0x65, "NUM6": 0x66, "NUM7": 0x67, "NUM8": 0x68, "NUM9": 0x69,
    "NUM*": 0x6A, "NUM+": 0x6B, "NUM-": 0x6D, "NUM.": 0x6E, "NUM/": 0x6F,
    "NUMENTER": 0x0D,  # same VK as ENTER but extended — handled via IsExtended/NumpadOrigin
    # Media / Browser / Launch — extended keys
    "VOLUME_MUTE": 0xAD, "VOLUME_DOWN": 0xAE, "VOLUME_UP": 0xAF,
    "MEDIA_NEXT": 0xB0, "MEDIA_PREV": 0xB1, "MEDIA_STOP": 0xB2, "MEDIA_PLAY": 0xB3,
    "LAUNCH_MAIL": 0xB4, "LAUNCH_MEDIA": 0xB7,
    "BROWSER_BACK": 0xA6, "BROWSER_FORWARD": 0xA7, "BROWSER_REFRESH": 0xA8,
    "BROWSER_STOP": 0xA9, "BROWSER_SEARCH": 0xAA, "BROWSER_FAVORITES": 0xAB, "BROWSER_HOME": 0xAC,
    "SLEEP": 0x5F,
    # Special — disabled key
    "DISABLED": 0xFF,  # legacy alias -> expands to 0x100 in engine
    "DISABLED_100": 0x100,
}

# Reverse — first name wins
VK_REVERSE = {}
for _k, _v in VK_MAP.items():
    if _v not in VK_REVERSE:
        VK_REVERSE[_v] = _k

# Extended-key list (Helpers.cpp)
# Extended-key list
EXTENDED_KEYS = {
    0xA3, 0xA5,  # RCTRL, RMENU
    0x90,  # NUMLOCK
    0x2C,  # SNAPSHOT
    0x03,  # CANCEL
    0x2D, 0x24, 0x21, 0x2E, 0x23, 0x22,  # INS/HOME/PRIOR/DEL/END/NEXT
    0x25, 0x26, 0x27, 0x28,  # Arrows
    0x5F,  # SLEEP
    0xAD, 0xAE, 0xAF, 0xB0, 0xB1, 0xB2, 0xB3,  # Media
    0xB4, 0xB5, 0xB6, 0xB7,  # Launch Mail/App1/App2/MediaSelect
    0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xAB, 0xAC,  # Browser
}

def vk_name(vk_code: int) -> str:
    clean = vk_code & 0x7FFFFFFF
    if vk_code & (1 << 31):
        clean = vk_code & ~(1 << 31)
    return VK_REVERSE.get(clean, f"VK_{clean:02X}")

def name_to_vk(name: str) -> int:
    n = name.strip().upper()
    # No VkKeyScan heuristics, direct VK_MAP lookup only + hex parse
    if n in VK_MAP:
        return VK_MAP[n]
    if n.startswith("0X"):
        try:
            return int(n, 16)
        except:
            pass
    # Also accept plain decimal ("79")
    try:
        return int(n)
    except:
        pass
    return 0

def is_extended(vk: int) -> bool:
    return vk in EXTENDED_KEYS

def is_modifier(vk: int) -> bool:
    return vk in (0x10, 0xA0, 0xA1, 0x11, 0xA2, 0xA3, 0x12, 0xA4, 0xA5, 0x5B, 0x5C, 0x104)

def get_combined(vk: int) -> int:
    if vk in (0x5B, 0x5C):
        return 0x104  # VK_WIN_BOTH
    if vk in (0xA2, 0xA3):
        return 0x11
    if vk in (0xA4, 0xA5):
        return 0x12
    if vk in (0xA0, 0xA1):
        return 0x10
    return vk

GENERIC_TO_SPECIFIC = {
    0x10: [0xA0, 0xA1],
    0x11: [0xA2, 0xA3],
    0x12: [0xA4, 0xA5],
}

SPECIFIC_TO_GENERIC = {
    0xA0: 0x10, 0xA1: 0x10,
    0xA2: 0x11, 0xA3: 0x11,
    0xA4: 0x12, 0xA5: 0x12,
    0x5B: 0x104, 0x5C: 0x104,
}

def expand_vk_map(vk_map: dict[int, int]) -> dict[int, int]:
    """No OEM expansion, no scan priority — exact VK->VK only"""
    return dict(vk_map)

def lookup_remap(vk: int, vk_map: dict[int, int]) -> int | None:
    # singleKeyReMap lookup is exact VK only
    return vk_map.get(vk)

# Gaming helper list — keep but ensure distinct
GAMING_KEYS = [
    "W", "A", "S", "D",
    "Q", "E", "R", "F", "G", "T", "Z", "X", "C", "V", "B",
    "1", "2", "3", "4", "5",
    "SPACE", "SHIFT", "LSHIFT", "RSHIFT", "CTRL", "LCTRL", "RCTRL", "ALT", "LALT", "RALT", "TAB", "CAPSLOCK", "LWIN", "RWIN",
    "I", "J", "K", "L", "O", "P", "U", "N", "M", ",", ".", ";",
    "UP", "DOWN", "LEFT", "RIGHT",
    "F1", "F2", "F3", "F4",
    "ESC", "BACKSPACE", "ENTER",
]

# Full key list — all keys sorted
ALL_KEY_NAMES = sorted(VK_MAP.keys())
