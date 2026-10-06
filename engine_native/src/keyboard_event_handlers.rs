//! native keyboard managerEngineLibrary KeyboardEventHandlers — optimized for 0-delay gaming

use crate::helpers::*;
use crate::state::State;
use windows::Win32::UI::Input::KeyboardAndMouse::{INPUT, KEYEVENTF_KEYUP, SendInput};

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
fn push_combo_input(inputs: &mut Vec<INPUT>, w_vk_raw: u32, up: bool) {
    use windows::Win32::UI::Input::KeyboardAndMouse as kbm;
    let mut flags = if up { KEYEVENTF_KEYUP.0 } else { 0 };
    if is_extended_key(w_vk_raw) {
        flags |= kbm::KEYEVENTF_EXTENDEDKEY.0;
    }
    inputs.push(INPUT {
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
    });
}

/// Suelta de seguridad: keyup de los 8 modificadores. Inofensivo si no
/// estaban abajo. Cubre keyup perdido o mappings recargados a mitad de hold.
#[inline(always)]
pub fn release_all_combo_mods() {
    let mut inputs: Vec<INPUT> = Vec::with_capacity(8);
    for &m in &[0xA2u32, 0xA3, 0xA0, 0xA1, 0xA4, 0xA5, 0x5B, 0x5C] {
        push_combo_input(&mut inputs, m, true);
    }
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

/// Suelta TODO (1..=255) en un solo SendInput. Solo para apagado graceful:
/// soltar lo no presionado es no-op. Cierra stucks por kill a mitad de hold.
#[inline(always)]
pub fn release_all_keys() {
    let mut inputs: Vec<INPUT> = Vec::with_capacity(256);
    for vk in 1u32..=255u32 {
        push_combo_input(&mut inputs, vk, true);
    }
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
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
    if targets.iter().any(|&t| t == crate::state::VK_DISABLED) {
        return Some(());
    }
    if !is_key_down {
        if state.consume_single_key_remap_injection_failed(vk_code) {
            return None;
        }
        state.combo_unmark(vk_code);
        let mut inputs: Vec<INPUT> = Vec::with_capacity(targets.len());
        let main = targets[targets.len() - 1];
        push_combo_input(&mut inputs, main, true);
        for &m in targets[..targets.len() - 1].iter().rev() {
            push_combo_input(&mut inputs, m, true);
        }
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
        return Some(());
    }
    if state.combo_mark_down(vk_code) {
        return Some(());
    }
    let mut inputs: Vec<INPUT> = Vec::with_capacity(targets.len());
    for &m in &targets[..targets.len() - 1] {
        push_combo_input(&mut inputs, m, false);
    }
    push_combo_input(&mut inputs, targets[targets.len() - 1], false);
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent == 0 {
        state.combo_unmark(vk_code);
        state.set_single_key_remap_injection_failed(vk_code, true);
        return None;
    }
    state.set_single_key_remap_injection_failed(vk_code, false);
    Some(())
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

    // Combo antes que single: el source vive en una sola tabla.
    if let Some(combo) = state.get_combo_remap(vk_code) {
        let t0 = crate::qpc_now();
        let r = handle_combo_remap(vk_code, &combo, is_key_down, state);
        if r.is_some() {
            crate::latency_record(crate::qpc_now().wrapping_sub(t0));
        }
        return r;
    }

    let remapped = state.get_single_key_remap(vk_code)?;

    if remapped == crate::state::VK_DISABLED {
        return Some(());
    }

    let is_key_up = !is_key_down;

    if is_key_up && state.consume_single_key_remap_injection_failed(vk_code) {
        return None;
    }

    let target = filter_artificial_keys(remapped);

    let mut inputs: [INPUT; 2] = unsafe { std::mem::zeroed() };
    let mut count: usize = 0;

    if is_key_up {
        let w_vk = filter_artificial_keys(target) as u16;
        let mut dw_flags = KEYEVENTF_KEYUP.0;
        if is_extended_key(target) {
            dw_flags |= windows::Win32::UI::Input::KeyboardAndMouse::KEYEVENTF_EXTENDEDKEY.0;
        }
        let w_scan = crate::state::vk_to_scan_cached(target);
        inputs[0] = INPUT {
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
        count = 1;
    } else {
        // Un solo SendInput con hasta 2 INPUTs (suppress del modificador origen
        // + tecla destino): la mitad de syscalls que dos envíos separados.
        // batch[0] = suppress (si aplica), batch[n] = destino.
        if is_modifier_key(vk_code) && !is_modifier_key(target) && target != 0x14 && vk_code != 0x5B && vk_code != 0x5C && vk_code != crate::state::VK_WIN_BOTH {
            let w_vk_s = filter_artificial_keys(vk_code) as u16;
            let mut flags_s = KEYEVENTF_KEYUP.0;
            if is_extended_key(vk_code) {
                flags_s |= windows::Win32::UI::Input::KeyboardAndMouse::KEYEVENTF_EXTENDEDKEY.0;
            }
            let w_scan_s = crate::state::vk_to_scan_cached(vk_code);
            batch_push_suppress(&mut inputs, &mut count, w_vk_s, w_scan_s, flags_s);
        }
        let w_vk = filter_artificial_keys(target) as u16;
        let mut dw_flags = 0;
        if is_extended_key(target) {
            dw_flags |= windows::Win32::UI::Input::KeyboardAndMouse::KEYEVENTF_EXTENDEDKEY.0;
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
        count += 1;
    }

    let sent = unsafe { SendInput(&inputs[..count], std::mem::size_of::<INPUT>() as i32) };
    if sent == 0 {
        if !is_key_up {
            state.set_single_key_remap_injection_failed(vk_code, true);
        }
        return None;
    }

    if !is_key_up {
        state.set_single_key_remap_injection_failed(vk_code, false);
    }

    Some(())
}
