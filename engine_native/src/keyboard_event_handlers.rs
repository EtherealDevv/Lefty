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

    let remapped = state.get_single_key_remap(vk_code)?;

    if remapped == crate::state::VK_DISABLED {
        return Some(());
    }

    let is_key_up = !is_key_down;

    if is_key_up && state.consume_single_key_remap_injection_failed(vk_code) {
        return None;
    }

    let target = filter_artificial_keys(remapped);

    let mut inputs: [INPUT; 1] = unsafe { std::mem::zeroed() };
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
        if is_modifier_key(vk_code) && !is_modifier_key(target) && target != 0x14 && vk_code != 0x5B && vk_code != 0x5C && vk_code != crate::state::VK_WIN_BOTH {
            let mut suppress: [INPUT; 1] = unsafe { std::mem::zeroed() };
            let w_vk_s = filter_artificial_keys(vk_code) as u16;
            let mut flags_s = KEYEVENTF_KEYUP.0;
            if is_extended_key(vk_code) {
                flags_s |= windows::Win32::UI::Input::KeyboardAndMouse::KEYEVENTF_EXTENDEDKEY.0;
            }
            let w_scan_s = crate::state::vk_to_scan_cached(vk_code);
            suppress[0] = INPUT {
                r#type: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_KEYBOARD,
                Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                    ki: windows::Win32::UI::Input::KeyboardAndMouse::KEYBDINPUT {
                        wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(w_vk_s),
                        wScan: w_scan_s,
                        dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS(flags_s),
                        time: 0,
                        dwExtraInfo: crate::helpers::KEYBOARDMANAGER_SUPPRESS_FLAG,
                    },
                },
            };
            unsafe {
                let _ = SendInput(&suppress, std::mem::size_of::<INPUT>() as i32);
            }
        }
        let w_vk = filter_artificial_keys(target) as u16;
        let mut dw_flags = 0;
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
