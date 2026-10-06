#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
    UnhookWindowsHookEx, HC_ACTION, HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN,
    WM_SYSKEYDOWN, MSLLHOOKSTRUCT,
};
use windows::Win32::System::Threading::{GetCurrentProcess, GetCurrentThread, SetPriorityClass, SetThreadPriority, HIGH_PRIORITY_CLASS, THREAD_PRIORITY_TIME_CRITICAL};

mod helpers;
mod keyboard_event_handlers;
mod state;

use helpers::{KEYBOARDMANAGER_INJECTED_FLAG, KEYBOARDMANAGER_SUPPRESS_FLAG};

// Global state — lock-free via ArcSwap inside State
static mut G_HOOK: HHOOK = HHOOK(std::ptr::null_mut());
static mut G_HOOK_COPY: HHOOK = HHOOK(std::ptr::null_mut());
static mut G_MOUSE_HOOK: HHOOK = HHOOK(std::ptr::null_mut());

/// Botones laterales del mouse como fuente (X1/X2 → pseudo-VK).
/// Reusa el pipeline single/combo: DOWN = pulsar, UP = soltar.
/// Sin mapeo → pasa de largo (back/forward del navegador intactos).
const WM_XBUTTONDOWN: u32 = 0x020B;
const WM_XBUTTONUP: u32 = 0x020C;
const LLMHF_INJECTED: u32 = 0x00000001;
static RUNNING: AtomicBool = AtomicBool::new(true);
static MAIN_DONE: AtomicBool = AtomicBool::new(false);
static ENABLED: AtomicBool = AtomicBool::new(false);
static HOTKEY_VK: AtomicU32 = AtomicU32::new(0x75);
// Antirrebote del hotkey: el auto-repeat del teclado genera KEYDOWN
// repetidos al mantenerlo pulsado; sin esto conmuta en ráfaga.
static LAST_HOTKEY_TOGGLE_MS: AtomicU64 = AtomicU64::new(0);
const HOTKEY_DEBOUNCE_MS: u64 = 400;

#[inline(always)]
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
// Telemetría de latencia hook→inyección (solo remapeos): QPC + acumuladores
// lock-free. Overhead por tecla <0.1µs. Un hilo la vuelca a JSON cada segundo.
static LAT_QPF: AtomicU64 = AtomicU64::new(0);
static LAT_SUM_US: AtomicU64 = AtomicU64::new(0);
static LAT_MAX_US: AtomicU32 = AtomicU32::new(0);
static LAT_N: AtomicU64 = AtomicU64::new(0);

#[inline(always)]
pub(crate) fn qpc_now() -> u64 {
    unsafe {
        let mut t: i64 = 0;
        windows::Win32::System::Performance::QueryPerformanceCounter(&mut t);
        t as u64
    }
}

#[inline(always)]
pub(crate) fn latency_record(dt_ticks: u64) {
    let qpf = LAT_QPF.load(Ordering::Relaxed);
    if qpf == 0 {
        return;
    }
    let us = dt_ticks.saturating_mul(1_000_000) / qpf;
    LAT_SUM_US.fetch_add(us, Ordering::Relaxed);
    LAT_N.fetch_add(1, Ordering::Relaxed);
    LAT_MAX_US.fetch_max(us.min(u32::MAX as u64) as u32, Ordering::Relaxed);
}

#[inline(always)]
fn set_mappings(m: HashMap<u32, Vec<u32>>) {
    let state = state::global_state();
    state.clear_all();
    for (src, dst) in m {
        if dst.len() == 1 {
            state.set_single_key_remap(src, dst[0]);
        } else if !dst.is_empty() {
            state.set_combo_remap(src, dst);
        }
    }
}

#[inline(always)]
unsafe extern "system" fn mouse_hook(n: i32, w: WPARAM, l: LPARAM) -> LRESULT {
    if n != HC_ACTION as i32 {
        return CallNextHookEx(G_HOOK_COPY, n, w, l);
    }
    let msg = w.0 as u32;
    if msg != WM_XBUTTONDOWN && msg != WM_XBUTTONUP {
        return CallNextHookEx(G_HOOK_COPY, n, w, l);
    }
    let ms = &*(l.0 as *const MSLLHOOKSTRUCT);
    if (ms.flags & LLMHF_INJECTED) != 0 {
        return CallNextHookEx(G_HOOK_COPY, n, w, l);
    }
    let mut vk = match (ms.mouseData >> 16) & 0xFFFF {
        0x0001 => crate::state::VK_MOUSE_X1,
        0x0002 => crate::state::VK_MOUSE_X2,
        _ => return CallNextHookEx(G_HOOK_COPY, n, w, l),
    };
    let is_down = msg == WM_XBUTTONDOWN;
    let state = state::global_state();
    let t0 = qpc_now();
    let result = keyboard_event_handlers::handle_single_key_remap(&mut vk, is_down, 0, state);
    if result.is_some() {
        latency_record(qpc_now().wrapping_sub(t0));
        return LRESULT(1);
    }
    CallNextHookEx(G_HOOK_COPY, n, w, l)
}

#[inline(always)]
unsafe extern "system" fn hook(n: i32, w: WPARAM, l: LPARAM) -> LRESULT {
    if n != HC_ACTION as i32 {
        return CallNextHookEx(G_HOOK_COPY, n, w, l);
    }
    let kb = &*(l.0 as *const KBDLLHOOKSTRUCT);
    let vk_raw = kb.vkCode;
    let flags = kb.flags;
    let extra = kb.dwExtraInfo as usize;
    let is_extended = (flags.0 & 0x01) != 0;
    let mut vk = helpers::encode_numpad_origin(vk_raw, is_extended);

    if extra == KEYBOARDMANAGER_SUPPRESS_FLAG {
        return LRESULT(1);
    }
    if (extra & KEYBOARDMANAGER_INJECTED_FLAG) != 0 {
        return CallNextHookEx(G_HOOK_COPY, n, w, l);
    }

    let hotkey = HOTKEY_VK.load(Ordering::Relaxed);
    if vk_raw == hotkey && (w.0 == WM_KEYDOWN as usize || w.0 == WM_SYSKEYDOWN as usize) {
        let now = now_ms();
        if now.wrapping_sub(LAST_HOTKEY_TOGGLE_MS.load(Ordering::Relaxed)) < HOTKEY_DEBOUNCE_MS {
            return LRESULT(1);
        }
        LAST_HOTKEY_TOGGLE_MS.store(now, Ordering::Relaxed);
        let new_val = !ENABLED.load(Ordering::Relaxed);
        ENABLED.store(new_val, Ordering::Relaxed);
        if let Ok(appdata) = env::var("APPDATA") {
            let p = PathBuf::from(appdata).join("Lefty").join("f6_toggle.txt");
            let val = new_val;
            std::thread::spawn(move || {
                let _ = fs::create_dir_all(p.parent().unwrap());
                let _ = fs::write(&p, if val { b"1" } else { b"0" });
            });
        }
        return LRESULT(1);
    }
    if vk_raw == hotkey {
        return LRESULT(1);
    }

    if !ENABLED.load(Ordering::Relaxed) {
        return CallNextHookEx(G_HOOK_COPY, n, w, l);
    }

    let is_key_down = w.0 == WM_KEYDOWN as usize || w.0 == WM_SYSKEYDOWN as usize;

    let state = state::global_state();
    let t0 = qpc_now();
    let result = keyboard_event_handlers::handle_single_key_remap(&mut vk, is_key_down, extra, state);

    if result.is_some() {
        latency_record(qpc_now().wrapping_sub(t0));
        return LRESULT(1);
    }

    CallNextHookEx(G_HOOK_COPY, n, w, l)
}

fn mappings_path() -> PathBuf {
    let args: Vec<String> = env::args().collect();
    for i in 0..args.len() {
        if args[i] == "--mappings" && i + 1 < args.len() {
            return PathBuf::from(&args[i + 1]);
        }
    }
    if let Ok(p) = env::var("LEFTY_MAPPINGS") {
        return PathBuf::from(p);
    }
    if let Ok(a) = env::var("APPDATA") {
        return PathBuf::from(a).join("Lefty").join("engine_mappings.json");
    }
    PathBuf::from("engine_mappings.json")
}

/// Destino en disco: número (single, formato legacy) o array (combo).
#[derive(serde::Deserialize)]
#[serde(untagged)]
enum Targets {
    One(u32),
    Many(Vec<u32>),
}

fn load(p: &Path) -> Option<HashMap<u32, Vec<u32>>> {
    let s = fs::read_to_string(p).ok()?;
    let m: HashMap<String, Targets> = serde_json::from_str(&s).ok()?;
    let mut o = HashMap::new();
    for (k, v) in m {
        if let Ok(ki) = k.parse::<u32>() {
            match v {
                Targets::One(x) => {
                    o.insert(ki, vec![x]);
                }
                Targets::Many(xs) if !xs.is_empty() => {
                    o.insert(ki, xs);
                }
                Targets::Many(_) => {}
            }
        }
    }
    Some(o)
}

fn latency_path() -> PathBuf {
    if let Ok(a) = env::var("APPDATA") {
        return PathBuf::from(a).join("Lefty").join("latency_stats.json");
    }
    PathBuf::from("latency_stats.json")
}

fn parent_pid_from_args() -> Option<u32> {
    let args: Vec<String> = env::args().collect();
    for i in 0..args.len() {
        if args[i] == "--parent-pid" && i + 1 < args.len() {
            if let Ok(pid) = args[i + 1].parse::<u32>() {
                return Some(pid);
            }
        }
    }
    None
}

fn check_engine_single_instance() -> bool {
    unsafe {
        use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
        use windows::Win32::System::Threading::CreateMutexW;
        use windows::core::PCWSTR;
        // Si ya hay un engine vivo (lee los mismos %APPDATA%\Lefty\*.txt), ceder en
        // silencio. NUNCA taskkill por nombre de imagen: mataría a este mismo
        // proceso (suicidio) y dejaría cero engines en pie.
        let name: Vec<u16> = "Global\\LeftyEngineSingleton\0".encode_utf16().collect();
        let mutex = match CreateMutexW(None, true, PCWSTR(name.as_ptr())) {
            Ok(h) => h,
            Err(_) => return true, // sin mutex mejor intentarlo que no arrancar
        };
        if GetLastError() == ERROR_ALREADY_EXISTS {
            let _ = CloseHandle(mutex);
            return false;
        }
        std::mem::forget(Box::new(mutex));
        true
    }
}

fn main() {
    if !check_engine_single_instance() {
        std::process::exit(0);
    }
    let _ = state::global_state();
    let f6_path = if let Ok(a) = env::var("APPDATA") { PathBuf::from(a).join("Lefty").join("f6_toggle.txt") } else { PathBuf::from("f6_toggle.txt") };
    if let Ok(s) = fs::read_to_string(&f6_path) {
        ENABLED.store(s.trim() == "1", Ordering::Relaxed);
    } else {
        ENABLED.store(false, Ordering::Relaxed);
    }
    let f6_path2 = f6_path.clone();
    std::thread::spawn(move ||{
        let mut last = fs::read_to_string(&f6_path2).unwrap_or("0".to_string());
        loop{
            std::thread::sleep(Duration::from_millis(50));
            if let Ok(s) = fs::read_to_string(&f6_path2) {
                if s.trim() != last.trim() {
                    last = s.clone();
                    ENABLED.store(s.trim() == "1", Ordering::Relaxed);
                }
            }
            if !RUNNING.load(Ordering::Relaxed){ break; }
        }
    });
    let mp = mappings_path();
    if mp.exists() {
        if let Some(m) = load(&mp) {
            set_mappings(m);
        }
    }
    unsafe {
        let _ = SetPriorityClass(GetCurrentProcess(), HIGH_PRIORITY_CLASS);
        let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
        // QPC para la telemetría de latencia.
        let mut f: i64 = 0;
        let _ = windows::Win32::System::Performance::QueryPerformanceFrequency(&mut f);
        LAT_QPF.store(f as u64, Ordering::Relaxed);
        // Resolución del timer del sistema a 1ms: wakeups consistentes del pump.
        windows::Win32::Media::timeBeginPeriod(1);
        // Opt-out de power throttling: Windows no aparca el engine en ahorro.
        {
            use windows::Win32::System::Threading::{PROCESS_POWER_THROTTLING_CURRENT_VERSION, PROCESS_POWER_THROTTLING_EXECUTION_SPEED, PROCESS_POWER_THROTTLING_STATE, ProcessPowerThrottling, SetProcessInformation};
            let mut st = PROCESS_POWER_THROTTLING_STATE {
                Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
                ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
                StateMask: 0,
            };
            let _ = SetProcessInformation(
                GetCurrentProcess(),
                ProcessPowerThrottling,
                &mut st as *mut _ as *mut std::ffi::c_void,
                std::mem::size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32,
            );
        }
    }
    // Vuelca avg/max/eventos del último segundo para la UI (About → latencia).
    std::thread::spawn(|| {
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            let n = LAT_N.swap(0, Ordering::Relaxed);
            let sum = LAT_SUM_US.swap(0, Ordering::Relaxed);
            let max = LAT_MAX_US.swap(0, Ordering::Relaxed);
            let avg = if n > 0 { sum / n } else { 0 };
            let ts = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
            let _ = fs::write(latency_path(), format!("{{\"avg_us\":{avg},\"max_us\":{max},\"events\":{n},\"ts_ms\":{ts}}}"));
            if !RUNNING.load(Ordering::Relaxed) {
                break;
            }
        }
    });

    let hook = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook), HINSTANCE(std::ptr::null_mut()), 0) }
        .unwrap();
    unsafe {
        G_HOOK = hook;
        G_HOOK_COPY = hook;
        G_MOUSE_HOOK = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), HINSTANCE(std::ptr::null_mut()), 0).unwrap_or(HHOOK(std::ptr::null_mut()));
    }

    let mp2 = mp.clone();
    std::thread::spawn(move ||{
        let mut last=fs::metadata(&mp2).and_then(|m| m.modified()).ok();
        loop{
            std::thread::sleep(Duration::from_millis(100));
            if let Ok(md)=fs::metadata(&mp2){
                if let Ok(mt)=md.modified(){
                    if Some(mt)!=last{
                        last=Some(mt);
                        if let Some(m)=load(&mp2){ set_mappings(m); }
                    }
                }
            }
            if !RUNNING.load(Ordering::Relaxed){ break; }
        }
    });
    let hotkey_path = if let Ok(a) = env::var("APPDATA") { PathBuf::from(a).join("Lefty").join("hotkey.txt") } else { PathBuf::from("hotkey.txt") };
    fn hotkey_str_to_vk(s: &str) -> Option<u32> {
        let n = s.trim().to_uppercase();
        let vk = match n.as_str() {
            "A"=>0x41, "B"=>0x42, "C"=>0x43, "D"=>0x44, "E"=>0x45, "F"=>0x46, "G"=>0x47, "H"=>0x48, "I"=>0x49, "J"=>0x4A, "K"=>0x4B, "L"=>0x4C, "M"=>0x4D, "N"=>0x4E, "O"=>0x4F, "P"=>0x50, "Q"=>0x51, "R"=>0x52, "S"=>0x53, "T"=>0x54, "U"=>0x55, "V"=>0x56, "W"=>0x57, "X"=>0x58, "Y"=>0x59, "Z"=>0x5A,
            "0"=>0x30, "1"=>0x31, "2"=>0x32, "3"=>0x33, "4"=>0x34, "5"=>0x35, "6"=>0x36, "7"=>0x37, "8"=>0x38, "9"=>0x39,
            "F1"=>0x70, "F2"=>0x71, "F3"=>0x72, "F4"=>0x73, "F5"=>0x74, "F6"=>0x75, "F7"=>0x76, "F8"=>0x77, "F9"=>0x78, "F10"=>0x79, "F11"=>0x7A, "F12"=>0x7B, "F13"=>0x7C, "F14"=>0x7D, "F15"=>0x7E, "F16"=>0x7F, "F17"=>0x80, "F18"=>0x81, "F19"=>0x82, "F20"=>0x83,
            "ESC"=>0x1B, "SPACE"=>0x20, "ENTER"=>0x0D, "TAB"=>0x09, "BACKSPACE"=>0x08, "CAPSLOCK"=>0x14, "CAPS"=>0x14,
            "SHIFT"=>0x10, "LSHIFT"=>0xA0, "RSHIFT"=>0xA1, "CTRL"=>0x11, "LCTRL"=>0xA2, "RCTRL"=>0xA3, "ALT"=>0x12, "LALT"=>0xA4, "RALT"=>0xA5, "LWIN"=>0x5B, "RWIN"=>0x5C,
            "UP"=>0x26, "DOWN"=>0x28, "LEFT"=>0x25, "RIGHT"=>0x27, "INSERT"=>0x2D, "DELETE"=>0x2E, "HOME"=>0x24, "END"=>0x23, "PAGEUP"=>0x21, "PAGEDOWN"=>0x22, "NUMLOCK"=>0x90, "SCROLLLOCK"=>0x91, "PRINTSCREEN"=>0x2C, "PAUSE"=>0x13,
            "OEM_1"=>0xBA, "OEM_PLUS"=>0xBB, "OEM_COMMA"=>0xBC, "OEM_MINUS"=>0xBD, "OEM_PERIOD"=>0xBE, "OEM_2"=>0xBF, "OEM_3"=>0xC0, "OEM_4"=>0xDB, "OEM_5"=>0xDC, "OEM_6"=>0xDD, "OEM_7"=>0xDE, "OEM_8"=>0xDF, "OEM_102"=>0xE2,
            "Ñ"=>0xBA, "´"=>0xDB, "Ç"=>0xDE, "¨"=>0xDB,
            _ => {
                if n.starts_with("0X") {
                    if let Ok(v) = u32::from_str_radix(n.trim_start_matches("0X"), 16) { return Some(v); }
                }
                if let Ok(v) = n.parse::<u32>() { return Some(v); }
                if n.starts_with("VK_") {
                    let rest = n.trim_start_matches("VK_");
                    if let Ok(v) = u32::from_str_radix(rest, 16) { return Some(v); }
                    if let Ok(v) = rest.parse::<u32>() { return Some(v); }
                }
                return None;
            }
        };
        Some(vk)
    }
    if let Ok(s) = fs::read_to_string(&hotkey_path) {
        if let Some(vk) = hotkey_str_to_vk(&s) {
            HOTKEY_VK.store(vk, Ordering::Relaxed);
        }
    }
    let hotkey_path2 = hotkey_path.clone();
    std::thread::spawn(move ||{
        let mut last_hotkey = fs::read_to_string(&hotkey_path2).unwrap_or("F6".to_string());
        loop{
            std::thread::sleep(Duration::from_millis(200));
            if let Ok(s) = fs::read_to_string(&hotkey_path2) {
                let n = s.trim().to_uppercase();
                if n != last_hotkey.trim().to_uppercase() {
                    last_hotkey = s.clone();
                    if let Some(v) = hotkey_str_to_vk(&n) {
                        HOTKEY_VK.store(v, Ordering::Relaxed);
                    }
                }
            }
            if !RUNNING.load(Ordering::Relaxed){ break; }
        }
    });

    // Tid del hilo principal: el watcher debe postear WM_QUIT AQUÍ (GetMessageW vive
    // en este hilo; postear al tid del watcher —como antes— no despierta a nadie).
    let main_tid = unsafe { windows::Win32::System::Threading::GetCurrentThreadId() };

    if let Some(pid) = parent_pid_from_args() {
        std::thread::spawn(move || {
            use windows::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
            use windows::Win32::System::Threading::{OpenProcess, GetExitCodeProcess, PROCESS_QUERY_INFORMATION, PROCESS_SYNCHRONIZE};
            use windows::Win32::UI::WindowsAndMessaging::PostThreadMessageW;
            use windows::Win32::Foundation::{WPARAM, LPARAM};
            loop {
                std::thread::sleep(std::time::Duration::from_millis(500));
                let parent_dead = unsafe {
                    match OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_SYNCHRONIZE, false, pid) {
                        Ok(handle) => {
                            let mut exit_code: u32 = 0;
                            let _ = GetExitCodeProcess(handle, &mut exit_code);
                            let _ = CloseHandle(handle);
                            exit_code != STILL_ACTIVE.0 as u32
                        }
                        Err(_) => true, // PID inexistente: el padre murió
                    }
                };
                if !RUNNING.load(Ordering::Relaxed) {
                    break;
                }
                if parent_dead {
                    RUNNING.store(false, Ordering::Relaxed);
                    break;
                }
            }
            // Despertar SÍ o SÍ el message loop principal (reintentar: el primer post
            // puede fallar si la cola aún no existe). Sin esto el proceso queda zombi
            // en GetMessageW con mutex+hook ocupados para siempre.
            unsafe {
                for _ in 0..50 {
                    if MAIN_DONE.load(Ordering::Relaxed) {
                        break;
                    }
                    let _ = PostThreadMessageW(main_tid, 0x0012, WPARAM(0), LPARAM(0)); // WM_QUIT
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            }
        });
    }

    let mut msg = MSG::default();
    unsafe {
        while RUNNING.load(Ordering::Relaxed) {
            let r = GetMessageW(&mut msg, HWND(std::ptr::null_mut()), 0, 0);
            if r.0 == 0 || r.0 == -1 {
                break;
            }
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        MAIN_DONE.store(true, Ordering::Relaxed);
        windows::Win32::Media::timeEndPeriod(1);
        let _ = UnhookWindowsHookEx(G_HOOK);
        let _ = UnhookWindowsHookEx(G_MOUSE_HOOK);
    }
}
