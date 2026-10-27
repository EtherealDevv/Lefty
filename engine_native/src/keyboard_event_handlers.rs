//! Keyboard event handlers — optimized for 0-delay gaming.
//!
//! Las teclas inyectadas se contabilizan por VK: dos fuentes que comparten
//! destino no se sueltan entre sí, y pausar/remapear solo suelta lo que inyectó
//! Lefty (nunca una tecla que el usuario mantiene físicamente).

use std::sync::atomic::{AtomicU16, Ordering};

use crate::helpers::*;
use crate::state::{State, VK_DISABLED};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, SendInput,
};

const TRACKED_KEYS: usize = 512;

/// Referencias de keydown inyectadas por VK destino.
static INJECTED_DOWN: [AtomicU16; TRACKED_KEYS] = [const { AtomicU16::new(0) }; TRACKED_KEYS];

#[inline(always)]
fn injected_idx(vk: u32) -> usize {
    (filter_artificial_keys(vk) as usize) & 0x1FF
}

#[inline(always)]
fn injected_acquire(vk: u32) {
    INJECTED_DOWN[injected_idx(vk)].fetch_add(1, Ordering::Relaxed);
}

/// Suelta una referencia de inyección.
/// `None` = no había ninguna viva; `Some(true)` = era la última (toca enviar
/// keyup); `Some(false)` = queda otra fuente con la tecla abajo.
#[inline(always)]
fn injected_release(vk: u32) -> Option<bool> {
    INJECTED_DOWN[injected_idx(vk)]
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |v| v.checked_sub(1))
        .ok()
        .map(|prev| prev == 1)
}

#[inline(always)]
fn send_inputs(inputs: &[INPUT]) {
    if !inputs.is_empty() {
        unsafe {
            SendInput(inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }
}

/// Si la tecla tenía inyección viva, la libera y añade su keyup al lote.
/// Devuelve si había algo que liberar (aunque quede otra referencia).
#[inline(always)]
fn release_into(inputs: &mut Vec<INPUT>, vk: u32) -> bool {
    match injected_release(vk) {
        Some(last) => {
            if last {
                push_combo_input(inputs, vk, true);
            }
            true
        }
        None => false,
    }
}

#[inline(always)]
fn release_targets(targets: &[u32]) {
    let mut inputs: Vec<INPUT> = Vec::with_capacity(targets.len());
    for &t in targets {
        release_into(&mut inputs, t);
    }
    send_inputs(&inputs);
}

#[inline(always)]
fn generated_by_kbm(extra: usize) -> bool {
    (extra & KEYBOARDMANAGER_INJECTED_FLAG) != 0
}

#[inline(always)]
fn update_numpad_with_shift(vk: &mut u32, is_key_down: bool, state: &State) {
    if is_numpad_originated(*vk) || *vk == 0x0C {
        let decoded = clear_numpad_origin(*vk);
        let scan_key = crate::state::vk_to_scan_cached(decoded) as usize;
        if scan_key < 256 {
            if let Some(origin_vk) = state.get_scan_map(scan_key as u32) {
                if let Some(remapped) = state.get_single_key_remap(origin_vk) {
                    if remapped == 0x10 || remapped == 0xA0 || remapped == 0xA1 {
                        if state.get_numpad_pressed(origin_vk) {
                            *vk = origin_vk;
                        }
                    }
                }
            }
        }
    }
    if is_numpad_key_affected_by_shift(*vk) {
        state.set_numpad_pressed(*vk, is_key_down);
    }
}

#[inline(always)]
fn batch_push_suppress(inputs: &mut [INPUT; 2], count: &mut usize, w_vk: u16, w_scan: u16, flags: u32) {
    inputs[*count] = INPUT {
        r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_KEYBOARD,
        Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            ki: windows::Win32::UI::Input::KeyboardAndMouse::KEYBDINPUT {
                wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(w_vk),
                wScan: w_scan,
                dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS(flags),
                time: 0,
                dwExtraInfo: crate::helpers::KEYBOARDMANAGER_SUPPRESS_FLAG,
            },
        },
    };
    *count += 1;
}

#[inline(always)]
fn combo_input(w_vk_raw: u32, up: bool) -> INPUT {
    use windows::Win32::UI::Input::KeyboardAndMouse as kbm;
    let mut flags = if up { KEYEVENTF_KEYUP.0 } else { 0 };
    if is_extended_key(w_vk_raw) {
        flags |= kbm::KEYEVENTF_EXTENDEDKEY.0;
    }
    INPUT {
        r#type: kbm::INPUT_KEYBOARD,
        Anonymous: kbm::INPUT_0 {
            ki: kbm::KEYBDINPUT {
                wVk: kbm::VIRTUAL_KEY(filter_artificial_keys(w_vk_raw) as u16),
                wScan: crate::state::vk_to_scan_cached(w_vk_raw),
                dwFlags: kbm::KEYBD_EVENT_FLAGS(flags),
                time: 0,
                dwExtraInfo: crate::helpers::KEYBOARDMANAGER_SINGLEKEY_FLAG,
            },
        },
    }
}

#[inline(always)]
fn push_combo_input(inputs: &mut Vec<INPUT>, w_vk_raw: u32, up: bool) {
    inputs.push(combo_input(w_vk_raw, up));
}

/// Suelta únicamente las teclas que inyectó Lefty y olvida el estado de
/// pulsación. Se usa al pausar, al recargar mappings y al apagar el engine.
/// Enviar keyup de más es inofensivo; soltar una tecla física del usuario no.
#[inline(always)]
pub fn release_all_injected(state: &State) {
    let mut inputs: Vec<INPUT> = Vec::with_capacity(16);
    for vk in 1u32..=255u32 {
        if INJECTED_DOWN[(vk as usize) & 0x1FF].swap(0, Ordering::Relaxed) > 0 {
            push_combo_input(&mut inputs, vk, true);
        }
    }
    send_inputs(&inputs);
    state.clear_held();
}

/// Combo (`CTRL+S`…) con semántica de teclado real: keydown → mods abajo +
/// principal abajo (se quedan); repetir con el source abajo no reinyecta;
/// keyup → principal arriba + mods arriba en reversa. Sirve para PTT.
#[inline(always)]
pub fn handle_combo_remap(
    vk_code: u32,
    targets: &[u32],
    is_key_down: bool,
    state: &State,
) -> Option<()> {
    if targets.is_empty() {
        return None;
    }
    if targets.iter().any(|&t| t == VK_DISABLED) {
        return Some(());
    }

    let seq = state.mapping_update_seq();
    // Actualización de mappings/pausa en curso: no inyectar (el keydown se deja
    // pasar; el keyup también se dejará pasar porque no se marcará como held).
    if is_key_down && (seq & 1) != 0 {
        return None;
    }

    if !is_key_down {
        if state.consume_single_key_remap_injection_failed(vk_code) {
            state.combo_unmark(vk_code);
            return None;
        }
        let was_held = state.combo_unmark(vk_code);
        let main = targets[targets.len() - 1];
        let mut inputs: Vec<INPUT> = Vec::with_capacity(targets.len());
        let mut had_injection = release_into(&mut inputs, main);
        for &m in targets[..targets.len() - 1].iter().rev() {
            had_injection |= release_into(&mut inputs, m);
        }
        send_inputs(&inputs);
        // Sin keydown inyectado (p. ej. mapping añadido a mitad de pulsación):
        // dejar pasar el keyup evita que la tecla física quede pegada.
        if !was_held && !had_injection {
            return None;
        }
        return Some(());
    }

    if state.combo_mark_down(vk_code) {
        // Auto-repeat del source: los mods y la tecla principal ya están abajo.
        return Some(());
    }

    for &t in targets {
        injected_acquire(t);
    }
    let mut inputs: Vec<INPUT> = Vec::with_capacity(targets.len());
    for &m in &targets[..targets.len() - 1] {
        push_combo_input(&mut inputs, m, false);
    }
    push_combo_input(&mut inputs, targets[targets.len() - 1], false);
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent != inputs.len() as u32 {
        release_targets(targets);
        state.combo_unmark(vk_code);
        state.set_single_key_remap_injection_failed(vk_code, true);
        return None;
    }
    if !state.mapping_update_stable(seq) {
        // El mapa o el estado de pausa cambiaron mientras inyectábamos:
        // deshacer para no dejar el destino de un mapa viejo abajo.
        state.combo_unmark(vk_code);
        release_targets(targets);
        return Some(());
    }
    state.set_single_key_remap_injection_failed(vk_code, false);
    Some(())
}

/// Construye el lote de keydown single: suppress del modificador origen (si
/// aplica) + tecla destino. Devuelve cuántos INPUTs contiene.
#[inline(always)]
fn build_single_down(
    inputs: &mut [INPUT; 2],
    vk_code: u32,
    target: u32,
    suppress_source: bool,
) -> usize {
    let mut count: usize = 0;
    if suppress_source {
        let w_vk_s = filter_artificial_keys(vk_code) as u16;
        let mut flags_s = KEYEVENTF_KEYUP.0;
        if is_extended_key(vk_code) {
            flags_s |= KEYEVENTF_EXTENDEDKEY.0;
        }
        let w_scan_s = crate::state::vk_to_scan_cached(vk_code);
        batch_push_suppress(inputs, &mut count, w_vk_s, w_scan_s, flags_s);
    }
    let w_vk = filter_artificial_keys(target) as u16;
    let mut dw_flags = 0;
    if is_extended_key(target) {
        dw_flags |= KEYEVENTF_EXTENDEDKEY.0;
    }
    let w_scan = crate::state::vk_to_scan_cached(target);
    inputs[count] = INPUT {
        r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_KEYBOARD,
        Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            ki: windows::Win32::UI::Input::KeyboardAndMouse::KEYBDINPUT {
                wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(w_vk),
                wScan: w_scan,
                dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS(dw_flags),
                time: 0,
                dwExtraInfo: crate::helpers::KEYBOARDMANAGER_SINGLEKEY_FLAG,
            },
        },
    };
    count + 1
}

#[inline(always)]
pub fn handle_single_key_remap(
    vk: &mut u32,
    is_key_down: bool,
    extra: usize,
    state: &State,
) -> Option<()> {
    if generated_by_kbm(extra) {
        return None;
    }

    let mut vk_code = *vk;
    update_numpad_with_shift(&mut vk_code, is_key_down, state);
    *vk = vk_code;

    let seq = state.mapping_update_seq();
    if is_key_down && (seq & 1) != 0 {
        return None;
    }

    // Combo antes que single: el source vive en una sola tabla.
    let mapping = state.load_mapping();
    if let Some(combo) = &mapping.combo_remap[(vk_code as usize) & 0x1FF] {
        let t0 = crate::qpc_now();
        let r = handle_combo_remap(vk_code, combo, is_key_down, state);
        if r.is_some() {
            crate::latency_record(crate::qpc_now().wrapping_sub(t0));
        }
        return r;
    }
    let remapped = mapping.single_key_remap[(vk_code as usize) & 0x1FF];
    drop(mapping);

    let remapped = remapped?;

    if remapped == VK_DISABLED {
        return Some(());
    }

    let target = filter_artificial_keys(remapped);
    let t0 = crate::qpc_now();

    if !is_key_down {
        if state.consume_single_key_remap_injection_failed(vk_code) {
            state.single_unmark(vk_code);
            return None;
        }
        let was_held = state.single_unmark(vk_code);
        // Keyup single: como máximo un INPUT. Array en pila para no asignar
        // memoria en cada soltada (camino caliente de cualquier remap).
        let mut input: [INPUT; 1] = unsafe { std::mem::zeroed() };
        let mut has_input = false;
        let had_injection = match injected_release(target) {
            Some(last) => {
                if last {
                    input[0] = combo_input(target, true);
                    has_input = true;
                }
                true
            }
            None => false,
        };
        if has_input {
            send_inputs(&input);
        }
        // Ver comentario en el keyup de combo: keydown no inyectado → keyup pasa.
        if !was_held && !had_injection {
            return None;
        }
        crate::latency_record(crate::qpc_now().wrapping_sub(t0));
        return Some(());
    }

    let suppress_source = is_modifier_key(vk_code)
        && !is_modifier_key(target)
        && target != 0x14
        && vk_code != 0x5B
        && vk_code != 0x5C
        && vk_code != crate::state::VK_WIN_BOTH;

    // Auto-repeat del source: el destino ya está abajo. Reenviamos el keydown
    // para conservar el auto-repeat de los campos de texto, sin contar otra
    // referencia (el keyup del source debe liberar una sola).
    if state.single_mark_down(vk_code) {
        let mut inputs: [INPUT; 2] = unsafe { std::mem::zeroed() };
        let count = build_single_down(&mut inputs, vk_code, target, false);
        let _ = unsafe { SendInput(&inputs[..count], std::mem::size_of::<INPUT>() as i32) };
        crate::latency_record(crate::qpc_now().wrapping_sub(t0));
        return Some(());
    }

    injected_acquire(target);
    let mut inputs: [INPUT; 2] = unsafe { std::mem::zeroed() };
    let count = build_single_down(&mut inputs, vk_code, target, suppress_source);
    let sent = unsafe { SendInput(&inputs[..count], std::mem::size_of::<INPUT>() as i32) };
    if sent != count as u32 {
        release_targets(&[target]);
        state.single_unmark(vk_code);
        state.set_single_key_remap_injection_failed(vk_code, true);
        return None;
    }
    if !state.mapping_update_stable(seq) {
        state.single_unmark(vk_code);
        release_targets(&[target]);
        crate::latency_record(crate::qpc_now().wrapping_sub(t0));
        return Some(());
    }
    state.set_single_key_remap_injection_failed(vk_code, false);
    crate::latency_record(crate::qpc_now().wrapping_sub(t0));
    Some(())
}
