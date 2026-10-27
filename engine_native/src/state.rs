//! State — ultra-optimized for 0-delay gaming
//! MappingState is lock-free via ArcSwap, dynamic state via atomics

use std::collections::HashMap;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use arc_swap::ArcSwap;
use std::sync::Arc;

pub const VK_WIN_BOTH: u32 = 0x104;
pub const VK_DISABLED: u32 = 0x100;
/// Pseudo-VK para botones laterales del mouse (fuente, nunca destino).
pub const VK_MOUSE_X1: u32 = 0x105;
pub const VK_MOUSE_X2: u32 = 0x106;
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
    /// Combos: source → [mods…, tecla]. Tabla fija indexada por VK para que el
    /// hook no tenga que hashear en cada evento. Solo una de las dos tablas
    /// tiene al source.
    pub combo_remap: [Option<Vec<u32>>; MAP_SIZE],
}

impl Default for MappingState {
    fn default() -> Self {
        Self {
            single_key_remap: [None; MAP_SIZE],
            scan_map: [None; SCAN_SIZE],
            combo_remap: std::array::from_fn(|_| None),
        }
    }
}

pub struct State {
    pub mapping: ArcSwap<MappingState>,
    pub numpad_pressed: [AtomicBool; MAP_SIZE],
    pub injection_failed: [AtomicBool; MAP_SIZE],
    /// Fuentes single físicamente abajo cuya inyección está viva.
    pub single_held: [AtomicBool; MAP_SIZE],
    /// Fuentes combo físicamente abajo.
    pub combo_held: [AtomicBool; MAP_SIZE],
    /// Secuencia de actualización de mappings/pausa (seqlock). Impar = hay una
    /// actualización en curso: el hook deja pasar los eventos sin inyectar.
    /// Así nunca inyecta con un mapa a medio sustituir y no deja teclas pegadas.
    pub mapping_seq: AtomicU64,
}

impl State {
    pub fn new() -> Self {
        Self {
            mapping: ArcSwap::from_pointee(MappingState::default()),
            numpad_pressed: std::array::from_fn(|_| AtomicBool::new(false)),
            injection_failed: std::array::from_fn(|_| AtomicBool::new(false)),
            single_held: std::array::from_fn(|_| AtomicBool::new(false)),
            combo_held: std::array::from_fn(|_| AtomicBool::new(false)),
            mapping_seq: AtomicU64::new(0),
        }
    }

    #[inline(always)]
    pub fn load_mapping(&self) -> arc_swap::Guard<Arc<MappingState>> {
        self.mapping.load()
    }

    /// Inicio de una actualización atómica (mapeos o pausa). Debe cerrarse
    /// siempre con `end_mapping_update`, aunque no haya nada que inyectar.
    #[inline(always)]
    pub fn begin_mapping_update(&self) {
        self.mapping_seq.fetch_add(1, Ordering::AcqRel);
    }

    #[inline(always)]
    pub fn end_mapping_update(&self) {
        self.mapping_seq.fetch_add(1, Ordering::Release);
    }

    /// Secuencia actual. Si es impar, hay una actualización en curso.
    #[inline(always)]
    pub fn mapping_update_seq(&self) -> u64 {
        self.mapping_seq.load(Ordering::Acquire)
    }

    /// `true` si no hubo actualizaciones desde que se capturó `seq`.
    #[inline(always)]
    pub fn mapping_update_stable(&self, seq: u64) -> bool {
        self.mapping_seq.load(Ordering::Acquire) == seq
    }

    /// Reemplaza TODAS las tablas de una vez: el hook nunca observa un estado
    /// intermedio (antes se limpiaba y re-añadía mapping a mapping).
    #[inline(always)]
    pub fn replace_mappings(&self, m: HashMap<u32, Vec<u32>>) {
        let mut next = MappingState::default();
        for (src, dst) in m {
            if dst.is_empty() {
                continue;
            }
            if dst.len() == 1 {
                let idx = (src as usize) & 0x1FF;
                next.single_key_remap[idx] = Some(dst[0]);
                if crate::helpers::is_numpad_key_affected_by_shift(src) {
                    let sc = vk_to_scan_cached(src);
                    if sc != 0 && (sc as usize) < SCAN_SIZE {
                        next.scan_map[sc as usize] = Some(src);
                    }
                }
            } else {
                next.combo_remap[(src as usize) & 0x1FF] = Some(dst);
            }
        }
        self.mapping.store(Arc::new(next));
        self.clear_dynamic();
    }

    #[inline(always)]
    pub fn get_single_key_remap(&self, vk: u32) -> Option<u32> {
        let mapping = self.mapping.load();
        let idx = (vk as usize) & 0x1FF;
        mapping.single_key_remap[idx]
    }

    /// Marca el source single como abajo. `true` = ya estaba (auto-repeat).
    #[inline(always)]
    pub fn single_mark_down(&self, vk: u32) -> bool {
        self.single_held[(vk as usize) & 0x1FF].swap(true, Ordering::Relaxed)
    }

    /// Desmarca el source single. `true` = estaba abajo.
    #[inline(always)]
    pub fn single_unmark(&self, vk: u32) -> bool {
        self.single_held[(vk as usize) & 0x1FF].swap(false, Ordering::Relaxed)
    }

    /// Marca el source combo como abajo. `true` = ya estaba (repeat: no reinyectar).
    #[inline(always)]
    pub fn combo_mark_down(&self, vk: u32) -> bool {
        self.combo_held[(vk as usize) & 0x1FF].swap(true, Ordering::Relaxed)
    }

    /// Desmarca el source combo. `true` = estaba abajo.
    #[inline(always)]
    pub fn combo_unmark(&self, vk: u32) -> bool {
        self.combo_held[(vk as usize) & 0x1FF].swap(false, Ordering::Relaxed)
    }

    /// Olvida todos los estados de pulsación (tras soltar lo inyectado).
    #[inline(always)]
    pub fn clear_held(&self) {
        for i in 0..MAP_SIZE {
            self.single_held[i].store(false, Ordering::Relaxed);
            self.combo_held[i].store(false, Ordering::Relaxed);
        }
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
        self.injection_failed[idx].store(failed, Ordering::Relaxed);
    }

    #[inline(always)]
    pub fn consume_single_key_remap_injection_failed(&self, source_key: u32) -> bool {
        let idx = (source_key as usize) & 0x1FF;
        self.injection_failed[idx].swap(false, Ordering::Relaxed)
    }

    #[inline(always)]
    pub fn set_numpad_pressed(&self, vk: u32, pressed: bool) {
        let idx = (vk as usize) & 0x1FF;
        self.numpad_pressed[idx].store(pressed, Ordering::Relaxed);
    }

    #[inline(always)]
    pub fn get_numpad_pressed(&self, vk: u32) -> bool {
        let idx = (vk as usize) & 0x1FF;
        self.numpad_pressed[idx].load(Ordering::Relaxed)
    }

    #[inline(always)]
    pub fn clear_all(&self) {
        self.mapping.store(Arc::new(MappingState::default()));
        self.clear_dynamic();
    }

    #[inline(always)]
    fn clear_dynamic(&self) {
        for i in 0..MAP_SIZE {
            self.numpad_pressed[i].store(false, Ordering::Relaxed);
            self.injection_failed[i].store(false, Ordering::Relaxed);
            self.single_held[i].store(false, Ordering::Relaxed);
            self.combo_held[i].store(false, Ordering::Relaxed);
        }
    }
}

// Global state for lock-free access
static GLOBAL_STATE: OnceLock<State> = OnceLock::new();

pub fn global_state() -> &'static State {
    GLOBAL_STATE.get_or_init(|| State::new())
}
