//! Keyboard helpers — low-level port of Helpers.h/cpp
//! Keeps TIME_CRITICAL/no-GIL optimization, logic 1:1 (no OEM/scan improvisation).

use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, MAPVK_VK_TO_VSC,
    MapVirtualKeyW,
};

// Win32 constants
pub const VK_WIN_BOTH: u32 = 0x104;
pub const VK_DISABLED: u32 = 0x100;
pub const DUMMY_KEY: u32 = 0xFF;

pub const KEYBOARDMANAGER_INJECTED_FLAG: usize = 0x1;
pub const KEYBOARDMANAGER_SINGLEKEY_FLAG: usize = 0x11;
pub const KEYBOARDMANAGER_SHORTCUT_FLAG: usize = 0x101;
pub const KEYBOARDMANAGER_SUPPRESS_FLAG: usize = 0x111;

pub fn get_numpad_origin_encoding_bit() -> u32 {
    1u32 << 31
}

// EncodeKeyNumpadOrigin helper
pub fn encode_numpad_origin(vk: u32, extended: bool) -> u32 {
    let mut numpad_originated = false;
    match vk {
        0x25 | 0x26 | 0x27 | 0x28 | 0x2D | 0x2E | 0x21 | 0x22 | 0x24 | 0x23 => {
            numpad_originated = !extended;
        }
        0x0D | 0x6F => {
            numpad_originated = extended;
        }
        _ => {}
    }
    if numpad_originated {
        vk | get_numpad_origin_encoding_bit()
    } else {
        vk
    }
}

pub fn clear_numpad_origin(vk: u32) -> u32 {
    vk & !get_numpad_origin_encoding_bit()
}

pub fn is_numpad_originated(vk: u32) -> bool {
    (vk & get_numpad_origin_encoding_bit()) != 0
}

// VK_NUMPAD0..9 + VK_DECIMAL list
pub fn is_numpad_key_affected_by_shift(vk: u32) -> bool {
    matches!(vk, 0x60 | 0x61 | 0x62 | 0x63 | 0x64 | 0x65 | 0x66 | 0x67 | 0x68 | 0x69 | 0x6E)
}

// GetCombinedKey helper
pub fn get_combined_key(vk: u32) -> u32 {
    match vk {
        0x5B | 0x5C => VK_WIN_BOTH,
        0xA2 | 0xA3 => 0x11, // VK_CONTROL
        0xA4 | 0xA5 => 0x12, // VK_MENU
        0xA0 | 0xA1 => 0x10, // VK_SHIFT
        _ => vk,
    }
}

#[derive(Debug, PartialEq)]
pub enum KeyType {
    Win,
    Ctrl,
    Alt,
    Shift,
    Action,
}

pub fn get_key_type(vk: u32) -> KeyType {
    match vk {
        0x104 | 0x5B | 0x5C => KeyType::Win,
        0x11 | 0xA2 | 0xA3 => KeyType::Ctrl,
        0x12 | 0xA4 | 0xA5 => KeyType::Alt,
        0x10 | 0xA0 | 0xA1 => KeyType::Shift,
        _ => KeyType::Action,
    }
}

pub fn is_modifier_key(vk: u32) -> bool {
    get_key_type(vk) != KeyType::Action
}

// IsExtendedKey list
pub fn is_extended_key(vk: u32) -> bool {
    matches!(
        vk,
        0xA3 | 0xA5 // VK_RCONTROL, VK_RMENU
        | 0x90 // VK_NUMLOCK
        | 0x2C // VK_SNAPSHOT
        | 0x03 // VK_CANCEL
        | 0x2D // VK_INSERT
        | 0x24 // VK_HOME
        | 0x21 // VK_PRIOR
        | 0x2E // VK_DELETE
        | 0x23 // VK_END
        | 0x22 // VK_NEXT
        | 0x25 // VK_LEFT
        | 0x26 // VK_UP
        | 0x27 // VK_RIGHT
        | 0x28 // VK_DOWN
        | 0x5F // VK_SLEEP
        | 0xAD // VK_VOLUME_MUTE
        | 0xAE // VK_VOLUME_DOWN
        | 0xAF // VK_VOLUME_UP
        | 0xB0 // VK_MEDIA_NEXT_TRACK
        | 0xB1 // VK_MEDIA_PREV_TRACK
        | 0xB2 // VK_MEDIA_STOP
        | 0xB3 // VK_MEDIA_PLAY_PAUSE
        | 0xB7 // VK_LAUNCH_MEDIA_SELECT
        | 0xB4 // VK_LAUNCH_MAIL
        | 0xB6 // VK_LAUNCH_APP1
        | 0xB5 // VK_LAUNCH_APP2
        | 0xA6 // VK_BROWSER_BACK
        | 0xA7 // VK_BROWSER_FORWARD
        | 0xA8 // VK_BROWSER_REFRESH
        | 0xA9 // VK_BROWSER_STOP
        | 0xAA // VK_BROWSER_SEARCH
        | 0xAB // VK_BROWSER_FAVORITES
        | 0xAC // VK_BROWSER_HOME
    )
}

// FilterArtificialKeys helper
pub fn filter_artificial_keys(vk: u32) -> u32 {
    if vk == VK_WIN_BOTH {
        0x5B // VK_LWIN
    } else {
        vk
    }
}

// SetKeyEvent helper
// Sets wVk, wScan via MapVirtualKey, sets EXTENDED flag via IsExtendedKey, preserves flags & extraInfo.
pub fn set_key_event(out: &mut Vec<INPUT>, vk: u32, flags: u32, extra: usize) {
    let w_vk = filter_artificial_keys(vk) as u16;
    let mut dw_flags = flags;
    if is_extended_key(vk) {
        dw_flags |= KEYEVENTF_EXTENDEDKEY.0;
    }
    let w_scan = unsafe { MapVirtualKeyW(vk, MAPVK_VK_TO_VSC) as u16 };
    let inp = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(w_vk),
                wScan: w_scan,
                dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS(dw_flags),
                time: 0,
                dwExtraInfo: extra,
            },
        },
    };
    out.push(inp);
}

pub fn set_dummy_key_event(out: &mut Vec<INPUT>, extra: usize) {
    set_key_event(out, DUMMY_KEY, 0, extra);
    set_key_event(out, DUMMY_KEY, KEYEVENTF_KEYUP.0, extra);
}
