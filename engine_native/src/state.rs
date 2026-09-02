//! MappingConfiguration + State
//! SingleKeyRemapTable = HashMap<DWORD, KeyShortcutTextUnion> but we store only DWORD->DWORD (key->key)
//! Plus scanMap / numpadKeyPressed for shift+numpad workaround, and injection-failed tracking.

use std::collections::{HashMap, HashSet};

pub const VK_WIN_BOTH: u32 = 0x104;
pub const VK_DISABLED: u32 = 0x100;

#[derive(Default)]
pub struct State {
    /// singleKeyReMap: original VK -> remapped VK (or VK_DISABLED)
    pub single_key_remap: HashMap<u32, u32>,
    /// scanMap: scanCode -> original VK (for numpad shift workaround)
    pub scan_map: HashMap<u32, u32>,
    /// numpadKeyPressed: original VK -> is currently down
    pub numpad_key_pressed: HashMap<u32, bool>,
    /// injection failure tracking
    pub injection_failed: HashSet<u32>,
}

impl State {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn clear(&mut self) {
        self.single_key_remap.clear();
        self.scan_map.clear();
        self.numpad_key_pressed.clear();
        self.injection_failed.clear();
    }

    /// AddSingleKeyRemap
    /// Returns false if key already remapped (duplicate).
    pub fn add_single_key_remap(&mut self, original: u32, remapped: u32) -> bool {
        if self.single_key_remap.contains_key(&original) {
            return false;
        }
        self.single_key_remap.insert(original, remapped);
        if crate::helpers::is_numpad_key_affected_by_shift(original) {
            let sc = unsafe {
                windows::Win32::UI::Input::KeyboardAndMouse::MapVirtualKeyW(
                    original,
                    windows::Win32::UI::Input::KeyboardAndMouse::MAPVK_VK_TO_VSC,
                )
            };
            if sc != 0 {
                self.scan_map.insert(sc, original);
            }
        }
        true
    }

    pub fn set_single_key_remap(&mut self, src: u32, dst: u32) {
        // Lefty AddSingleKeyRemap semantics: overwrite is allowed via Clear + Add in our engine
        // For engine reload we clear then add, so we can just insert.
        self.single_key_remap.insert(src, dst);
        if crate::helpers::is_numpad_key_affected_by_shift(src) {
            let sc = unsafe {
                windows::Win32::UI::Input::KeyboardAndMouse::MapVirtualKeyW(
                    src,
                    windows::Win32::UI::Input::KeyboardAndMouse::MAPVK_VK_TO_VSC,
                )
            };
            if sc != 0 {
                self.scan_map.insert(sc, src);
            }
        }
    }

    pub fn get_single_key_remap(&self, vk: u32) -> Option<u32> {
        self.single_key_remap.get(&vk).copied()
    }

    // Injection failure tracking — exact Lefty State
    pub fn set_single_key_remap_injection_failed(&mut self, source_key: u32, failed: bool) {
        if failed {
            self.injection_failed.insert(source_key);
        } else {
            self.injection_failed.remove(&source_key);
        }
    }

    pub fn consume_single_key_remap_injection_failed(&mut self, source_key: u32) -> bool {
        self.injection_failed.remove(&source_key)
    }
}
