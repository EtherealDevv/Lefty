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

#[derive(Clone)]
struct EngineState(Arc<Mutex<Option<Child>>>);
static CAPTURE_TX: OnceLock<Mutex<Option<mpsc::Sender<(u32, u32)>>>> = OnceLock::new();
static ORIGINAL_SWAP_STATE: OnceLock<Mutex<Option<bool>>> = OnceLock::new();

#[tauri::command]
fn is_admin() -> bool {
    unsafe { windows::Win32::UI::Shell::IsUserAnAdmin().as_bool() }
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
        _ => None,
    }
}

#[tauri::command]
fn update_mappings(mappings: Vec<(String, String)>) -> Result<String, String> {
    let mut vk_map: HashMap<u32, u32> = HashMap::new();
    for (s,d) in mappings {
        if let (Some(sv), Some(dv)) = (name_to_vk(&s), name_to_vk(&d)) {
            if sv != dv {
                vk_map.insert(sv, dv);
            }
        }
    }
    let path = if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("Lefty");
        let _ = fs::create_dir_all(&dir);
        dir.join("engine_mappings.json")
    } else {
        PathBuf::from("engine_mappings.json")
    };
    let json_map: HashMap<String, u32> = vk_map.iter().map(|(k,v)| (k.to_string(), *v)).collect();
    let json = serde_json::to_string(&json_map).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(format!("wrote {} mappings to {:?}", vk_map.len(), path))
}

#[tauri::command]
fn set_invert_clicks(enabled: bool) -> Result<String, String> {
    let orig_mtx = ORIGINAL_SWAP_STATE.get_or_init(|| Mutex::new(None));
    unsafe {
        use windows::Win32::UI::Input::KeyboardAndMouse::SwapMouseButton;
        use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SYSTEM_METRICS_INDEX};
        const SM_SWAPBUTTON: i32 = 23;
        {
            let mut guard = orig_mtx.lock().map_err(|e| e.to_string())?;
            if guard.is_none() {
                let cur = GetSystemMetrics(SYSTEM_METRICS_INDEX(SM_SWAPBUTTON)) != 0;
                *guard = Some(cur);
            }
        }
        SwapMouseButton(enabled);
        Ok(format!("SwapMouseButton {}", enabled))
    }
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
        Ok(true)
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

fn get_task_name() -> Result<String, String> {
    let user = std::env::var("USERNAME").map_err(|e| e.to_string())?;
    Ok(format!("\\Lefty\\Autorun for {}", user))
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
    // PowerToys-style Task Scheduler autostart — robust, shows as Lefty in Task Manager Startup
    let task_name = get_task_name()?;
    let exe = get_exe_for_autostart()?;
    let exe_str = exe.to_string_lossy().to_string();
    // Clean legacy registry entries that showed Lefty_fix
    let key_path = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    let _ = std::process::Command::new("reg").args(["delete", &format!("HKCU\\{}", key_path), "/v", "Lefty_fix", "/f"]).output();
    let _ = std::process::Command::new("reg").args(["delete", &format!("HKCU\\{}", key_path), "/v", "lefty-tauri", "/f"]).output();
    let _ = std::process::Command::new("reg").args(["delete", &format!("HKCU\\{}", key_path), "/v", "Lefty-tauri", "/f"]).output();
    let _ = std::process::Command::new("reg").args(["delete", &format!("HKCU\\{}", key_path), "/v", "Lefty", "/f"]).output();
    let status = if enabled {
        // PowerToys uses \PowerToys\Autorun for %USERNAME% with ONLOGON trigger, delay 3s, interactive token
        // We do same for \Lefty\Autorun for %USERNAME%
        let username = std::env::var("USERNAME").map_err(|e| e.to_string())?;
        let userdomain = std::env::var("USERDOMAIN").unwrap_or_else(|_| ".".to_string());
        let full_user = format!("{}\\{}", userdomain, username);
        // Use schtasks to create task — PowerToys uses COM Task Scheduler, schtasks is equivalent and simpler
        std::process::Command::new("schtasks")
            .args([
                "/Create",
                "/TN", &task_name,
                "/TR", &format!("\"{}\"", exe_str),
                "/SC", "ONLOGON",
                "/RU", &full_user,
                "/RL", "HIGHEST",
                "/DELAY", "0000:03",
                "/F",
            ])
            .output()
            .map_err(|e| e.to_string())?
    } else {
        std::process::Command::new("schtasks")
            .args(["/Delete", "/TN", &task_name, "/F"])
            .output()
            .map_err(|e| e.to_string())?
    };
    if !status.status.success() {
        return Err(format!("reg failed: {:?}", status));
    }
    Ok(format!("autostart {}", enabled))
}

#[tauri::command]
fn get_autostart() -> Result<bool, String> {
    // PowerToys-style: check Task Scheduler task existence and enabled
    let task_name = get_task_name()?;
    let out = std::process::Command::new("schtasks")
        .args(["/Query", "/TN", &task_name])
        .output()
        .map_err(|e| e.to_string())?;
    // schtasks returns 0 if task exists, even if disabled; we check output for "Ready" or "Running" vs "Disabled"
    // Simpler: if query succeeds, check if task is not disabled via /Query /V /FO CSV
    if !out.status.success() {
        return Ok(false);
    }
    let out_v = std::process::Command::new("schtasks")
        .args(["/Query", "/TN", &task_name, "/V", "/FO", "CSV"])
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out_v.stdout);
    // If task exists but is disabled, it will contain "Disabled"
    if stdout.to_lowercase().contains("disabled") {
        return Ok(false);
    }
    Ok(true)
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

#[tauri::command]
fn get_f6_state() -> Result<bool, String> {
    get_engine_enabled()
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
        if n == HC_ACTION as i32 {
            let w_u = w.0 as u32;
            let is_key_down = w_u == WM_KEYDOWN || w_u == WM_SYSKEYDOWN;
            let is_key_up = w_u == WM_KEYUP || w_u == WM_SYSKEYUP;
            // Suppress while in detect window
            // For Tauri, capturing state is active until first keydown is detected
            let has_capture = CAPTURE_TX.get().and_then(|m| m.lock().ok()).map(|g| g.is_some()).unwrap_or(false);
            if has_capture {
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
    if let Some(mtx) = CAPTURE_TX.get() {
        let _ = mtx.lock().map(|mut g| *g = None);
    }
    let (vk_enc, _sc) = res?;
    // native low-level: no scan priority improvisation — use VK directly (clear numpad bit for naming via vk_to_name)
    Ok(vk_to_name(vk_enc))
}

#[tauri::command]
fn start_engine(profile: String, state: State<EngineState>, app: tauri::AppHandle) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok("already running".into());
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

fn main() {
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
        .invoke_handler(tauri::generate_handler![is_admin, get_mappings_path, start_engine, stop_engine, update_mappings, capture_key, get_key_name_list, get_key_code_list, get_debug_info, get_f6_state, get_engine_enabled, set_engine_enabled, set_invert_clicks, set_hotkey, get_hotkey, set_autostart, get_autostart, set_hide_to_tray, get_hide_to_tray])
        .build(tauri::generate_context!())
        .expect("error while building tauri app")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(mtx) = ORIGINAL_SWAP_STATE.get() {
                    if let Ok(guard) = mtx.lock() {
                        if let Some(orig) = *guard {
                            unsafe { windows::Win32::UI::Input::KeyboardAndMouse::SwapMouseButton(orig); }
                        }
                    }
                }
                if let Some(state) = app.try_state::<EngineState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
