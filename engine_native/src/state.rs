//! State — ultra-optimized for 0-delay gaming
//! MappingState is lock-free via ArcSwap, dynamic state via atomics

use std::sync::OnceLock;
use std::sync::atomic::AtomicBool;
use arc_swap::ArcSwap;
use std::sync::Arc;

pub const VK_WIN_BOTH: u32 = 0x104;
pub const VK_DISABLED: u32 = 0x100;
const MAP_SIZE: usize = 512;
const SCAN_SIZE: usize = 256;

static SCAN_CACHE: OnceLock<[u16; MAP_SIZE]> = OnceLock::new();

#[inline(always)]
fn get_scan_cache() -> &'static [u16; MAP_SIZE] {
    SCAN_CACHE.get_or_init(|| {
        let mut arr = [0u16; MAP_SIZE];
        for vk in 0..MAP_SIZE as u32 {
            let sc = unsafe {
                windows::Win32::UI::Input::KeyboardAndMouse::MapVirtualKeyW(
                    vk,
                    windows::Win32::UI::Input::KeyboardAndMouse::MAPVK_VK_TO_VSC,
                )
            };
            arr[vk as usize] = sc as u16;
        }
        arr
    })
}

#[inline(always)]
pub fn vk_to_scan_cached(vk: u32) -> u16 {
    let idx = (vk as usize) & 0x1FF;
    get_scan_cache()[idx]
}

#[derive(Clone)]
pub struct MappingState {
    pub single_key_remap: [Option<u32>; MAP_SIZE],
    pub scan_map: [Option<u32>; SCAN_SIZE],
}

impl Default for MappingState {
    fn default() -> Self {
        Self {
            single_key_remap: [None; MAP_SIZE],
            scan_map: [None; SCAN_SIZE],
        }
    }
}

pub struct State {
    pub mapping: ArcSwap<MappingState>,
    pub numpad_pressed: [AtomicBool; MAP_SIZE],
    pub injection_failed: [AtomicBool; MAP_SIZE],
}

impl State {
    pub fn new() -> Self {
        Self {
            mapping: ArcSwap::from_pointee(MappingState::default()),
            numpad_pressed: std::array::from_fn(|_| AtomicBool::new(false)),
            injection_failed: std::array::from_fn(|_| AtomicBool::new(false)),
        }
    }

    #[inline(always)]
    pub fn clear_mapping(&self) {
        let mut new = MappingState::default();
        self.mapping.store(Arc::new(new));
        for i in 0..MAP_SIZE {
            self.numpad_pressed[i].store(false, std::sync::atomic::Ordering::Relaxed);
            self.injection_failed[i].store(false, std::sync::atomic::Ordering::Relaxed);
        }
    }

    #[inline(always)]
    pub fn add_single_key_remap(&self, original: u32, remapped: u32) -> bool {
        let current = self.mapping.load();
        let idx = (original as usize) & 0x1FF;
        if current.single_key_remap[idx].is_some() {
            return false;
        }
        let mut new_state = (**current).clone();
        new_state.single_key_remap[idx] = Some(remapped);
        if crate::helpers::is_numpad_key_affected_by_shift(original) {
            let sc = vk_to_scan_cached(original);
            if sc != 0 && (sc as usize) < SCAN_SIZE {
                new_state.scan_map[sc as usize] = Some(original);
            }
        }
        self.mapping.store(Arc::new(new_state));
        true
    }

    #[inline(always)]
    pub fn set_single_key_remap(&self, src: u32, dst: u32) {
        let current = self.mapping.load();
        let mut new_state = (**current).clone();
        let idx = (src as usize) & 0x1FF;
        new_state.single_key_remap[idx] = Some(dst);
        if crate::helpers::is_numpad_key_affected_by_shift(src) {
            let sc = vk_to_scan_cached(src);
            if sc != 0 && (sc as usize) < SCAN_SIZE {
                new_state.scan_map[sc as usize] = Some(src);
            }
        }
        self.mapping.store(Arc::new(new_state));
    }

    #[inline(always)]
    pub fn get_single_key_remap(&self, vk: u32) -> Option<u32> {
        let mapping = self.mapping.load();
        let idx = (vk as usize) & 0x1FF;
        mapping.single_key_remap[idx]
    }

    #[inline(always)]
    pub fn get_scan_map(&self, scan: u32) -> Option<u32> {
        let mapping = self.mapping.load();
        if (scan as usize) < SCAN_SIZE {
            mapping.scan_map[scan as usize]
        } else {
            None
        }
    }

    #[inline(always)]
    pub fn set_single_key_remap_injection_failed(&self, source_key: u32, failed: bool) {
        let idx = (source_key as usize) & 0x1FF;
        self.injection_failed[idx].store(failed, std::sync::atomic::Ordering::Relaxed);
    }

    #[inline(always)]
    pub fn consume_single_key_remap_injection_failed(&self, source_key: u32) -> bool {
        let idx = (source_key as usize) & 0x1FF;
        self.injection_failed[idx].swap(false, std::sync::atomic::Ordering::Relaxed)
    }

    #[inline(always)]
    pub fn set_numpad_pressed(&self, vk: u32, pressed: bool) {
        let idx = (vk as usize) & 0x1FF;
        self.numpad_pressed[idx].store(pressed, std::sync::atomic::Ordering::Relaxed);
    }

    #[inline(always)]
    pub fn get_numpad_pressed(&self, vk: u32) -> bool {
        let idx = (vk as usize) & 0x1FF;
        self.numpad_pressed[idx].load(std::sync::atomic::Ordering::Relaxed)
    }

    #[inline(always)]
    pub fn clear_all(&self) {
        self.mapping.store(Arc::new(MappingState::default()));
        for i in 0..MAP_SIZE {
            self.numpad_pressed[i].store(false, std::sync::atomic::Ordering::Relaxed);
            self.injection_failed[i].store(false, std::sync::atomic::Ordering::Relaxed);
        }
    }
}

// Global state for lock-free access
static GLOBAL_STATE: OnceLock<State> = OnceLock::new();

pub fn global_state() -> &'static State {
    GLOBAL_STATE.get_or_init(|| State::new())
}
