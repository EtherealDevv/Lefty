#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex, OnceLock, mpsc};
use std::process::{Child, Command, Stdio};
use std::path::PathBuf;
use std::collections::HashMap;
use std::fs;
use std::time::Duration;
use tauri::{State, Manager};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{CallNextHookEx, SetWindowsHookExW, UnhookWindowsHookEx, HC_ACTION, HHOOK, KBDLLHOOKSTRUCT, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP};

mod keyboard_layout;

/// Spawns console tools (taskkill/schtasks/reg) WITHOUT flashing a console
/// window (CREATE_NO_WINDOW). A visible conhost flash on every Activate looked
/// like "another app opening briefly".
#[cfg(windows)]
fn silent_command(prog: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut c = std::process::Command::new(prog);
    c.creation_flags(CREATE_NO_WINDOW);
    c
}
#[cfg(not(windows))]
fn silent_command(prog: &str) -> std::process::Command {
    std::process::Command::new(prog)
}

#[derive(Clone)]
struct EngineState(Arc<Mutex<Option<Child>>>);
static CAPTURE_TX: OnceLock<Mutex<Option<mpsc::Sender<(u32, u32)>>>> = OnceLock::new();

#[tauri::command]
fn is_admin() -> bool {
    // Check elevation, not just group membership (UAC)
    unsafe {
        let is_member = windows::Win32::UI::Shell::IsUserAnAdmin().as_bool();
        use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
        use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
        use windows::Win32::Foundation::HANDLE;
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return is_member;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut ret_len: u32 = 0;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut std::ffi::c_void),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut ret_len,
        );
        let _ = windows::Win32::Foundation::CloseHandle(token);
        if ok.is_ok() {
            is_member && elevation.TokenIsElevated != 0
        } else {
            is_member
        }
    }
}

#[tauri::command]
fn restart_as_admin() -> Result<String, String> {
    unsafe {
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_NORMAL;
        if let Ok(exe) = std::env::current_exe() {
            let exe_w: Vec<u16> = exe.to_string_lossy().encode_utf16().chain(Some(0)).collect();
            let op: Vec<u16> = "runas\0".encode_utf16().collect();
            ShellExecuteW(HWND(std::ptr::null_mut()), PCWSTR(op.as_ptr()), PCWSTR(exe_w.as_ptr()), PCWSTR::null(), PCWSTR::null(), SW_NORMAL);
            std::process::exit(0);
        }
        Err("No se pudo obtener exe".to_string())
    }
}

#[tauri::command]
fn get_mappings_path() -> String {
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("Lefty").join("engine_mappings.json").to_string_lossy().to_string();
    }
    "engine_mappings.json".to_string()
}

// native low-level: GetKeyNameList / GetKeyCodeList via keyboard_layout.rs (ToUnicodeEx + MapVirtualKey)
fn name_to_vk(name: &str) -> Option<u32> {
    let n = name.trim();
    // Try layout map: search GetKeyNameList
    if let Some(vk) = keyboard_layout::get_key_from_name(n) {
        return Some(vk);
    }
    // Also try case-insensitive search
    let upper = n.to_uppercase();
    if let Some(vk) = keyboard_layout::get_key_from_name(&upper) {
        return Some(vk);
    }
    // Also accepts numeric strings via decimal
    let trimmed_upper = upper.as_str();
    if trimmed_upper.starts_with("0X") {
        if let Ok(v) = u32::from_str_radix(trimmed_upper.trim_start_matches("0X"), 16) {
            return Some(v);
        }
    }
    if let Ok(v) = trimmed_upper.parse::<u32>() {
        return Some(v);
    }
    if trimmed_upper.starts_with("VK_") {
        let rest = trimmed_upper.trim_start_matches("VK_").trim();
        if let Ok(v) = u32::from_str_radix(rest, 16) {
            return Some(v);
        }
        if let Ok(v) = rest.parse::<u32>() {
            return Some(v);
        }
    }
    // OEM fallbacks for LATAM 105 distinct
    // but keep hard fallback for characters not in layout enumeration (like Ñ etc if layout is US)
    // + alias exactos para los nombres del frontend (FALLBACK_ALL_KEYS), que no
    // siempre coinciden con el layout ("UP" vs "Up", "NUM8" vs "NumPad 8"...).
    // Sin esto, esos mapeos se descartaban en silencio.
    match trimmed_upper {
        "Ñ" | "OEM_1" => Some(0xBA),
        "'" | "OEM_PLUS" => Some(0xBB),
        "," | "OEM_COMMA" => Some(0xBC),
        "-" | "OEM_MINUS" => Some(0xBD),
        "." | "OEM_PERIOD" => Some(0xBE),
        "/" | "OEM_2" => Some(0xBF),
        "`" | "OEM_3" => Some(0xC0),
        "´" | "¨" | "OEM_4" | "[" => Some(0xDB),
        "\\" | "OEM_5" => Some(0xDC),
        "+" | "*" | "OEM_6" => Some(0xDD),
        "Ç" | "ç" | "OEM_7" => Some(0xDE),
        "OEM_8" => Some(0xDF),
        "<" | "OEM_102" => Some(0xE2),
        "DISABLED" => Some(0x100),
        "MOUSE_X1" => Some(0x105),
        "MOUSE_X2" => Some(0x106),
        "SHIFT" => Some(0x10),
        "LSHIFT" => Some(0xA0),
        "RSHIFT" => Some(0xA1),
        "CTRL" => Some(0x11),
        "LCTRL" => Some(0xA2),
        "RCTRL" => Some(0xA3),
        "ALT" => Some(0x12),
        "LALT" => Some(0xA4),
        "RALT" => Some(0xA5),
        "LWIN" => Some(0x5B),
        "RWIN" => Some(0x5C),
        "CAPSLOCK" => Some(0x14),
        "PAGEUP" => Some(0x21),
        "PAGEDOWN" => Some(0x22),
        "NUMLOCK" => Some(0x90),
        "SCROLLLOCK" => Some(0x91),
        "PRINTSCREEN" => Some(0x2C),
        "NUM0" => Some(0x60),
        "NUM1" => Some(0x61),
        "NUM2" => Some(0x62),
        "NUM3" => Some(0x63),
        "NUM4" => Some(0x64),
        "NUM5" => Some(0x65),
        "NUM6" => Some(0x66),
        "NUM7" => Some(0x67),
        "NUM8" => Some(0x68),
        "NUM9" => Some(0x69),
        "NUM*" => Some(0x6A),
        "NUM+" => Some(0x6B),
        "NUM-" => Some(0x6D),
        "NUM." => Some(0x6E),
        "NUM/" => Some(0x6F),
        "NUMENTER" => Some(0x0D),
        _ => {
            // Último recurso: comparar insensible a mayúsculas contra la lista
            // real del layout ("UP"→"Up"). Solo si nada exacto coincidió antes.
            let lower = n.to_lowercase();
            for (code, key_name) in keyboard_layout::get_key_name_list(false) {
                if key_name.to_lowercase() == lower {
                    return Some(code);
                }
            }
            None
        }
    }
}

#[tauri::command]
fn update_mappings(mappings: Vec<(String, String)>) -> Result<String, String> {
    let mut vk_map: HashMap<u32, Vec<u32>> = HashMap::new();
    for (s,d) in mappings {
        let parts = split_combo_target(&d);
        let mut vks: Vec<u32> = Vec::with_capacity(parts.len());
        let mut ok = true;
        for p in &parts {
            match name_to_vk(p) {
                Some(v) => vks.push(v),
                None => { ok = false; break; }
            }
        }
        if !ok || vks.is_empty() {
            continue;
        }
        if let Some(sv) = name_to_vk(&s) {
            // Self-map de una sola tecla se descarta (la validación ya lo bloquea).
            if vks.len() == 1 && sv == vks[0] {
                continue;
            }
            vk_map.insert(sv, vks);
        }
    }
    let path = if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("Lefty");
        let _ = fs::create_dir_all(&dir);
        dir.join("engine_mappings.json")
    } else {
        PathBuf::from("engine_mappings.json")
    };
    // Singles como número (formato legacy intacto), combos como array.
    let json_map: HashMap<String, EngineTargets> = vk_map
        .iter()
        .map(|(k, v)| {
            (
                k.to_string(),
                if v.len() == 1 {
                    EngineTargets::One(v[0])
                } else {
                    EngineTargets::Many(v.clone())
                },
            )
        })
        .collect();
    let json = serde_json::to_string(&json_map).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(format!("wrote {} mappings to {:?}", vk_map.len(), path))
}

/// Destino en disco: número (single, formato legacy) o array (combo).
#[derive(serde::Serialize)]
#[serde(untagged)]
enum EngineTargets {
    One(u32),
    Many(Vec<u32>),
}

/// Parte un destino combo (`CTRL+S`) con la misma regla del frontend:
/// un `""` se pega a la parte anterior (`NUM+` sobrevive intacto).
fn split_combo_target(dst: &str) -> Vec<String> {
    if !dst.contains('+') {
        return vec![dst.to_string()];
    }
    let mut out: Vec<String> = Vec::new();
    for part in dst.split('+') {
        if part.is_empty() && !out.is_empty() {
            let last = out.len() - 1;
            out[last].push('+');
        } else {
            out.push(part.to_string());
        }
    }
    let clean: Vec<String> = out.into_iter().filter(|p| !p.is_empty()).collect();
    if clean.is_empty() {
        vec![dst.to_string()]
    } else {
        clean
    }
}

#[tauri::command]
fn set_invert_clicks(enabled: bool) -> Result<String, String> {
    // Restaurar SIEMPRE al baseline real (un OFF anterior con Swap(false) a pelo
    // rompía a quien ya usa Windows en modo zurdo).
    let base = mouse_baseline_swapped();
    unsafe {
        use windows::Win32::UI::Input::KeyboardAndMouse::SwapMouseButton;
        SwapMouseButton(if enabled { true } else { base });
        Ok(format!("SwapMouseButton {}", enabled))
    }
}

/// Baseline real del botón primario: el ajuste del SO en el registro.
/// SwapMouseButton solo cambia el estado en vivo, NUNCA toca el registro
/// (verificado: con inversión impuesta el registro sigue en su valor),
/// así que es inmune al envenenamiento que sufría leer el estado en vivo
/// (una 2ª instancia o un kill previo lo encontraban ya invertido).
/// Sin archivos: nada que limpiar ni migrar.
fn mouse_baseline_swapped() -> bool {
    winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey("Control Panel\\Mouse")
        .and_then(|k| k.get_value::<String, _>("SwapMouseButtons"))
        .map(|v| v.trim() == "1")
        .unwrap_or(false)
}

#[tauri::command]
fn get_engine_enabled() -> Result<bool, String> {
    let path = if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("Lefty").join("f6_toggle.txt")
    } else {
        PathBuf::from("f6_toggle.txt")
    };
    if let Ok(s) = fs::read_to_string(&path) {
        Ok(s.trim() == "1")
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn set_engine_enabled(enabled: bool) -> Result<String, String> {
    let path = if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("Lefty");
        let _ = fs::create_dir_all(&dir);
        dir.join("f6_toggle.txt")
    } else {
        PathBuf::from("f6_toggle.txt")
    };
    fs::write(&path, if enabled { b"1" } else { b"0" }).map_err(|e| e.to_string())?;
    Ok(format!("enabled {}", enabled))
}

/// Foco gamer bajo demanda: lo llama el frontend en CADA transición de
/// `enabled` (botón, F6 o arranque), porque F6 conmuta solo en el engine y
/// jamás pasa por `set_engine_enabled`. Best-effort: nunca falla.
#[tauri::command]
fn apply_gamer_focus(enabled: bool) -> Result<String, String> {
    if enabled {
        a11y_suppress();
    } else {
        a11y_restore();
    }
    Ok(format!("gamer_focus {}", enabled))
}

/// Supresión gamer de avisos de accesibilidad (Shift×5, Shift 8s, NumLock×5).
/// Solo apaga HOTKEYS (aviso/sonido/confirmación); el estado de las funciones
/// no se toca. Originales en a11y_backup.json (crash-safe: si ya existe backup
/// es de una muerte sucia anterior y SE CONSERVA).
fn a11y_backup_path() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("Lefty");
        let _ = fs::create_dir_all(&dir);
        dir.join("a11y_backup.json")
    } else {
        PathBuf::from("a11y_backup.json")
    }
}

// Bits Win32 estables en FILTERKEYS/TOGGLEKEYS (u32), idénticos a SKF_ 4/8/16.
const A11Y_HOTKEYACTIVE: u32 = 0x0004;
const A11Y_CONFIRMHOTKEY: u32 = 0x0008;
const A11Y_HOTKEYSOUND: u32 = 0x0010;

fn a11y_suppress() {
    use windows::Win32::UI::Accessibility::{FILTERKEYS, STICKYKEYS, TOGGLEKEYS, SKF_CONFIRMHOTKEY, SKF_HOTKEYACTIVE, SKF_HOTKEYSOUND};
    use windows::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPI_GETFILTERKEYS, SPI_GETSTICKYKEYS, SPI_GETTOGGLEKEYS, SPI_SETFILTERKEYS, SPI_SETSTICKYKEYS, SPI_SETTOGGLEKEYS, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS};
    unsafe {
        let mut sk: STICKYKEYS = std::mem::zeroed();
        sk.cbSize = std::mem::size_of::<STICKYKEYS>() as u32;
        let mut fk: FILTERKEYS = std::mem::zeroed();
        fk.cbSize = std::mem::size_of::<FILTERKEYS>() as u32;
        let mut tk: TOGGLEKEYS = std::mem::zeroed();
        tk.cbSize = std::mem::size_of::<TOGGLEKEYS>() as u32;
        let ok_sk = SystemParametersInfoW(SPI_GETSTICKYKEYS, sk.cbSize, Some(&mut sk as *mut _ as *mut std::ffi::c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0)).is_ok();
        let ok_fk = SystemParametersInfoW(SPI_GETFILTERKEYS, fk.cbSize, Some(&mut fk as *mut _ as *mut std::ffi::c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0)).is_ok();
        let ok_tk = SystemParametersInfoW(SPI_GETTOGGLEKEYS, tk.cbSize, Some(&mut tk as *mut _ as *mut std::ffi::c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0)).is_ok();
        if !(ok_sk && ok_fk && ok_tk) {
            return;
        }
        // Guardar originales solo la primera vez (si hay backup, es el bueno).
        if fs::read_to_string(a11y_backup_path()).is_err() {
            let backup = serde_json::json!({
                "sticky": sk.dwFlags.0,
                "filter": fk.dwFlags,
                "filter_timings": [fk.iWaitMSec, fk.iDelayMSec, fk.iRepeatMSec, fk.iBounceMSec],
                "toggle": tk.dwFlags,
            });
            let _ = fs::write(a11y_backup_path(), backup.to_string());
        }
        sk.dwFlags &= !(SKF_HOTKEYACTIVE | SKF_CONFIRMHOTKEY | SKF_HOTKEYSOUND);
        fk.dwFlags &= !(A11Y_HOTKEYACTIVE | A11Y_CONFIRMHOTKEY | A11Y_HOTKEYSOUND);
        tk.dwFlags &= !(A11Y_HOTKEYACTIVE | A11Y_CONFIRMHOTKEY | A11Y_HOTKEYSOUND);
        let _ = SystemParametersInfoW(SPI_SETSTICKYKEYS, sk.cbSize, Some(&mut sk as *mut _ as *mut std::ffi::c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0));
        let _ = SystemParametersInfoW(SPI_SETFILTERKEYS, fk.cbSize, Some(&mut fk as *mut _ as *mut std::ffi::c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0));
        let _ = SystemParametersInfoW(SPI_SETTOGGLEKEYS, tk.cbSize, Some(&mut tk as *mut _ as *mut std::ffi::c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0));
    }
}

fn a11y_restore() {
    use windows::Win32::UI::Accessibility::{FILTERKEYS, STICKYKEYS, TOGGLEKEYS};
    use windows::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPI_SETFILTERKEYS, SPI_SETSTICKYKEYS, SPI_SETTOGGLEKEYS, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS};
    let raw = match fs::read_to_string(a11y_backup_path()) {
        Ok(s) => s,
        Err(_) => return, // nunca suprimimos: no tocar nada
    };
    let v: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return,
    };
    unsafe {
        let mut sk: STICKYKEYS = std::mem::zeroed();
        sk.cbSize = std::mem::size_of::<STICKYKEYS>() as u32;
        sk.dwFlags = windows::Win32::UI::Accessibility::STICKYKEYS_FLAGS(v.get("sticky").and_then(|x| x.as_u64()).unwrap_or(0) as u32);
        let mut fk: FILTERKEYS = std::mem::zeroed();
        fk.cbSize = std::mem::size_of::<FILTERKEYS>() as u32;
        fk.dwFlags = v.get("filter").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
        if let Some(t) = v.get("filter_timings").and_then(|x| x.as_array()) {
            let n = |i: usize| t.get(i).and_then(|x| x.as_u64()).unwrap_or(0) as u32;
            fk.iWaitMSec = n(0);
            fk.iDelayMSec = n(1);
            fk.iRepeatMSec = n(2);
            fk.iBounceMSec = n(3);
        }
        let mut tk: TOGGLEKEYS = std::mem::zeroed();
        tk.cbSize = std::mem::size_of::<TOGGLEKEYS>() as u32;
        tk.dwFlags = v.get("toggle").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
        let _ = SystemParametersInfoW(SPI_SETSTICKYKEYS, sk.cbSize, Some(&mut sk as *mut _ as *mut std::ffi::c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0));
        let _ = SystemParametersInfoW(SPI_SETFILTERKEYS, fk.cbSize, Some(&mut fk as *mut _ as *mut std::ffi::c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0));
        let _ = SystemParametersInfoW(SPI_SETTOGGLEKEYS, tk.cbSize, Some(&mut tk as *mut _ as *mut std::ffi::c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0));
    }
    let _ = fs::remove_file(a11y_backup_path());
}

#[tauri::command]
fn set_hotkey(hotkey: String) -> Result<String, String> {
    let path = if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("Lefty");
        let _ = fs::create_dir_all(&dir);
        dir.join("hotkey.txt")
    } else {
        PathBuf::from("hotkey.txt")
    };
    // Validar que sea una tecla conocida
    if name_to_vk(&hotkey).is_none() {
        return Err(format!("Hotkey '{}' is not a valid key", hotkey));
    }
    fs::write(&path, hotkey.trim().to_uppercase()).map_err(|e| e.to_string())?;
    Ok(format!("hotkey set to {}", hotkey))
}

#[tauri::command]
fn get_hotkey() -> Result<String, String> {
    let path = if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("Lefty").join("hotkey.txt")
    } else {
        PathBuf::from("hotkey.txt")
    };
    Ok(fs::read_to_string(&path).unwrap_or_else(|_| "F6".to_string()).trim().to_uppercase())
}

/// Tarea de autostart PowerToys-style: logon del usuario, token interactivo
/// (sin contraseña), HIGHEST (sin UAC en cada arranque).
const AUTOSTART_TASK_PATH: &str = "\\Lefty\\";
const AUTOSTART_TASK_NAME: &str = "Lefty Autorun";

/// Escapa un valor para interpolarlo dentro de "..." en un -Command de PowerShell.
fn ps_dq_escape(s: &str) -> String {
    s.replace('`', "``").replace('"', "`\"").replace('$', "`$")
}

fn ps_invoke(script: &str) -> Result<std::process::Output, String> {
    silent_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .output()
        .map_err(|e| format!("powershell failed: {}", e))
}

fn legacy_autostart_cleanup() {
    // Migración: la implementación anterior (schtasks) usaba otro nombre de tarea.
    if let Ok(user) = std::env::var("USERNAME") {
        let old = format!("Autorun for {}", user.replace('"', ""));
        let script = format!(
            "Unregister-ScheduledTask -TaskName \"{}\" -TaskPath \"\\Lefty\\\" -Confirm:$false -ErrorAction SilentlyContinue",
            old
        );
        let _ = ps_invoke(&script);
    }
    // Legados de Run key con otros nombres.
    let key_path = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    for v in ["Lefty_fix", "lefty-tauri", "Lefty-tauri"] {
        let _ = silent_command("reg").args(["delete", &format!("HKCU\\{}", key_path), "/v", v, "/f"]).output();
    }
}
fn get_exe_for_autostart() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe = if exe.file_name().map(|n| n.to_string_lossy().to_lowercase() != "lefty.exe").unwrap_or(true) {
        if let Some(base) = exe.parent() {
            let cand = base.join("Lefty.exe");
            if cand.exists() { cand } else {
                let prog = PathBuf::from("C:\\Program Files\\Lefty\\Lefty.exe");
                if prog.exists() { prog } else { exe }
            }
        } else { exe }
    } else { exe };
    Ok(exe)
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<String, String> {
    let exe = get_exe_for_autostart()?;
    let exe_str = exe.to_string_lossy().to_string();
    legacy_autostart_cleanup();
    // Limpiar también un posible valor Run "Lefty" para no arrancar dos veces.
    let key_path = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    let _ = silent_command("reg").args(["delete", &format!("HKCU\\{}", key_path), "/v", "Lefty", "/f"]).output();
    if enabled {
        // schtasks.exe no sirve aquí: no crea la carpeta \Lefty\ y exige
        // contraseña con /RU. PowerShell sí: crea la carpeta, LogonType
        // Interactive no pide contraseña y HIGHEST evita el UAC en cada logon.
        let username = std::env::var("USERNAME").map_err(|e| e.to_string())?;
        let userdomain = std::env::var("USERDOMAIN").unwrap_or_else(|_| ".".to_string());
        let account = format!("{}\\{}", userdomain, username);
        let script = format!(
            "$e=\"{exe}\";$a=New-ScheduledTaskAction -Execute $e;$t=New-ScheduledTaskTrigger -AtLogOn -User \"{acc}\";$p=New-ScheduledTaskPrincipal -UserId \"{acc}\" -LogonType Interactive -RunLevel Highest;$s=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable;Register-ScheduledTask -TaskName \"{name}\" -TaskPath \"{path}\" -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null",
            exe = ps_dq_escape(&exe_str),
            acc = ps_dq_escape(&account),
            name = AUTOSTART_TASK_NAME,
            path = AUTOSTART_TASK_PATH,
        );
        let out = ps_invoke(&script)?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(format!("No se pudo crear la tarea: {}", err.chars().take(300).collect::<String>()));
        }
    } else {
        let script = format!(
            "Unregister-ScheduledTask -TaskName \"{}\" -TaskPath \"{}\" -Confirm:$false -ErrorAction SilentlyContinue",
            AUTOSTART_TASK_NAME, AUTOSTART_TASK_PATH
        );
        let _ = ps_invoke(&script);
    }
    Ok(format!("autostart {}", enabled))
}

#[tauri::command]
fn get_autostart() -> Result<bool, String> {
    let script = format!(
        "$t=Get-ScheduledTask -TaskName \"{}\" -TaskPath \"{}\" -ErrorAction SilentlyContinue;if($t){{$t.State}}else{{'Missing'}}",
        AUTOSTART_TASK_NAME, AUTOSTART_TASK_PATH
    );
    let out = ps_invoke(&script)?;
    let s = String::from_utf8_lossy(&out.stdout);
    Ok(s.contains("Ready") || s.contains("Running"))
}

#[tauri::command]
fn set_hide_to_tray(enabled: bool) -> Result<String, String> {
    let path = if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("Lefty");
        let _ = fs::create_dir_all(&dir);
        dir.join("hide_tray.txt")
    } else {
        PathBuf::from("hide_tray.txt")
    };
    fs::write(&path, if enabled { b"1" } else { b"0" }).map_err(|e| e.to_string())?;
    Ok(format!("hide_tray {}", enabled))
}

#[tauri::command]
fn get_hide_to_tray() -> Result<bool, String> {
    let path = if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("Lefty").join("hide_tray.txt")
    } else {
        PathBuf::from("hide_tray.txt")
    };
    Ok(fs::read_to_string(&path).map(|s| s.trim() == "1").unwrap_or(true))
}

/// Arrancar minimizado en tray (solo aplica al inicio con autostart).
fn start_minimized_path() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("Lefty");
        let _ = fs::create_dir_all(&dir);
        dir.join("start_minimized.txt")
    } else {
        PathBuf::from("start_minimized.txt")
    }
}

fn start_minimized_enabled() -> bool {
    fs::read_to_string(start_minimized_path())
        .map(|s| s.trim() == "1")
        .unwrap_or(false)
}

#[tauri::command]
fn set_start_minimized(enabled: bool) -> Result<String, String> {
    fs::write(start_minimized_path(), if enabled { b"1" } else { b"0" }).map_err(|e| e.to_string())?;
    Ok(format!("start_minimized {}", enabled))
}

#[tauri::command]
fn get_start_minimized() -> Result<bool, String> {
    Ok(start_minimized_enabled())
}

#[tauri::command]
fn get_f6_state() -> Result<bool, String> {
    get_engine_enabled()
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct LatencyStats {
    avg_us: u64,
    max_us: u64,
    events: u64,
    ts_ms: u64,
}

/// Latencia hook→inyección medida dentro del engine (ventana de 1 s).
/// Sin engine o sin teclas recientes devuelve ceros (la UI lo muestra como idle).
/// Entrada de perfil para el menú del tray (id + nombre visible).
#[derive(serde::Deserialize)]
struct TrayProfile {
    id: String,
    name: String,
}

/// Reconstruye el menú del tray: Show, pause/resume, perfiles (checked el
/// activo) y Close. Lo llama el frontend ante perfiles/activo/enabled.
#[tauri::command]
fn update_tray_menu(
    app: tauri::AppHandle,
    profiles: Vec<TrayProfile>,
    active: String,
    enabled: bool,
) -> Result<String, String> {
    use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
    use tauri::Manager;
    let show = MenuItem::with_id(&app, "show", "Show", true, None::<&str>).map_err(|e| e.to_string())?;
    let toggle = MenuItem::with_id(
        &app,
        "toggle",
        if enabled { "Pause mappings" } else { "Activate mappings" },
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(&app, "quit", "Close", true, None::<&str>).map_err(|e| e.to_string())?;
    let sep1 = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    let sep2 = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    let mut checks: Vec<CheckMenuItem<tauri::Wry>> = Vec::with_capacity(profiles.len());
    for p in &profiles {
        let label = if p.name.trim().is_empty() { p.id.clone() } else { p.name.clone() };
        checks.push(
            CheckMenuItem::with_id(&app, format!("profile:{}", p.id), label, true, p.id == active, None::<&str>)
                .map_err(|e| e.to_string())?,
        );
    }
    let mut refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = vec![&show, &toggle, &sep1];
    for c in &checks {
        refs.push(c);
    }
    refs.push(&sep2);
    refs.push(&quit);
    let menu = Menu::with_items(&app, &refs).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id("lefty-tray") {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
        let active_name = profiles
            .iter()
            .find(|p| p.id == active)
            .map(|p| p.name.as_str())
            .unwrap_or("Lefty");
        let _ = tray.set_tooltip(Some(format!("Lefty v2 — {} (F6 toggle)", active_name)));
    }
    Ok("tray menu updated".into())
}
/// App en primer plano (exe + título) para el auto-switch de perfiles.
/// Solo lectura, sin enforcement: el engine siempre aplica el perfil activo.
#[derive(serde::Serialize)]
struct ForegroundApp {
    exe: String,
    title: String,
}

/// Juego detectado para recomendar (nombre bonito + exe para matchear + arte).
#[derive(serde::Serialize)]
struct FoundGame {
    source: String,
    name: String,
    exe: String,
    art: String,
}

/// Extrae `"clave"  "valor"` de una línea VDF/ACF. Formato: `"k"  "v"`.
fn vdf_value(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        let parts: Vec<&str> = line.split('"').collect();
        if parts.len() >= 5 && parts[1] == key {
            return Some(parts[3].replace("\\\\", "\\"));
        }
    }
    None
}

/// Steam: librerías desde libraryfolders.vdf + manifests. Sin deps extras.
/// El arte sale del CDN público por appid (sin API key).
#[tauri::command]
fn scan_steam_games() -> Vec<FoundGame> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        roots.push(PathBuf::from(pf86).join("Steam"));
    }
    if let Ok(pf) = std::env::var("ProgramFiles") {
        let p = PathBuf::from(pf).join("Steam");
        if !roots.contains(&p) {
            roots.push(p);
        }
    }
    let mut libs: Vec<PathBuf> = Vec::new();
    for root in &roots {
        if !libs.contains(root) {
            libs.push(root.clone());
        }
        let vdf = root.join("steamapps").join("libraryfolders.vdf");
        if let Ok(text) = std::fs::read_to_string(&vdf) {
            for line in text.lines() {
                let parts: Vec<&str> = line.split('"').collect();
                if parts.len() >= 5 && parts[1] == "path" {
                    let p = PathBuf::from(parts[3].replace("\\\\", "\\"));
                    if !libs.contains(&p) {
                        libs.push(p);
                    }
                }
            }
        }
    }
    let mut out: Vec<FoundGame> = Vec::new();
    for lib in libs {
        let dir = lib.join("steamapps");
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("appmanifest_") || !name.ends_with(".acf") {
                continue;
            }
            let appid: String = name
                .trim_start_matches("appmanifest_")
                .trim_end_matches(".acf")
                .to_string();
            if appid.is_empty() || !appid.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            let text = match std::fs::read_to_string(entry.path()) {
                Ok(t) => t,
                Err(_) => continue,
            };
            if let Some(game) = vdf_value(&text, "name") {
                if game.trim().is_empty() {
                    continue;
                }
                // Evita duplicados (misma appid en varias vistas).
                if out.iter().any(|g: &FoundGame| g.source == "steam" && g.art.ends_with(&format!("/{}/header.jpg", appid))) {
                    continue;
                }
                out.push(FoundGame {
                    source: "steam".into(),
                    name: game,
                    exe: String::new(),
                    art: format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{}/header.jpg", appid),
                });
            }
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

/// Epic: manifiestos JSON con DisplayName + LaunchExecutable. Sin deps extras.
#[tauri::command]
fn scan_epic_games() -> Vec<FoundGame> {
    let base = match std::env::var("ProgramData") {
        Ok(pd) => PathBuf::from(pd).join("Epic").join("EpicGamesLauncher").join("Data").join("Manifests"),
        Err(_) => return Vec::new(),
    };
    let entries = match std::fs::read_dir(&base) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    let mut out: Vec<FoundGame> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("item") {
            continue;
        }
        let text = match std::fs::read_to_string(&path) {
            Ok(t) => t,
            Err(_) => continue,
        };
        let v: serde_json::Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let name = v.get("DisplayName").and_then(|x| x.as_str()).unwrap_or("").trim();
        if name.is_empty() {
            continue;
        }
        let exe = v
            .get("LaunchExecutable")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .replace('/', "\\");
        let exe = exe.rsplit('\\').next().unwrap_or("").to_lowercase();
        if out.iter().any(|g: &FoundGame| g.source == "epic" && g.name == name) {
            continue;
        }
        out.push(FoundGame {
            source: "epic".into(),
            name: name.to_string(),
            exe,
            art: String::new(),
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}
#[tauri::command]
fn get_foreground_app() -> Result<ForegroundApp, String> {
    unsafe {
        use windows::Win32::Foundation::{CloseHandle, HMODULE};
        use windows::Win32::System::ProcessStatus::K32GetModuleFileNameExW;
        use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return Ok(ForegroundApp { exe: String::new(), title: String::new() });
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
        let mut exe = String::new();
        if pid != 0 {
            if let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                let mut buf = [0u16; 260];
                let len = K32GetModuleFileNameExW(h, HMODULE(std::ptr::null_mut()), &mut buf);
                if len > 0 {
                    let full = String::from_utf16_lossy(&buf[..len as usize]);
                    if let Some(n) = full.rsplit(['\\', '/']).next() {
                        exe = n.to_string();
                    }
                }
                let _ = CloseHandle(h);
            }
        }
        let mut tbuf = [0u16; 512];
        let tlen = GetWindowTextW(hwnd, &mut tbuf);
        let title = String::from_utf16_lossy(&tbuf[..tlen as usize]);
        Ok(ForegroundApp { exe, title })
    }
}

/// Abre una URL en el navegador por defecto vía explorer.exe (que corre sin
/// elevar aunque la app vaya como admin; abrir el navegador directo desde un
/// proceso elevado falla en silencio). Solo http(s), sin shell de por medio.
#[tauri::command]
fn open_external_url(url: String) -> Result<String, String> {
    let u = url.trim();
    if !(u.starts_with("https://") || u.starts_with("http://")) {
        return Err("solo URLs http(s)".to_string());
    }
    if u.chars().any(|c| c.is_whitespace() || c == '"' || c == '\'') {
        return Err("URL inválida".to_string());
    }
    silent_command("explorer.exe")
        .arg(u)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok("opened".into())
}

/// Versión de la app (para el update checker del frontend).
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_latency_stats() -> Result<LatencyStats, String> {
    let path = if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("Lefty").join("latency_stats.json")
    } else {
        PathBuf::from("latency_stats.json")
    };
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(LatencyStats { avg_us: 0, max_us: 0, events: 0, ts_ms: 0 }),
    }
}

#[tauri::command]
fn get_debug_info() -> Result<String, String> {
    let path = if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("Lefty").join("engine_mappings.json")
    } else {
        PathBuf::from("engine_mappings.json")
    };
    let content = fs::read_to_string(&path).unwrap_or_else(|_| "no file".to_string());
    let metadata = fs::metadata(&path).map(|m| format!("{:?}", m.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH))).unwrap_or("no meta".to_string());
    Ok(format!("path={:?} modified={} content={}", path, metadata, content))
}

// native low-level: GetKeyName via keyboard_layout (ToUnicodeEx + overrides), clear numpad bit
fn vk_to_name(vk: u32) -> String {
    // vk is numpad-encoded, clear bit 31 for naming
    // For our engine, we pass vk_enc; keyboard_layout::get_key_name expects exact vk (with origin bit for numpad variants)
    // But for generic naming, use clean vk if origin variant not found
    let name = keyboard_layout::get_key_name(vk);
    if name != "Undefined" && !name.starts_with("VK ") {
        return name;
    }
    let clean = vk & !(1u32 << 31);
    let clean_name = keyboard_layout::get_key_name(clean);
    if clean_name != "Undefined" && !clean_name.starts_with("VK ") {
        return clean_name;
    }
    // Fallback to OEM distinct names for LATAM if layout is US
    match clean {
        0xBA => "\u{00D1}".to_string(),
        0xBB => "'".to_string(),
        0xBC => ",".to_string(),
        0xBD => "-".to_string(),
        0xBE => ".".to_string(),
        0xBF => "/".to_string(),
        0xC0 => "`".to_string(),
        0xDB => "\u{00B4}".to_string(),
        0xDC => "\\".to_string(),
        0xDD => "+".to_string(),
        0xDE => "\u{00C7}".to_string(),
        0xE2 => "<".to_string(),
        0xFF | 0x100 => "DISABLED".to_string(),
        0x105 => "MOUSE_X1".to_string(),
        0x106 => "MOUSE_X2".to_string(),
        _ => format!("VK_{:02X}", clean),
    }
}

#[tauri::command]
fn get_key_name_list() -> Vec<(u32, String)> {
    keyboard_layout::get_key_name_list(false)
}

#[tauri::command]
fn get_key_code_list() -> Vec<u32> {
    keyboard_layout::get_key_code_list(false)
}

// native low-level capture: ConfigureDetectSingleKeyRemapUI + DetectSingleRemapKeyUIBackend
// Low-level hook that suppresses while in detect UI (returns 1), encodes numpad origin, no scan priority
#[tauri::command]
fn capture_key() -> Result<String, String> {
    let (tx, rx) = mpsc::channel();
    {
        let mtx = CAPTURE_TX.get_or_init(|| Mutex::new(None));
        let mut guard = mtx.lock().map_err(|e| e.to_string())?;
        *guard = Some(tx);
    }
    unsafe extern "system" fn cap_hook(n: i32, w: WPARAM, l: LPARAM) -> LRESULT {
        use windows::Win32::UI::WindowsAndMessaging::MSLLHOOKSTRUCT;
        // WM_XBUTTONDOWN/UP sin importar (evita tocar los imports del módulo).
        const XDOWN: u32 = 0x020B;
        const XUP: u32 = 0x020C;
        if n == HC_ACTION as i32 {
            let w_u = w.0 as u32;
            let is_key_down = w_u == WM_KEYDOWN || w_u == WM_SYSKEYDOWN;
            let is_key_up = w_u == WM_KEYUP || w_u == WM_SYSKEYUP;
            // Suppress while in detect window
            // For Tauri, capturing state is active until first keydown is detected
            let has_capture = CAPTURE_TX.get().and_then(|m| m.lock().ok()).map(|g| g.is_some()).unwrap_or(false);
            if has_capture {
                // Laterales del mouse: DOWN captura MOUSE_X1/X2, UP se traga.
                if w_u == XDOWN || w_u == XUP {
                    if w_u == XDOWN {
                        let ms = &*(l.0 as *const MSLLHOOKSTRUCT);
                        let vk = match (ms.mouseData >> 16) & 0xFFFF {
                            0x0001 => 0x105,
                            0x0002 => 0x106,
                            _ => 0,
                        };
                        if vk != 0 {
                            if let Some(mtx) = CAPTURE_TX.get() {
                                if let Ok(mut guard) = mtx.lock() {
                                    if let Some(tx) = guard.take() {
                                        let _ = tx.send((vk, 0));
                                    }
                                }
                            }
                        }
                    }
                    return LRESULT(1);
                }
                if is_key_down {
                    let kb = &*(l.0 as *const KBDLLHOOKSTRUCT);
                    let vk = kb.vkCode;
                    // Encode numpad origin
                    let ext = (kb.flags.0 & 0x01) != 0;
                    let mut origin = false;
                    match vk {
                        0x25|0x26|0x27|0x28|0x2D|0x2E|0x21|0x22|0x24|0x23 => origin = !ext,
                        0x0D|0x6F => origin = ext,
                        _ => {}
                    }
                    let vk_enc = if origin { vk | (1u32<<31) } else { vk };
                    let sc = kb.scanCode;
                    if let Some(mtx) = CAPTURE_TX.get() {
                        if let Ok(mut guard) = mtx.lock() {
                            if let Some(tx) = guard.take() {
                                let _ = tx.send((vk_enc, sc));
                            }
                        }
                    }
                    // Suppress the detected key (engine returns 1)
                    return LRESULT(1);
                } else if is_key_up {
                    // Suppress key-up while capturing
                    return LRESULT(1);
                }
            }
        }
        unsafe { CallNextHookEx(HHOOK(std::ptr::null_mut()), n, w, l) }
    }
    let hook = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(cap_hook), HINSTANCE(std::ptr::null_mut()), 0) }.map_err(|e| format!("hook fail {:?}", e))?;
    let mouse_hook = unsafe { SetWindowsHookExW(windows::Win32::UI::WindowsAndMessaging::WH_MOUSE_LL, Some(cap_hook), HINSTANCE(std::ptr::null_mut()), 0) }.map_err(|e| format!("mouse hook fail {:?}", e))?;
    let start = std::time::Instant::now();
    let res = loop {
        if let Ok(v) = rx.try_recv() {
            break Ok(v);
        }
        if start.elapsed().as_secs() >= 10 {
            break Err("timeout - no key was pressed".to_string());
        }
        unsafe {
            use windows::Win32::UI::WindowsAndMessaging::{DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE};
            let mut msg: MSG = std::mem::zeroed();
            let has = PeekMessageW(&mut msg, HWND(std::ptr::null_mut()), 0, 0, PM_REMOVE);
            if has.as_bool() {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            } else {
                std::thread::sleep(Duration::from_millis(5));
            }
        }
    };
    unsafe { let _ = UnhookWindowsHookEx(hook); }
    unsafe { let _ = UnhookWindowsHookEx(mouse_hook); }
    if let Some(mtx) = CAPTURE_TX.get() {
        let _ = mtx.lock().map(|mut g| *g = None);
    }
    let (vk_enc, _sc) = res?;
    // native low-level: no scan priority improvisation — use VK directly (clear numpad bit for naming via vk_to_name)
    Ok(vk_to_name(vk_enc))
}

/// ¿Hay algún lefty_engine.exe vivo? (para reap con espera, sin sleeps ciegos)
fn engine_process_running() -> bool {
    silent_command("tasklist")
        .args(["/FI", "IMAGENAME eq lefty_engine.exe", "/FO", "CSV", "/NH"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("lefty_engine.exe"))
        .unwrap_or(false)
}

#[tauri::command]
fn start_engine(profile: String, state: State<EngineState>, app: tauri::AppHandle) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            // Hijo vivo de verdad: no duplicar.
            Ok(None) => return Ok("already running".into()),
            // Hijo muerto (crash, taskkill externo, víctima del viejo singleton
            // suicida): soltar el slot y re-spawnear abajo en vez de mentir.
            _ => { *guard = None; }
        }
    }
    // Sin hijo rastreado puede quedar un huérfano/zombi de una sesión previa
    // (builds viejos sin salida limpia). Reaped seguro: nuestra imagen es otra,
    // aquí no hay suicidio posible como en el singleton del engine.
    // Pero taskkill es async: hay que ESPERAR a que muera antes de spawnear,
    // o el nuevo ve el mutex aún ocupado y cede (cero engines). Sin sleeps
    // ciegos: solo si tasklist ve algo, y espera acotada a que desaparezca.
    if engine_process_running() {
        let _ = silent_command("taskkill").args(["/F", "/IM", "lefty_engine.exe"]).output();
        for _ in 0..40 {
            if !engine_process_running() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }
    let exe = if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        PathBuf::from(manifest_dir).join("../../engine_native/target/release/lefty_engine.exe")
    } else {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let base = exe_path.parent().unwrap();
        let mut candidates = vec![
            base.join("lefty_engine.exe"),
            base.join("resources").join("lefty_engine.exe"),
            base.join("resources").join("lefty_engine"),
        ];
        if let Ok(res_dir) = app.path().resource_dir() {
            candidates.push(res_dir.join("lefty_engine.exe"));
            candidates.push(res_dir.join("../../engine_native/target/release/lefty_engine.exe"));
        }
        candidates.into_iter().find(|p| p.exists()).unwrap_or_else(|| base.join("lefty_engine.exe"))
    };
    let exe = if exe.exists() { exe } else {
        let mut fallbacks = vec![
            PathBuf::from("engine_native/target/release/lefty_engine.exe"),
            PathBuf::from("../../engine_native/target/release/lefty_engine.exe"),
            PathBuf::from("../engine_native/target/release/lefty_engine.exe"),
        ];
        if let Ok(res_dir) = app.path().resource_dir() {
            fallbacks.push(res_dir.join("lefty_engine.exe"));
        }
        fallbacks.into_iter().find(|p| p.exists()).unwrap_or(exe)
    };
    if !exe.exists() {
        return Err(format!("lefty_engine.exe no encontrado en {:?}", exe));
    }
    let mut cmd = Command::new(exe);
    cmd.arg("--parent-pid").arg(std::process::id().to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    *guard = Some(child);
    Ok(format!("started pid {} profile {} native", guard.as_ref().unwrap().id(), profile))
}

#[tauri::command]
fn stop_engine(state: State<EngineState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
        Ok("stopped".into())
    } else {
        Ok("not running".into())
    }
}

fn kill_existing_instances() {
    // Mata solo instancias que no son la actual (evita suicidio del segundo Lefty)
    let current_pid = std::process::id();
    unsafe {
        use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
        use windows::Win32::Foundation::{CloseHandle, MAX_PATH};
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if let Ok(h) = snapshot {
            let mut entry = PROCESSENTRY32W::default();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            if Process32FirstW(h, &mut entry).is_ok() {
                loop {
                    let exe_name = String::from_utf16_lossy(&entry.szExeFile[..]).trim_matches('\0').to_lowercase();
                    let pid = entry.th32ProcessID;
                    if pid != current_pid && (exe_name == "lefty.exe" || exe_name == "lefty_engine.exe") {
                        let _ = silent_command("taskkill").args(["/F", "/PID", &pid.to_string()]).output();
                    }
                    if Process32NextW(h, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(h);
        }
    }
    // Fallback por si ToolHelp falla: intenta taskkill pero ya filtramos PID, así que no mata al actual si usamos /PID
    // También intenta cerrar ventana graceful
    unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, PostMessageW, WM_CLOSE};
        use windows::core::PCWSTR;
        let title_w: Vec<u16> = "Lefty v2\0".encode_utf16().collect();
        if let Ok(hwnd) = FindWindowW(PCWSTR::null(), PCWSTR(title_w.as_ptr())) {
            if !hwnd.0.is_null() {
                let _ = PostMessageW(hwnd, WM_CLOSE, windows::Win32::Foundation::WPARAM(0), windows::Win32::Foundation::LPARAM(0));
            }
        }
    }
}

fn check_single_instance() -> bool {
    unsafe {
        use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
        use windows::Win32::System::Threading::CreateMutexW;
        use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_YESNO, MB_ICONQUESTION, MB_TOPMOST, IDYES};
        use windows::Win32::Foundation::HWND;
        use windows::core::PCWSTR;

        let name: Vec<u16> = "Global\\LeftySingleton\0".encode_utf16().collect();
        let mutex = match CreateMutexW(None, true, PCWSTR(name.as_ptr())) {
            Ok(h) => h,
            Err(_) => return true,
        };
        let err = GetLastError();
        if err == ERROR_ALREADY_EXISTS {
            let msg: Vec<u16> = "Lefty is already running. Do you want to close the current instance and open a new one?\0".encode_utf16().collect();
            let caption: Vec<u16> = "Lefty - Already running\0".encode_utf16().collect();
            let ret = MessageBoxW(HWND(std::ptr::null_mut()), PCWSTR(msg.as_ptr()), PCWSTR(caption.as_ptr()), MB_YESNO | MB_ICONQUESTION | MB_TOPMOST);
            if ret == IDYES {
                let _ = CloseHandle(mutex);
                kill_existing_instances();
                // Esperar a que el mutex se libere y el engine muera (hasta 3s)
                for _ in 0..30 {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    let name2: Vec<u16> = "Global\\LeftySingleton\0".encode_utf16().collect();
                    if let Ok(h2) = CreateMutexW(None, true, PCWSTR(name2.as_ptr())) {
                        let err2 = GetLastError();
                        if err2 != ERROR_ALREADY_EXISTS {
                            std::mem::forget(Box::new(h2));
                            return true;
                        } else {
                            let _ = CloseHandle(h2);
                        }
                    }
                    // Reintentar matar si sigue vivo
                    let _ = silent_command("taskkill").args(["/F", "/IM", "Lefty.exe"]).output();
                    let _ = silent_command("taskkill").args(["/F", "/IM", "lefty_engine.exe"]).output();
                }
                // Si no se liberó, intentar igual y continuar
                let name2: Vec<u16> = "Global\\LeftySingleton\0".encode_utf16().collect();
                if let Ok(h2) = CreateMutexW(None, true, PCWSTR(name2.as_ptr())) {
                    std::mem::forget(Box::new(h2));
                }
                return true;
            } else {
                let _ = CloseHandle(mutex);
                return false;
            }
        }
        std::mem::forget(Box::new(mutex));
        true
    }
}

fn main() {
    // 1) Elevar PRIMERO: el reemplazo de instancias (taskkill) falla con
    // Access Denied si una instancia sin elevar intenta matar a la elevada,
    // dejando dos Lefty vivos y clicks invertidos "para siempre".
    #[cfg(not(debug_assertions))]
    {
        if !is_admin() {
            unsafe {
                use windows::core::PCWSTR;
                use windows::Win32::Foundation::HWND;
                use windows::Win32::UI::Shell::ShellExecuteW;
                use windows::Win32::UI::WindowsAndMessaging::SW_NORMAL;
                if let Ok(exe) = std::env::current_exe() {
                    let exe_w: Vec<u16> = exe.to_string_lossy().encode_utf16().chain(Some(0)).collect();
                    let op: Vec<u16> = "runas\0".encode_utf16().collect();
                    ShellExecuteW(HWND(std::ptr::null_mut()), PCWSTR(op.as_ptr()), PCWSTR(exe_w.as_ptr()), PCWSTR::null(), PCWSTR::null(), SW_NORMAL);
                }
            }
            std::process::exit(0);
        }
    }
    // 2) Singleton DESPUÉS (ya elevados: el kill sí funciona). Limpieza de
    // archivos legacy del baseline anterior basado en ficheros (inertes desde
    // que el baseline se lee del registro).
    if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("Lefty");
        let _ = fs::remove_file(dir.join("mouse_orig.txt"));
        let _ = fs::remove_file(dir.join("mouse_imposed.txt"));
    }
    if !check_single_instance() {
        std::process::exit(0);
    }
    let engine_state = EngineState(Arc::new(Mutex::new(None)));
    tauri::Builder::default()
        .device_event_filter(tauri::DeviceEventFilter::Always)
        .manage(engine_state)
        .setup(|app| {
            use tauri::tray::{TrayIconBuilder, TrayIconEvent};
            use tauri::menu::{Menu, MenuItem};
            use tauri::Manager;
            let quit = MenuItem::with_id(app, "quit", "Close", true, None::<&str>).unwrap();
            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>).unwrap();
            let menu = Menu::with_items(app, &[&show, &quit]).unwrap();
            let _ = TrayIconBuilder::with_id("lefty-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Lefty v2 — By Sycho (F6 toggle)")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "toggle" => {
                        use tauri::Emitter;
                        let _ = app.emit("tray-toggle", ());
                    }
                    id if id.starts_with("profile:") => {
                        use tauri::Emitter;
                        let _ = app.emit("tray-switch-profile", &id["profile:".len()..]);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, button_state: tauri::tray::MouseButtonState::Up, .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app);
            // Start minimized: ocultar tras crear. La ventana nace visible
            // como en los builds viejos (visible:false rompía el maximized).
            if start_minimized_enabled() {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            Ok(())
        })
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Check hide_to_tray setting (default true)
                let hide = std::fs::read_to_string(
                    std::env::var("APPDATA").map(|a| PathBuf::from(a).join("Lefty").join("hide_tray.txt")).unwrap_or(PathBuf::from("hide_tray.txt"))
                ).map(|s| s.trim() != "0").unwrap_or(true);
                if hide {
                    api.prevent_close();
                    let _ = window.hide();
                }
                // else let close proceed (will trigger RunEvent::Exit cleanup)
            }
        })
        .invoke_handler(tauri::generate_handler![is_admin, restart_as_admin, get_mappings_path, start_engine, stop_engine, update_mappings, capture_key, get_key_name_list, get_key_code_list, get_debug_info, get_f6_state, get_engine_enabled, set_engine_enabled, set_invert_clicks, set_hotkey, get_hotkey, set_autostart, get_autostart, set_hide_to_tray, get_hide_to_tray, set_start_minimized, get_start_minimized, get_latency_stats, apply_gamer_focus, get_foreground_app, scan_steam_games, scan_epic_games, get_app_version, open_external_url, update_tray_menu])
        .build(tauri::generate_context!())
        .expect("error while building tauri app")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Restaurar clicks al baseline real del registro (nunca al estado
                // en memoria: una 2ª instancia lo habría capturado ya invertido).
                let base = mouse_baseline_swapped();
                unsafe { windows::Win32::UI::Input::KeyboardAndMouse::SwapMouseButton(base); }
                // Restaurar avisos de accesibilidad si se suprimieron.
                a11y_restore();
                if let Some(state) = app.try_state::<EngineState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
                // Fallback: asegura que no quede lefty_engine huérfano (si fue lanzado y no está en EngineState)
                let _ = silent_command("taskkill").args(["/F", "/IM", "lefty_engine.exe"]).output();
                // También limpiar mutex para single instance
                let _ = std::fs::remove_file(std::env::temp_dir().join("lefty_single_instance.lock"));
            }
            // Si el usuario cierra la ventana y no es hide_to_tray, también matar engine en CloseRequested
            if let tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::CloseRequested { .. }, .. } = &event {
                if label == "main" {
                    // Verificar si hide_to_tray es false, entonces la ventana se está cerrando realmente
                    let hide = std::fs::read_to_string(
                        std::env::var("APPDATA").map(|a| PathBuf::from(a).join("Lefty").join("hide_tray.txt")).unwrap_or(PathBuf::from("hide_tray.txt"))
                    ).map(|s| s.trim() != "0").unwrap_or(true);
                    if !hide {
                        if let Some(state) = app.try_state::<EngineState>() {
                            if let Ok(mut guard) = state.0.lock() {
                                if let Some(mut child) = guard.take() {
                                    let _ = child.kill();
                                    let _ = child.wait();
                                }
                            }
                        }
                        let _ = silent_command("taskkill").args(["/F", "/IM", "lefty_engine.exe"]).output();
                    }
                }
            }
        });
}

#[cfg(test)]
mod mapping_tests {
    use super::name_to_vk;

    /// Nombres independientes del layout: SIEMPRE deben resolver (letras vía
    /// enum con caps, resto vía alias/overrides). Si falla alguno, perfiles
    /// con ese nombre se descartan en silencio.
    #[test]
    fn frontend_names_resolve() {
        let mut names: Vec<String> = Vec::new();
        for c in 'A'..='Z' {
            names.push(c.to_string());
        }
        for c in '0'..='9' {
            names.push(c.to_string());
        }
        for i in 1..=12 {
            names.push(format!("F{}", i));
        }
        names.extend(
            [
                "ESC", "TAB", "CAPSLOCK", "SHIFT", "LSHIFT", "RSHIFT", "CTRL", "LCTRL",
                "RCTRL", "ALT", "LALT", "RALT", "LWIN", "RWIN", "SPACE", "ENTER",
                "BACKSPACE", "UP", "DOWN", "LEFT", "RIGHT", "INSERT", "DELETE",
                "HOME", "END", "PAGEUP", "PAGEDOWN", "NUMLOCK", "SCROLLLOCK",
                "PRINTSCREEN", "PAUSE", "SLEEP", "DISABLED",
            ]
            .iter()
            .map(|s| s.to_string()),
        );
        for i in 0..=9 {
            names.push(format!("NUM{}", i));
        }
        names.extend(
            ["NUM*", "NUM+", "NUM-", "NUM.", "NUM/", "NUMENTER"]
                .iter()
                .map(|s| s.to_string()),
        );
        let mut missing = Vec::new();
        for n in &names {
            if name_to_vk(n).is_none() {
                missing.push(n.clone());
            }
        }
        assert!(missing.is_empty(), "sin resolver: {:?}", missing);
    }

    /// OEM dependientes del layout: al menos UNA variante debe resolver
    /// (";" en US, "Ñ" en LATAM) para que los companions cubran el perfil.
    #[test]
    fn oem_companions_cover() {
        let semi = name_to_vk(";").is_some() || name_to_vk("Ñ").is_some();
        assert!(semi, "ni ';' ni 'Ñ' resuelven en este layout");
        assert!(name_to_vk("[").is_some(), "'[' sin resolver");
        assert!(name_to_vk("´").is_some(), "'´' sin resolver");
    }
}
