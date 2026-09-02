// low-level port: src/common/interop/keyboard_layout.cpp + keyboard_layout_impl.h
// LayoutMap::LayoutMapImpl with UpdateLayout, GetKeyCodeList, GetKeyNameList, GetKeyName, GetKeyFromName
// No improvisation: uses ToUnicodeEx + MapVirtualKeyExW per Lefty, not static map

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyboardLayout, MapVirtualKeyExW, ToUnicodeEx, HKL, MAPVK_VK_TO_VSC,
};

const NUMPAD_ORIGIN_BIT: u32 = 1u32 << 31;
const VK_WIN_BOTH: u32 = 0x104;
const VK_DISABLED: u32 = 0x100;

struct LayoutMapImpl {
    keyboard_layout_map: HashMap<u32, String>,
    unicode_keys: HashMap<u32, String>,
    unknown_keys: HashMap<u32, String>,
    key_code_list: Vec<u32>,
    is_key_code_list_generated: bool,
    previous_layout: HKL,
}
unsafe impl Send for LayoutMapImpl {}
unsafe impl Sync for LayoutMapImpl {}

impl LayoutMapImpl {
    fn new() -> Self {
        Self {
            keyboard_layout_map: HashMap::new(),
            unicode_keys: HashMap::new(),
            unknown_keys: HashMap::new(),
            key_code_list: Vec::new(),
            is_key_code_list_generated: false,
            previous_layout: HKL(std::ptr::null_mut()),
        }
    }

    fn map_keycode_to_unicode(vcode: i32, layout: HKL, key_state: &[u8; 256]) -> Option<String> {
        unsafe {
            let scan_code = MapVirtualKeyExW(vcode as u32, MAPVK_VK_TO_VSC, layout);
            let mut out_buf = [0u16; 3];
            let w_flags: u32 = 1 << 2; // don't change keyboard state
            let result = ToUnicodeEx(
                vcode as u32,
                scan_code,
                key_state,
                &mut out_buf,
                w_flags,
                layout,
            );
            if result != 0 {
                // Convert first char(s) to string; Lefty uses szBuffer.data() which is wchar_t string
                let len = out_buf.iter().position(|&c| c == 0).unwrap_or(out_buf.len());
                if len > 0 {
                    if let Ok(s) = String::from_utf16(&out_buf[..len]) {
                        if !s.is_empty() {
                            return Some(s);
                        }
                    }
                }
            }
            None
        }
    }

    fn update_layout(&mut self) {
        unsafe {
            let layout = GetKeyboardLayout(0);
            if layout.0 == self.previous_layout.0 {
                return;
            }
            self.previous_layout = layout;
            if !self.is_key_code_list_generated {
                self.unicode_keys.clear();
                self.unknown_keys.clear();
            }

            let mut bt_keys = [0u8; 256];
            bt_keys[0x14] = 1; // VK_CAPITAL = 0x14

            for i in 1..256 {
                if let Some(s) = Self::map_keycode_to_unicode(i, layout, &bt_keys) {
                    self.keyboard_layout_map.insert(i as u32, s.clone());
                    if !self.is_key_code_list_generated {
                        self.unicode_keys.insert(i as u32, s);
                    }
                    continue;
                }
                let vk_str = format!("VK {}", i);
                self.keyboard_layout_map.insert(i as u32, vk_str.clone());
                if !self.is_key_code_list_generated {
                    self.unknown_keys.insert(i as u32, vk_str);
                }
            }

            // Override special key names — exact Lefty keyboard_layout.cpp
            self.keyboard_layout_map.insert(0x03, "Break".to_string()); // VK_CANCEL
            self.keyboard_layout_map.insert(0x08, "Backspace".to_string()); // VK_BACK
            self.keyboard_layout_map.insert(0x09, "Tab".to_string());
            self.keyboard_layout_map.insert(0x0C, "Clear".to_string());
            self.keyboard_layout_map.insert(0x10, "Shift".to_string());
            self.keyboard_layout_map.insert(0x11, "Ctrl".to_string());
            self.keyboard_layout_map.insert(0x12, "Alt".to_string());
            self.keyboard_layout_map.insert(0x13, "Pause".to_string());
            self.keyboard_layout_map.insert(0x14, "Caps Lock".to_string());
            self.keyboard_layout_map.insert(0x1B, "Esc".to_string());
            self.keyboard_layout_map.insert(0x20, "Space".to_string());
            self.keyboard_layout_map.insert(0x25, "Left".to_string());
            self.keyboard_layout_map.insert(0x27, "Right".to_string());
            self.keyboard_layout_map.insert(0x26, "Up".to_string());
            self.keyboard_layout_map.insert(0x28, "Down".to_string());
            self.keyboard_layout_map.insert(0x2D, "Insert".to_string());
            self.keyboard_layout_map.insert(0x2E, "Delete".to_string());
            self.keyboard_layout_map.insert(0x21, "PgUp".to_string());
            self.keyboard_layout_map.insert(0x22, "PgDn".to_string());
            self.keyboard_layout_map.insert(0x24, "Home".to_string());
            self.keyboard_layout_map.insert(0x23, "End".to_string());
            self.keyboard_layout_map.insert(0x0D, "Enter".to_string());
            // Numpad origin variants
            self.keyboard_layout_map.insert(0x25 | NUMPAD_ORIGIN_BIT, "Left (Numpad)".to_string());
            self.keyboard_layout_map.insert(0x27 | NUMPAD_ORIGIN_BIT, "Right (Numpad)".to_string());
            self.keyboard_layout_map.insert(0x26 | NUMPAD_ORIGIN_BIT, "Up (Numpad)".to_string());
            self.keyboard_layout_map.insert(0x28 | NUMPAD_ORIGIN_BIT, "Down (Numpad)".to_string());
            self.keyboard_layout_map.insert(0x2D | NUMPAD_ORIGIN_BIT, "Insert (Numpad)".to_string());
            self.keyboard_layout_map.insert(0x2E | NUMPAD_ORIGIN_BIT, "Delete (Numpad)".to_string());
            self.keyboard_layout_map.insert(0x21 | NUMPAD_ORIGIN_BIT, "PgUp (Numpad)".to_string());
            self.keyboard_layout_map.insert(0x22 | NUMPAD_ORIGIN_BIT, "PgDn (Numpad)".to_string());
            self.keyboard_layout_map.insert(0x24 | NUMPAD_ORIGIN_BIT, "Home (Numpad)".to_string());
            self.keyboard_layout_map.insert(0x23 | NUMPAD_ORIGIN_BIT, "End (Numpad)".to_string());
            self.keyboard_layout_map.insert(0x0D | NUMPAD_ORIGIN_BIT, "Enter (Numpad)".to_string());
            self.keyboard_layout_map.insert(0x6F | NUMPAD_ORIGIN_BIT, "/ (Numpad)".to_string());
            self.keyboard_layout_map.insert(0x6D, "- (Subtract)".to_string()); // VK_SUBTRACT
            self.keyboard_layout_map.insert(0x29, "Select".to_string());
            self.keyboard_layout_map.insert(0x2A, "Print".to_string());
            self.keyboard_layout_map.insert(0x2B, "Execute".to_string());
            self.keyboard_layout_map.insert(0x2C, "Print Screen".to_string());
            self.keyboard_layout_map.insert(0x2F, "Help".to_string());
            self.keyboard_layout_map.insert(0x5B, "Win (Left)".to_string());
            self.keyboard_layout_map.insert(0x5C, "Win (Right)".to_string());
            self.keyboard_layout_map.insert(0x5D, "Apps/Menu".to_string());
            self.keyboard_layout_map.insert(0x5F, "Sleep".to_string());
            for i in 0..10 {
                self.keyboard_layout_map.insert(0x60 + i, format!("NumPad {}", i));
            }
            self.keyboard_layout_map.insert(0x6E, ". (Numpad)".to_string()); // VK_DECIMAL
            self.keyboard_layout_map.insert(0x6B, "+ (Numpad)".to_string()); // VK_ADD? actually Lefty doesn't name but we keep
            self.keyboard_layout_map.insert(0x6A, "* (Numpad)".to_string());
            // F1-F24
            for i in 1..=24 {
                self.keyboard_layout_map.insert(0x6F + i, format!("F{}", i)); // 0x70 = F1
            }
            self.keyboard_layout_map.insert(0x90, "Num Lock".to_string());
            self.keyboard_layout_map.insert(0x91, "Scroll Lock".to_string());
            self.keyboard_layout_map.insert(0xA0, "Shift (Left)".to_string());
            self.keyboard_layout_map.insert(0xA1, "Shift (Right)".to_string());
            self.keyboard_layout_map.insert(0xA2, "Ctrl (Left)".to_string());
            self.keyboard_layout_map.insert(0xA3, "Ctrl (Right)".to_string());
            self.keyboard_layout_map.insert(0xA4, "Alt (Left)".to_string());
            self.keyboard_layout_map.insert(0xA5, "Alt (Right)".to_string());
            self.keyboard_layout_map.insert(0xA6, "Browser Back".to_string());
            self.keyboard_layout_map.insert(0xA7, "Browser Forward".to_string());
            self.keyboard_layout_map.insert(0xA8, "Browser Refresh".to_string());
            self.keyboard_layout_map.insert(0xA9, "Browser Stop".to_string());
            self.keyboard_layout_map.insert(0xAA, "Browser Search".to_string());
            self.keyboard_layout_map.insert(0xAB, "Browser Favorites".to_string());
            self.keyboard_layout_map.insert(0xAC, "Browser Home".to_string());
            self.keyboard_layout_map.insert(0xAD, "Volume Mute".to_string());
            self.keyboard_layout_map.insert(0xAE, "Volume Down".to_string());
            self.keyboard_layout_map.insert(0xAF, "Volume Up".to_string());
            self.keyboard_layout_map.insert(0xB0, "Next Track".to_string());
            self.keyboard_layout_map.insert(0xB1, "Previous Track".to_string());
            self.keyboard_layout_map.insert(0xB2, "Stop Media".to_string());
            self.keyboard_layout_map.insert(0xB3, "Play/Pause Media".to_string());
            self.keyboard_layout_map.insert(0xB4, "Start Mail".to_string());
            self.keyboard_layout_map.insert(0xB7, "Select Media".to_string());
            self.keyboard_layout_map.insert(0xB6, "Start App 1".to_string());
            self.keyboard_layout_map.insert(0xB5, "Start App 2".to_string());
            self.keyboard_layout_map.insert(0xE7, "Packet".to_string());
            self.keyboard_layout_map.insert(0x29, "Select".to_string());
            self.keyboard_layout_map.insert(0xFF, "Undefined".to_string());
            self.keyboard_layout_map.insert(VK_WIN_BOTH, "Win".to_string());
            // IME keys
            self.keyboard_layout_map.insert(0x15, "IME Kana".to_string());
            self.keyboard_layout_map.insert(0x16, "IME On".to_string());
            self.keyboard_layout_map.insert(0x17, "IME Junja".to_string());
            self.keyboard_layout_map.insert(0x18, "IME Final".to_string());
            self.keyboard_layout_map.insert(0x19, "IME Hanja".to_string());
            self.keyboard_layout_map.insert(0x1A, "IME Kanji".to_string());
            self.keyboard_layout_map.insert(0x1C, "IME Convert".to_string());
            self.keyboard_layout_map.insert(0x1D, "IME Non-Convert".to_string());
            self.keyboard_layout_map.insert(0x1E, "IME Accept".to_string());
            self.keyboard_layout_map.insert(0x1F, "IME Mode Change".to_string());
            self.keyboard_layout_map.insert(VK_DISABLED, "Disable".to_string());
        }
    }

    fn get_key_name(&mut self, vk: u32) -> String {
        self.update_layout();
        self.keyboard_layout_map.get(&vk).cloned().unwrap_or_else(|| "Undefined".to_string())
    }

    fn get_key_code_list(&mut self, is_shortcut: bool) -> Vec<u32> {
        self.update_layout();
        if !self.is_key_code_list_generated {
            let mut key_codes: Vec<u32> = Vec::new();
            // Add character keys where name == map[name] (not renamed)
            for (&code, name) in &self.unicode_keys {
                if let Some(mapped) = self.keyboard_layout_map.get(&code) {
                    if name == mapped {
                        key_codes.push(code);
                    }
                }
            }
            // Add modifier keys in alphabetical order (native order)
            key_codes.push(0x12); // VK_MENU
            key_codes.push(0xA4); // VK_LMENU
            key_codes.push(0xA5); // VK_RMENU
            key_codes.push(0x11); // VK_CONTROL
            key_codes.push(0xA2); // VK_LCONTROL
            key_codes.push(0xA3); // VK_RCONTROL
            key_codes.push(0x10); // VK_SHIFT
            key_codes.push(0xA0); // VK_LSHIFT
            key_codes.push(0xA1); // VK_RSHIFT
            key_codes.push(VK_WIN_BOTH);
            key_codes.push(0x5B); // VK_LWIN
            key_codes.push(0x5C); // VK_RWIN

            // Add all other special keys
            let mut special_keys: Vec<u32> = Vec::new();
            for i in 1..256 {
                if key_codes.contains(&(i as u32)) {
                    continue;
                }
                let it = self.unknown_keys.get(&(i as u32));
                if it.is_none() {
                    // it was unicode but renamed? That is special
                    special_keys.push(i as u32);
                } else if self.unknown_keys[&(i as u32)] != *self.keyboard_layout_map.get(&(i as u32)).unwrap_or(&format!("VK {}", i)) {
                    special_keys.push(i as u32);
                }
            }
            // Add numpad keys (those with origin bit)
            // Need to iterate over keyboard_layout_map in reverse and check origin bit
            let mut numpad_keys: Vec<u32> = Vec::new();
            for (&k, _) in &self.keyboard_layout_map {
                if k & NUMPAD_ORIGIN_BIT != 0 {
                    numpad_keys.push(k);
                }
            }
            // Lefty iterates rbegin and adds while origin bit set
            // We'll add them now
            for k in numpad_keys {
                if !key_codes.contains(&k) {
                    key_codes.push(k);
                }
            }
            // Sort specialKeys alphabetically by name
            special_keys.sort_by(|a, b| {
                let la = self.keyboard_layout_map.get(a).map(|s| s.as_str()).unwrap_or("");
                let lb = self.keyboard_layout_map.get(b).map(|s| s.as_str()).unwrap_or("");
                la.cmp(lb)
            });
            for k in special_keys {
                key_codes.push(k);
            }
            // Add unknown keys where name == map (still VK)
            for (&code, name) in &self.unknown_keys {
                if let Some(mapped) = self.keyboard_layout_map.get(&code) {
                    if name == mapped {
                        if !key_codes.contains(&code) {
                            key_codes.push(code);
                        }
                    }
                }
            }
            self.key_code_list = key_codes;
            self.is_key_code_list_generated = true;
        }
        let mut out = self.key_code_list.clone();
        if is_shortcut {
            out.insert(0, 0);
        }
        out
    }

    fn get_key_name_list(&mut self, is_shortcut: bool) -> Vec<(u32, String)> {
        let codes = self.get_key_code_list(is_shortcut);
        let mut out = Vec::new();
        if is_shortcut {
            out.push((0, "None".to_string()));
            for i in 1..codes.len() {
                let code = codes[i];
                if let Some(name) = self.keyboard_layout_map.get(&code) {
                    out.push((code, name.clone()));
                }
            }
        } else {
            for code in codes {
                if let Some(name) = self.keyboard_layout_map.get(&code) {
                    out.push((code, name.clone()));
                }
            }
        }
        out
    }

    fn get_key_from_name(&mut self, name: &str) -> Option<u32> {
        let list = self.get_key_name_list(false);
        for (code, n) in list {
            if n == name {
                return Some(code);
            }
        }
        None
    }
}

static LAYOUT: OnceLock<Mutex<LayoutMapImpl>> = OnceLock::new();

fn get_layout() -> &'static Mutex<LayoutMapImpl> {
    LAYOUT.get_or_init(|| Mutex::new(LayoutMapImpl::new()))
}

pub fn get_key_name(vk: u32) -> String {
    let layout = get_layout();
    let mut guard = layout.lock().unwrap();
    guard.get_key_name(vk)
}

pub fn get_key_code_list(is_shortcut: bool) -> Vec<u32> {
    let layout = get_layout();
    let mut guard = layout.lock().unwrap();
    guard.get_key_code_list(is_shortcut)
}

pub fn get_key_name_list(is_shortcut: bool) -> Vec<(u32, String)> {
    let layout = get_layout();
    let mut guard = layout.lock().unwrap();
    guard.get_key_name_list(is_shortcut)
}

pub fn get_key_from_name(name: &str) -> Option<u32> {
    let layout = get_layout();
    let mut guard = layout.lock().unwrap();
    guard.get_key_from_name(name)
}

pub fn update_layout() {
    let layout = get_layout();
    let mut guard = layout.lock().unwrap();
    guard.update_layout();
}
