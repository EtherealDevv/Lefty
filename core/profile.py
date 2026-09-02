"""
Lefty - Remapping profiles for left-handed
Structure: {profile_name: {"display_name": str, "description": str, "mappings": [[src, dst]], "app_specific": {exe: [[src,dst]]}}}
For gaming: 1:1 key-to-key mapping, no complex shortcuts (less latency)
"""
from .keys import VK_MAP

# Predefined profiles optimized for left-handed
BUILTIN_PROFILES = {
    "zurdo_ijkl": {
        "display_name": "Left-handed IJKL (Recommended)",
        "description": "WASD → IJKL, ideal for left-handed. I=forward, J=left, K=back, L=right",
        "icon": "🎮",
        "mappings": [
            ["W", "I"],
            ["A", "J"],
            ["S", "K"],
            ["D", "L"],
            ["Q", "U"],
            ["E", "O"],
            ["R", "P"],
            ["F", "M"],
            ["C", "N"],
        ],
        "app_specific": {}
    },
    "zurdo_flechas": {
        "display_name": "Arrow Keys",
        "description": "WASD → Arrow Keys. For those using arrow keys with left hand",
        "icon": "⬆️",
        "mappings": [
            ["W", "UP"],
            ["A", "LEFT"],
            ["S", "DOWN"],
            ["D", "RIGHT"],
        ],
        "app_specific": {}
    },
    "zurdo_numpad": {
        "display_name": "Numpad 8456",
        "description": "WASD → Numpad 8,4,5,6. Useful if you use numpad for movement",
        "icon": "🔢",
        "mappings": [
            ["W", "NUM8"],
            ["A", "NUM4"],
            ["S", "NUM5"],
            ["D", "NUM6"],
        ],
        "app_specific": {}
    },
    "zurdo_espejo": {
        "display_name": "Full Mirror",
        "description": "Mirror mapping: entire WASD area mirrored to IJKL + QE→UO, etc.",
        "icon": "🪞",
        "mappings": [
            ["W", "I"], ["A", "J"], ["S", "K"], ["D", "L"],
            ["Q", "U"], ["E", "O"], ["R", "P"], ["T", "H"],
            ["F", "M"], ["G", "N"], ["Z", "B"], ["X", "V"],
            ["V", "X"], ["B", "Z"],
            ["1", "0"], ["2", "9"], ["3", "8"], ["4", "7"],
        ],
        "app_specific": {}
    },
    "zurdo_okl_semicolon": {
        "display_name": "OKL; (FPS Pro)",
        "description": "Used by left-handed pros: O=forward, K=back, L=right, ;=left",
        "icon": "🎯",
        "mappings": [
            ["W", "O"],
            ["A", "K"],
            ["S", "L"],
            ["D", ";"],
        ],
        "app_specific": {}
    },
    "sycho": {
        "display_name": "Sycho — OÑLK",
        "description": "Your layout: O=W (forward), K=A (left), L=S (back), Ñ=D (right). Right side mirrored + Shift/Ctrl",
        "icon": "💀",
        "mappings": [
            ["O", "W"],
            ["K", "A"],
            ["L", "S"],
            ["Ñ", "D"],
            # Top row mirrored right→left (P→Q, I→E, U→R, Y→T)
            ["I", "E"],
            ["P", "Q"],
            ["U", "R"],
            ["Y", "T"],
            # Middle row mirrored
            ["J", "F"],
            ["H", "G"],
            # Bottom row mirrored right→left
            ["M", "C"],
            ["N", "V"],
            [",", "X"],
            [".", "Z"],
            # Modifiers mirrored (right → left)
            ["RSHIFT", "LSHIFT"],
            ["RCTRL", "LCTRL"],
            ["RALT", "LALT"],
        ],
        "app_specific": {}
    },
    "custom": {
        "display_name": "Custom",
        "description": "Create your own key-by-key mapping",
        "icon": "✏️",
        "mappings": [],
        "app_specific": {}
    },
    "disabled": {
        "display_name": "Disabled",
        "description": "No remapping, normal keyboard",
        "icon": "⏸️",
        "mappings": [],
        "app_specific": {}
    }
}

def get_profile_names(profiles: dict) -> list:
    return list(profiles.keys())

def get_mappings_for_profile(profiles: dict, name: str) -> list:
    p = profiles.get(name, {})
    return p.get("mappings", [])

def add_mapping(profiles: dict, profile_name: str, src: str, dst: str):
    if profile_name not in profiles:
        profiles[profile_name] = {"display_name": profile_name, "description": "", "mappings": [], "app_specific": {}}
    # avoid duplicates: replace if src already exists
    mappings = profiles[profile_name]["mappings"]
    for i, (s, d) in enumerate(mappings):
        if s.upper() == src.upper():
            mappings[i] = [src.upper(), dst.upper()]
            return
    mappings.append([src.upper(), dst.upper()])

def remove_mapping(profiles: dict, profile_name: str, src: str):
    if profile_name not in profiles:
        return
    profiles[profile_name]["mappings"] = [m for m in profiles[profile_name]["mappings"] if m[0].upper() != src.upper()]

def validate_mapping(src: str, dst: str) -> tuple[bool, str]:
    from .keys import VK_MAP
    if src.upper() not in VK_MAP:
        return False, f"Source key '{src}' not valid"
    if dst.upper() not in VK_MAP:
        return False, f"Target key '{dst}' not valid"
    if src.upper() == dst.upper():
        return False, "Source and target cannot be the same"
    return True, "OK"

def profile_to_vk_map(profile: dict) -> dict[int, int]:
    """Convert name mappings to dict vk_src -> vk_dst, optimized for hook"""
    out = {}
    for src, dst in profile.get("mappings", []):
        if src.upper() == dst.upper():
            continue  # ignore self-mapping
        sv = VK_MAP.get(src.upper())
        dv = VK_MAP.get(dst.upper())
        if sv is not None and dv is not None:
            out[sv] = dv
    return out
