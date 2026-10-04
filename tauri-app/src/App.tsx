import { useState, useEffect, useRef } from "react";
import { Keyboard, Plus, Trash2, ArrowLeftRight, Activity, Settings, Mouse, Power, EyeOff, KeyboardOff, Info, Lightbulb, Shield, TriangleAlert, SlidersHorizontal, Palette, FileJson, Volume2, VolumeX, Minimize2, Play, Gauge } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import laskIcon from "./LASK.png";
import ProfileImportExport from "./components/ProfileImportExport";
import AccentColorSection from "./components/AccentColorSection";
import { useMappingValidation } from "./lib/useMappingValidation";
import { isSoundEnabled, setSoundEnabled, playToggleSound, unlockAudio } from "./lib/toggleSound";

type Mapping = [string, string];
type Profile = { display_name: string; description: string; icon: string; mappings: Mapping[] };

const FALLBACK_ALL_KEYS = [
  // Letters A-Z
  "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
  // Numbers top row 1→0
  "1","2","3","4","5","6","7","8","9","0",
  // Function F1→F12 in numeric order (F13-F24 ocultos, no existen en teclados normales)
  "F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12",
  // Specials
  "ESC","TAB","CAPSLOCK","SHIFT","LSHIFT","RSHIFT","CTRL","LCTRL","RCTRL","ALT","LALT","RALT","LWIN","RWIN","SPACE","ENTER","BACKSPACE",
  // Navigation
  "UP","DOWN","LEFT","RIGHT","INSERT","DELETE","HOME","END","PAGEUP","PAGEDOWN","NUMLOCK","SCROLLLOCK","PRINTSCREEN","PAUSE",
  // OEM LATAM physical order
  "`","°","'","?","¡","¿","=","´","¨","[","{","+","*","]","}","Ñ",";",":","Ç","ç","\"",",",".","-","_","/","\\","|","¬",">","<",
  // Numpad 0→9
  "NUM0","NUM1","NUM2","NUM3","NUM4","NUM5","NUM6","NUM7","NUM8","NUM9","NUM*","NUM+","NUM-","NUM.","NUM/","NUMENTER",
  // Media / Browser
  "VOLUME_MUTE","VOLUME_DOWN","VOLUME_UP","MEDIA_NEXT","MEDIA_PREV","MEDIA_STOP","MEDIA_PLAY","LAUNCH_MAIL","LAUNCH_MEDIA","BROWSER_BACK","BROWSER_FORWARD","BROWSER_REFRESH","BROWSER_STOP","BROWSER_SEARCH","BROWSER_FAVORITES","BROWSER_HOME","SLEEP","DISABLED"
];

const BUILTIN: Record<string, Profile> = {
  sycho: {
    display_name: "Sycho — OÑLK",
    description: "WASD → IJKL · O=W forward, K=A left, L=S back, Ñ=D right. Mirrored right side.",
    icon: "◆",
    mappings: [["O","W"],["K","A"],["L","S"],["Ñ","D"],["I","E"],["P","Q"],["U","R"],["Y","T"],["J","F"],["H","G"],["M","C"],["N","V"],[",","X"],[".","Z"],["RSHIFT","LSHIFT"],["RCTRL","LCTRL"],["RALT","LALT"]],
  },
  zurdo_ijkl: {
    display_name: "Left-handed IJKL",
    description: "WASD → IJKL · I=forward, J=left, K=back, L=right",
    icon: "◇",
    mappings: [["W","I"],["A","J"],["S","K"],["D","L"],["Q","U"],["E","O"],["R","P"],["F","M"],["C","N"]],
  },
  zurdo_flechas: {
    display_name: "Arrow Keys",
    description: "WASD → Arrow Keys — Classic",
    icon: "→",
    mappings: [["W","UP"],["A","LEFT"],["S","DOWN"],["D","RIGHT"]],
  },
  custom: { display_name: "Custom", description: "Build your own layout", icon: "✦", mappings: [] },
};

type SettingsTabId = "general" | "appearance" | "input" | "profiles" | "about";

const SETTINGS_TABS: readonly { id: SettingsTabId; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "input", label: "Input", icon: Keyboard },
  { id: "profiles", label: "Profiles", icon: FileJson },
  { id: "about", label: "About", icon: Info },
];

export default function App() {
  const [active, setActive] = useState("sycho");
  const [profiles, setProfiles] = useState<Record<string, Profile>>(BUILTIN);
  const [enabled, setEnabled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [invertMouse, setInvertMouse] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [closingAdd, setClosingAdd] = useState(false);
  const [closingSettings, setClosingSettings] = useState(false);
  const [closingDelete, setClosingDelete] = useState(false);
  const [srcKey, setSrcKey] = useState("W");
  const [dstKey, setDstKey] = useState("I");
  const [capturing, setCapturing] = useState<null | "src" | "dst">(null);
  const [allKeys, setAllKeys] = useState<string[]>(FALLBACK_ALL_KEYS);
  const [autostart, setAutostart] = useState(false);
  const [hideToTray, setHideToTray] = useState(true);
  const [startMinimized, setStartMinimized] = useState(false);
  const [startActive, setStartActive] = useState<boolean>(() => {
    try { return localStorage.getItem("lefty_start_active") === "true"; } catch { return false; }
  });
  const [hotkey, setHotkey] = useState("F6");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>("general");
  const [soundsOn, setSoundsOn] = useState<boolean>(() => isSoundEnabled());

  // Desbloquear WebAudio con el primer gesto (autoplay policy del WebView)
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Chime al cambiar ACTIVE/INACTIVE (botón o hotkey); sin sonido en el sync inicial
  const firstEnabledSync = useRef(true);
  // El arranque (fichero + spawn del engine) se ejecuta UNA sola vez por
  // sesión: los re-runs del efecto por profiles/active solo reponen el poll.
  const launchedRef = useRef(false);
  // Telemetría de latencia del engine (About).
  const [latStats, setLatStats] = useState<{ avg_us: number; max_us: number; events: number; ts_ms: number } | null>(null);
  useEffect(() => {
    if (firstEnabledSync.current) {
      firstEnabledSync.current = false;
      return;
    }
    playToggleSound(enabled);
  }, [enabled]);

  // Latencia del engine: poll 1s solo con Settings abierto en About.
  useEffect(() => {
    if (!showSettings || settingsTab !== "about") return;
    let stop = false;
    const poll = () => {
      invoke<{ avg_us: number; max_us: number; events: number; ts_ms: number }>("get_latency_stats")
        .then((v) => { if (!stop) setLatStats(v); })
        .catch(() => { if (!stop) setLatStats(null); });
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => { stop = true; clearInterval(id); };
  }, [showSettings, settingsTab]);

  const closeAdd = () => {
    setClosingAdd(true);
    setTimeout(() => { setShowAdd(false); setClosingAdd(false); }, 380);
  };
  const closeSettings = () => {
    setClosingSettings(true);
    setTimeout(() => { setShowSettings(false); setClosingSettings(false); }, 380);
  };
  const closeDelete = () => {
    setClosingDelete(true);
    setTimeout(() => { setConfirmDelete(null); setClosingDelete(false); }, 320);
  };

  useEffect(() => {
    invoke<boolean>("is_admin").then(setIsAdmin).catch(()=>{});
    invoke<[number, string][]>("get_key_name_list").then(list => {
      if (Array.isArray(list) && list.length > 10) {
        let names = list.map(([, name]) => name).filter(n => n && n !== "Undefined");
        // Filtrar teclas raras que no existen en teclados normales (F13-F24, Execute, etc.)
        const hide = new Set(["F13","F14","F15","F16","F17","F18","F19","F20","F21","F22","F23","F24","Execute","Help","Select","Print","Apps","Sleep","Separator","Clear","CrSel","ExSel","Ereof","Play","Zoom","Noname","Pa1","OemClear","Attn","NoName","Hangeul","Hanja","Junja","Final","Hanja","Convert","NonConvert","Accept","ModeChange"]);
        names = names.filter(n => !hide.has(n));
        if (!names.includes("Ñ") && FALLBACK_ALL_KEYS.includes("Ñ")) names.push("Ñ");
        if (!names.includes("'") && FALLBACK_ALL_KEYS.includes("'")) names.push("'");
        if (!names.includes("´") && FALLBACK_ALL_KEYS.includes("´")) names.push("´");
        if (!names.includes("`") && FALLBACK_ALL_KEYS.includes("`")) names.push("`");
        // Ordenar según FALLBACK_ALL_KEYS (1→0, F1→F12, A-Z...) para que el dropdown salga bien ordenado
        const orderMap = new Map<string, number>(FALLBACK_ALL_KEYS.map((k, i) => [k, i]));
        names = Array.from(new Set(names)); // dedup
        names.sort((a, b) => {
          const ai = orderMap.has(a) ? orderMap.get(a)! : 10000 + a.charCodeAt(0);
          const bi = orderMap.has(b) ? orderMap.get(b)! : 10000 + b.charCodeAt(0);
          if (ai !== bi) return ai - bi;
          return a.localeCompare(b);
        });
        setAllKeys(names);
      }
    }).catch(()=>{});
    invoke<boolean>("get_autostart").then(setAutostart).catch(()=>{});
    invoke<boolean>("get_hide_to_tray").then(setHideToTray).catch(()=>{});
    invoke<boolean>("get_start_minimized").then(setStartMinimized).catch(()=>{});
    invoke<string>("get_hotkey").then(v=> v && setHotkey(v.toUpperCase())).catch(()=>{});
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lefty_profiles");
      if (saved) setProfiles(JSON.parse(saved));
      const savedActive = localStorage.getItem("lefty_active");
      if (savedActive) setActive(savedActive);
      const savedInvert = localStorage.getItem("lefty_invert");
      if (savedInvert === "true") {
        setInvertMouse(true);
        invoke("set_invert_clicks", {enabled: true}).catch(()=>{});
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("lefty_profiles", JSON.stringify(profiles)); } catch {}
  }, [profiles]);

  useEffect(() => {
    try {
      localStorage.setItem("lefty_active", active);
      localStorage.setItem("lefty_invert", String(invertMouse));
    } catch {}
  }, [active, invertMouse]);



  useEffect(() => {
    if (!capturing) return;
    let cancelled = false;
    invoke<string>("capture_key").then(key => {
      if (cancelled) return;
      if (allKeys.includes(key)) {
        if (capturing === "src") setSrcKey(key);
        else setDstKey(key);
      } else if (key.length===1) {
        const up = key.toUpperCase();
        if (allKeys.includes(up)) {
          if (capturing === "src") setSrcKey(up);
          else setDstKey(up);
        } else if (key.startsWith("VK_")) {
          if (capturing === "src") setSrcKey(key);
          else setDstKey(key);
        }
      } else if (key.includes("(") || key.includes("VK")) {
        if (capturing === "src") setSrcKey(key);
        else setDstKey(key);
      }
      setCapturing(null);
    }).catch(()=> setCapturing(null));
    return () => { cancelled = true; };
  }, [capturing, allKeys]);

  const prof = profiles[active];
  // Validación en tiempo real del modal Add contra el perfil activo
  const mappingValidation = useMappingValidation(srcKey, dstKey, prof.mappings);
  const toggle = async () => {
    // Optimista: la UI y el chime son instantáneos; f6_toggle.txt manda y el poll corrige.
    const next = !enabled;
    setEnabled(next);
    try {
      await invoke("set_engine_enabled", { enabled: next });
      if (next) {
        await invoke("update_mappings", { mappings: prof.mappings });
        await invoke("start_engine", { profile: active });
      } else {
        await invoke("stop_engine");
      }
    } catch {
      /* el poll de 100ms resincroniza desde f6_toggle.txt */
    }
  };

  // Switch segmentado del header: una sola píldora, thumb deslizante.
  // Misma función que el botón anterior (clic o Espacio/Enter).
  const renderStatusSwitch = (compact: boolean) => (
    <div
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Pause mappings" : "Activate mappings"}
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } }}
      className="flex items-center rounded-full bg-surface-container-high border border-outline-variant p-1 relative shadow-m3-1 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <span aria-hidden className={`absolute top-1 bottom-1 rounded-full bg-primary shadow-m3-1 transition-all duration-300 ease-out ${enabled ? "left-1/2 right-1" : "left-1 right-1/2"}`} />
      <span className={`relative z-10 flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors duration-300 ${compact ? "h-7 w-[86px] text-[12px]" : "h-9 w-[120px] text-[13px]"} ${!enabled ? "text-on-primary" : "text-on-surface-variant"}`}>
        <Power size={compact ? 13 : 15} /> Paused
      </span>
      <span className={`relative z-10 flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors duration-300 ${compact ? "h-7 w-[86px] text-[12px]" : "h-9 w-[120px] text-[13px]"} ${enabled ? "text-on-primary" : "text-on-surface-variant"}`}>
        <span className={`rounded-full ${compact ? "w-1.5 h-1.5" : "w-2.5 h-2.5"} ${enabled ? "bg-on-primary animate-pulse" : "bg-current opacity-60"}`} />
        Active
      </span>
    </div>
  );

  const syncEngine = (mappings: Mapping[]) => {
    invoke("update_mappings", { mappings }).catch(()=>{});
  };

  useEffect(() => {
    syncEngine(profiles[active].mappings);
  }, [active]);

  // Auto-start: apply the launch preference, then load profiles and start engine
  useEffect(() => {
    const t = setTimeout(() => {
      if (launchedRef.current) return;
      launchedRef.current = true;
      let startActive = false;
      try { startActive = localStorage.getItem("lefty_start_active") === "true"; } catch {}
      setEnabled(startActive);
      const launch = () => {
        try {
          const saved = localStorage.getItem("lefty_profiles");
          const savedActive = localStorage.getItem("lefty_active");
          let curProfiles = profiles;
          let curActive = active;
          if (saved) {
            try { curProfiles = JSON.parse(saved); } catch {}
          }
          if (savedActive) curActive = savedActive;
          const m = curProfiles[curActive]?.mappings || profiles[active]?.mappings || [];
          invoke("update_mappings", {mappings: m}).then(()=> invoke("start_engine", {profile: curActive}).catch(()=>{})).catch(()=>{});
        } catch {
          invoke("update_mappings", {mappings: profiles[active].mappings}).then(()=> invoke("start_engine", {profile: active}).catch(()=>{})).catch(()=>{});
        }
      };
      invoke("set_engine_enabled", { enabled: startActive }).then(launch).catch(launch);
    }, 400);
    const id = setInterval(async () => {
      try {
        const state = await invoke<boolean>("get_engine_enabled");
        setEnabled(prev => prev !== state ? state : prev);
      } catch {}
    }, 100);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [profiles, active]);

  useEffect(() => {
    return () => {
      invoke("set_invert_clicks", {enabled: false}).catch(()=>{});
      invoke("stop_engine").catch(()=>{});
    };
  }, []);

  const addMap = () => {
    // Bloqueado por validación: duplicado o self-map (el botón ya viene disabled)
    if (!mappingValidation.canSave) return;
    const next = { ...profiles };
    const cur = next[active];
    const newMappings = [...cur.mappings, [srcKey, dstKey] as Mapping];
    cur.mappings = newMappings;
    next[active] = { ...cur };
    setProfiles(next);
    syncEngine(newMappings);
    closeAdd();
  };

  const swapMap = (s: string, d: string) => {
    const next = { ...profiles };
    const cur = next[active];
    let newMappings = cur.mappings.filter(([src]) => src !== s);
    if (!newMappings.some(([src]) => src === d)) {
      newMappings = [...newMappings, [d, s] as Mapping];
    }
    cur.mappings = newMappings;
    next[active] = { ...cur };
    setProfiles(next);
    syncEngine(newMappings);
  };

  const delMap = (src: string) => {
    const next = { ...profiles };
    const newMappings = next[active].mappings.filter(([s]) => s !== src);
    next[active] = { ...next[active], mappings: newMappings };
    setProfiles(next);
    syncEngine(newMappings);
  };

  return (
    <div className="h-screen bg-surface-dim text-on-surface flex flex-col overflow-hidden selection:bg-primary/20 relative font-sans antialiased">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-tertiary/5 pointer-events-none" />
      <header className="px-5 pt-4 sticky top-0 z-10">
        <div className="h-[72px] bg-surface-container border border-outline-variant rounded-[20px] flex items-center justify-between px-5 shadow-m3-1">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary-container grid place-items-center shadow-m3-1 overflow-hidden border border-outline-variant">
            <img src={laskIcon} alt="Lefty" className="w-full h-full object-cover" />
          </div>
          <div className="leading-none">
            <div className="flex items-baseline gap-2">
              <h1 className="text-[18px] font-display font-semibold tracking-tight text-on-surface">Lefty</h1>
              <span className="text-[10px] font-medium tracking-widest text-on-surface-variant border border-outline-variant px-1.5 py-0.5 rounded-full">v2</span>
            </div>
            <p className="text-[11px] font-medium tracking-wide text-on-surface-variant mt-[2px]">By Sycho <span className="text-outline">·</span> Left-handed</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">{renderStatusSwitch(false)}</div>
          <div className="sm:hidden">{renderStatusSwitch(true)}</div>
          <button onClick={()=> { setSettingsTab("general"); setShowSettings(true); }} aria-label="Settings" className="w-11 h-11 rounded-full bg-surface-container-high border border-outline-variant hover:bg-surface-container-highest grid place-items-center text-on-surface-variant hover:text-on-surface m3-pressable active:scale-90 transition-transform duration-150 hover:rotate-90">
            <Settings size={18} />
          </button>
        </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-5 p-5 max-w-[1440px] w-full mx-auto overflow-hidden">
        <aside className="col-span-12 lg:col-span-3 bg-surface-container rounded-[28px] border border-outline-variant flex flex-col overflow-hidden min-h-0 shadow-m3-1">
          <div className="px-4 pt-4 pb-3 border-b border-outline-variant">
            <h2 className="text-[11px] font-display font-medium tracking-widest text-on-surface">PROFILES</h2>
            <p className="text-[11px] text-on-surface-variant mt-1">Choose your left-handed layout</p>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-2.5 pb-3 space-y-1.5">
            {Object.entries(profiles).map(([key, p]) => (
              <button key={key} onClick={() => setActive(key)} className={`w-full text-left p-3 rounded-xl border flex items-center gap-3 ${active===key ? "bg-primary text-on-primary border-primary shadow-m3-1" : "bg-surface-container-high border-outline-variant hover:bg-surface-container-highest text-on-surface"}`}>
                <span className={`w-8 h-8 grid place-items-center rounded-lg text-[13px] font-medium flex-shrink-0 ${active===key ? "bg-on-primary text-primary" : "bg-secondary-container text-on-secondary-container"}`}>{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-medium leading-none truncate ${active===key ? "text-on-primary" : "text-on-surface"}`}>{p.display_name}</div>
                  <div className={`text-[11px] mt-1 truncate ${active===key ? "text-on-primary/80" : "text-on-surface-variant"}`}>{p.mappings.length} mappings · {p.description.split("·")[0]?.trim() || p.description.slice(0,22)}</div>
                </div>
                {active===key && <div className="w-1.5 h-1.5 rounded-full bg-on-primary flex-shrink-0" />}
              </button>
            ))}
          </div>
        </aside>

        <main className="col-span-12 lg:col-span-9 bg-surface-container rounded-[28px] border border-outline-variant flex flex-col overflow-hidden min-h-0 shadow-m3-1">
          <div className="px-6 py-5 border-b border-outline-variant">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[17px] font-display font-semibold tracking-tight text-on-surface flex items-center gap-2"><Keyboard size={16} className="text-on-surface-variant"/> {prof.display_name}</h2>
                <p className="text-[13px] text-on-surface-variant mt-1.5 leading-relaxed max-w-[560px]">{prof.description}</p>
              </div>
              <button onClick={()=>setShowAdd(true)} className="hidden sm:inline-flex h-9 px-5 rounded-full bg-primary text-on-primary text-[13px] font-medium items-center gap-1.5 hover:opacity-90 transition-all duration-150 m3-pressable active:scale-[0.96] hover:scale-[1.02]"><Plus size={15}/> Add</button>
            </div>
          </div>
          <div className="px-6 py-3 flex items-center justify-between text-[11px] font-medium tracking-widest text-on-surface-variant border-b border-outline-variant bg-surface-container-high">
            <span>{prof.mappings.length} MAPPINGS</span><span className="font-normal tracking-wide text-outline">SOURCE → TARGET</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-4 space-y-2 bg-surface-container">
            {prof.mappings.length===0 ? (
              <div className="py-20 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-surface-container-high border border-outline-variant grid place-items-center text-outline"><Keyboard size={22}/></div>
                <p className="text-[15px] font-medium text-on-surface mt-4">No mappings</p>
                <p className="text-[13px] text-on-surface-variant mt-1">Add your first remap to start</p>
                <button onClick={()=>setShowAdd(true)} className="mt-5 h-10 px-5 rounded-full bg-primary text-on-primary text-[13px] font-medium m3-pressable active:scale-[0.96] transition-transform duration-150">Add mapping</button>
              </div>
            ) : prof.mappings.map(([s,d])=>(
              <div key={s} className="h-[58px] bg-surface-container-high border border-outline-variant rounded-2xl flex items-center px-4 gap-3">
                <span className="px-4 py-1.5 rounded-full bg-surface-container-highest border border-outline-variant text-[13px] font-mono font-medium min-w-[76px] text-center text-on-surface">{s}</span>
                <span className="w-8 h-8 rounded-full bg-primary text-on-primary grid place-items-center text-[14px] font-medium shadow-m3-1">→</span>
                <span className="px-4 py-1.5 rounded-full bg-primary-container text-on-primary-container text-[13px] font-mono font-medium min-w-[76px] text-center border border-outline-variant">{d}</span>
                <span className="hidden sm:block text-[12px] text-on-surface-variant ml-1">remap</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button onClick={()=>swapMap(s,d)} title="Swap" className="w-9 h-9 grid place-items-center rounded-full bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:bg-secondary-container hover:text-on-secondary-container"><ArrowLeftRight size={14}/></button>
                  <button onClick={()=> setConfirmDelete(s)} title="Delete" className="w-9 h-9 grid place-items-center rounded-full bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:bg-primary hover:text-on-primary hover:border-primary transition-colors"><Trash2 size={14}/></button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 bg-surface-container-high border-t border-outline-variant flex items-center justify-end sm:hidden">
            <button onClick={()=>setShowAdd(true)} className="h-8 px-4 rounded-full bg-primary text-on-primary text-[12px] font-medium flex items-center gap-1.5"><Plus size={14}/>Add</button>
          </div>
        </main>
      </div>
      {(showAdd || closingAdd) && (
        <div className={`fixed inset-0 bg-scrim/60 backdrop-blur-sm grid place-items-center z-50 p-4 m3-backdrop ${closingAdd ? "animate-m3-backdrop-out" : "animate-m3-backdrop-in"}`} onClick={closeAdd}>
          <div className={`w-full max-w-[540px] bg-surface-container rounded-[28px] border border-outline-variant p-6 shadow-m3-3 m3-modal ${closingAdd ? "animate-m3-slide-down" : "animate-m3-slide-up"}`} onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-[14px] bg-primary text-on-primary grid place-items-center shadow-m3-1 shrink-0"><Plus size={18}/></span>
              <div>
                <h3 className="text-[16px] font-display font-semibold text-on-surface leading-none">Add mapping</h3>
                <p className="text-[11px] text-on-surface-variant mt-1.5">Pick the key you press and what it should type</p>
              </div>
            </div>
            {capturing && <p className="mt-4 text-[12px] font-medium text-on-tertiary-container bg-tertiary-container border border-outline-variant rounded-full px-3 py-2 text-center animate-pulse">Capturing… press any key ({capturing === "src" ? "source" : "target"})</p>}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 mt-5 items-stretch">
              <div className={`rounded-2xl border p-3.5 flex flex-col gap-2.5 transition-colors duration-200 ${capturing === "src" ? "bg-surface-container-high border-primary shadow-m3-1" : "bg-surface-container-high border-outline-variant"}`}>
                <span className="text-[10px] font-medium tracking-widest text-on-surface-variant">SOURCE · YOU PRESS</span>
                <div className={`h-16 rounded-xl border grid place-items-center font-mono font-medium px-2 text-center truncate transition-colors ${capturing === "src" ? "bg-primary-container text-on-primary-container border-primary" : "bg-surface-container-highest border-outline-variant text-on-surface"} ${srcKey.length > 6 ? "text-[13px]" : "text-[22px]"}`}>{capturing === "src" ? "?" : srcKey}</div>
                <select value={srcKey} onChange={e=>setSrcKey(e.target.value)} aria-label="Source key" aria-invalid={!mappingValidation.canSave} className={`w-full h-10 rounded-xl bg-surface-container-highest border text-[12px] font-mono px-3 text-on-surface focus:outline-none transition-colors duration-200 ${!mappingValidation.canSave ? "border-error/70 focus:border-error" : "border-outline-variant focus:border-primary"}`}>
                  {allKeys.map(k=><option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={()=>setCapturing("src")} className={`w-full h-10 rounded-xl text-[12px] font-medium border flex items-center justify-center gap-1.5 transition-colors ${capturing==="src" ? "bg-primary text-on-primary border-primary" : "bg-surface-container-highest border-outline-variant text-on-surface hover:border-primary"}`}><Keyboard size={13}/>Capture</button>
              </div>
              <div className="flex items-center">
                <span className="w-9 h-9 rounded-full bg-primary text-on-primary grid place-items-center text-[15px] font-medium shadow-m3-1">→</span>
              </div>
              <div className={`rounded-2xl border p-3.5 flex flex-col gap-2.5 transition-colors duration-200 ${capturing === "dst" ? "bg-surface-container-high border-primary shadow-m3-1" : "bg-surface-container-high border-outline-variant"}`}>
                <span className="text-[10px] font-medium tracking-widest text-on-surface-variant">TARGET · IT TYPES</span>
                <div className={`h-16 rounded-xl border grid place-items-center font-mono font-medium px-2 text-center truncate transition-colors ${capturing === "dst" ? "bg-primary-container text-on-primary-container border-primary" : "bg-surface-container-highest border-outline-variant text-on-surface"} ${dstKey.length > 6 ? "text-[13px]" : "text-[22px]"}`}>{capturing === "dst" ? "?" : dstKey}</div>
                <select value={dstKey} onChange={e=>setDstKey(e.target.value)} aria-label="Target key" aria-invalid={mappingValidation.conflict.kind === "self"} className={`w-full h-10 rounded-xl bg-surface-container-highest border text-[12px] font-mono px-3 text-on-surface focus:outline-none transition-colors duration-200 ${mappingValidation.conflict.kind === "self" ? "border-error/70 focus:border-error" : "border-outline-variant focus:border-primary"}`}>
                  {allKeys.map(k=><option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={()=>setCapturing("dst")} className={`w-full h-10 rounded-xl text-[12px] font-medium border flex items-center justify-center gap-1.5 transition-colors ${capturing==="dst" ? "bg-primary text-on-primary border-primary" : "bg-surface-container-highest border-outline-variant text-on-surface hover:border-primary"}`}><Keyboard size={13}/>Capture</button>
              </div>
            </div>
            <div aria-live="polite" className="min-h-[30px] mt-4">
              {mappingValidation.message && (
                <p className="text-[11px] font-medium text-on-error-container bg-error-container/40 border border-error/40 rounded-xl px-3 py-2 flex items-center gap-2 animate-m3-fade-in">
                  <TriangleAlert size={13} className="flex-shrink-0" />
                  {mappingValidation.message}
                </p>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={closeAdd} className="flex-1 h-12 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-container-high text-[14px] font-medium shadow-sm m3-pressable active:scale-[0.97]">Cancel</button>
              <button onClick={addMap} disabled={!mappingValidation.canSave} className="flex-1 h-12 rounded-full bg-primary text-on-primary text-[14px] font-medium shadow-m3-1 hover:shadow-m3-2 active:scale-[0.97] m3-pressable transition-all duration-150 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:scale-100">Save mapping</button>
            </div>
          </div>
        </div>
      )}
      {(confirmDelete || closingDelete) && (
        <div className={`fixed inset-0 bg-scrim/70 backdrop-blur-sm grid place-items-center z-[60] p-4 m3-backdrop ${closingDelete ? "animate-m3-backdrop-out" : "animate-m3-backdrop-in"}`} onClick={closeDelete}>
          <div className={`w-full max-w-[460px] bg-surface-container rounded-[28px] border border-outline-variant shadow-m3-3 p-7 m3-modal ${closingDelete ? "animate-m3-scale-out" : "animate-m3-scale-in"}`} onClick={e=>e.stopPropagation()}>
            <div className="flex items-start gap-4">
              <span className="w-12 h-12 rounded-2xl bg-primary text-on-primary grid place-items-center flex-shrink-0 shadow-m3-1 animate-m3-shake"><Trash2 size={22}/></span>
              <div className="flex-1">
                <h3 className="text-[17px] font-display font-medium text-on-surface leading-snug">Are you sure to delete this keymap?</h3>
                <p className="text-[13px] leading-relaxed text-on-surface-variant mt-2">This will permanently delete <span className="font-mono bg-surface-container-highest border border-outline-variant px-1.5 py-0.5 rounded-full text-on-surface">{confirmDelete} → {profiles[active].mappings.find(([s])=> s===confirmDelete)?.[1] || ""}</span> from <span className="font-medium text-on-surface">{prof.display_name}</span>. This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={closeDelete} className="flex-1 h-12 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-container-high text-[14px] font-medium m3-pressable active:scale-[0.97]">Cancel</button>
              <button onClick={()=> { if(confirmDelete) delMap(confirmDelete); closeDelete(); }} className="flex-1 h-12 rounded-full bg-primary text-on-primary text-[14px] font-medium shadow-m3-1 hover:shadow-m3-2 active:scale-[0.97] m3-pressable transition-all duration-150 hover:scale-[1.01]">Delete</button>
            </div>
          </div>
        </div>
      )}
      {(showSettings || closingSettings) && (
        <div className={`fixed inset-0 bg-scrim/60 backdrop-blur-sm grid place-items-center z-50 p-4 m3-backdrop ${closingSettings ? "animate-m3-backdrop-out" : "animate-m3-backdrop-in"}`} onClick={closeSettings}>
          <div className={`w-full max-w-[860px] max-h-[90vh] bg-surface-container rounded-[28px] border border-outline-variant shadow-m3-3 flex flex-col overflow-hidden m3-modal ${closingSettings ? "animate-m3-slide-down" : "animate-m3-slide-up"}`} onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-outline-variant bg-surface-container-high flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-[12px] bg-primary text-on-primary grid place-items-center"><Settings size={18}/></span>
                <div>
                  <h3 className="text-[18px] font-display font-medium text-on-surface leading-none">Settings</h3>
                </div>
              </div>
              <button onClick={closeSettings} className="w-9 h-9 rounded-full bg-surface-container-highest border border-outline-variant hover:bg-primary hover:border-primary hover:text-on-primary grid place-items-center text-on-surface-variant transition-colors m3-pressable active:scale-90">✕</button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col sm:flex-row overflow-hidden">
              <nav className="sm:w-[188px] shrink-0 border-b sm:border-b-0 sm:border-r border-outline-variant bg-surface-container-high p-2.5 flex sm:flex-col flex-row gap-1.5 overflow-x-auto" aria-label="Settings sections">
                {SETTINGS_TABS.map((t) => {
                  const selected = settingsTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSettingsTab(t.id)}
                      aria-current={selected}
                      className={`flex items-center gap-2.5 h-10 px-3 rounded-xl border text-[12px] font-medium whitespace-nowrap shrink-0 sm:w-full transition-all duration-150 m3-pressable active:scale-[0.97] ${selected ? "bg-primary text-on-primary border-primary shadow-m3-1" : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest"}`}
                    >
                      <t.icon size={14} className="shrink-0" />
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </nav>
              <div className="flex-1 min-h-0 overflow-auto p-4 bg-surface-container min-h-[400px]">
                {settingsTab === "general" && (
                  <div className="space-y-3 animate-m3-fade-in">
                    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0"><Power size={16}/></span>
                      <div className="flex-1">
                        <div className="text-[13px] font-medium text-on-surface">Launch at startup</div>
                        <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">Launch Lefty elevated at logon via Task Scheduler. No UAC prompt, no services.</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={autostart} onChange={e=>{ const v=e.target.checked; setAutostart(v); invoke("set_autostart",{enabled:v}).catch(()=>{}); }} className="sr-only peer" />
                        <div className="w-11 h-7 bg-surface-container-highest border-2 border-outline rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all before:content-[''] before:absolute before:top-[3px] before:left-[3px] before:bg-outline before:rounded-full before:h-5 before:w-5 before:transition-all peer-checked:before:translate-x-[18px] peer-checked:before:bg-on-primary"></div>
                      </label>
                    </div>
                    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0"><Minimize2 size={16}/></span>
                      <div className="flex-1">
                        <div className="text-[13px] font-medium text-on-surface">Start minimized</div>
                        <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">Starts minimized in the tray.</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={startMinimized} onChange={e=>{ const v=e.target.checked; setStartMinimized(v); invoke("set_start_minimized",{enabled:v}).catch(()=>{}); }} className="sr-only peer" />
                        <div className="w-11 h-7 bg-surface-container-highest border-2 border-outline rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all before:content-[''] before:absolute before:top-[3px] before:left-[3px] before:bg-outline before:rounded-full before:h-5 before:w-5 before:transition-all peer-checked:before:translate-x-[18px] peer-checked:before:bg-on-primary"></div>
                      </label>
                    </div>
                    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0"><Play size={16}/></span>
                      <div className="flex-1">
                        <div className="text-[13px] font-medium text-on-surface">Start with mappings active</div>
                        <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">Begin with remaps on every launch instead of paused.</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={startActive} onChange={e=>{ const v=e.target.checked; setStartActive(v); try{localStorage.setItem("lefty_start_active",String(v));}catch{} }} className="sr-only peer" />
                        <div className="w-11 h-7 bg-surface-container-highest border-2 border-outline rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all before:content-[''] before:absolute before:top-[3px] before:left-[3px] before:bg-outline before:rounded-full before:h-5 before:w-5 before:transition-all peer-checked:before:translate-x-[18px] peer-checked:before:bg-on-primary"></div>
                      </label>
                    </div>
                    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0"><EyeOff size={16}/></span>
                      <div className="flex-1">
                        <div className="text-[13px] font-medium text-on-surface">Close to tray</div>
                        <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">X button minimizes to tray. Left click shows, right click closes.</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={hideToTray} onChange={e=>{ const v=e.target.checked; setHideToTray(v); invoke("set_hide_to_tray",{enabled:v}).catch(()=>{}); }} className="sr-only peer" />
                        <div className="w-11 h-7 bg-surface-container-highest border-2 border-outline rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all before:content-[''] before:absolute before:top-[3px] before:left-[3px] before:bg-outline before:rounded-full before:h-5 before:w-5 before:transition-all peer-checked:before:translate-x-[18px] peer-checked:before:bg-on-primary"></div>
                      </label>
                    </div>
                    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0">{soundsOn ? <Volume2 size={16}/> : <VolumeX size={16}/>}</span>
                      <div className="flex-1">
                        <div className="text-[13px] font-medium text-on-surface">Interface sounds</div>
                        <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">Soft chime on activate, lower chime on pause.</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={soundsOn} onChange={e=>{ const v=e.target.checked; setSoundsOn(v); setSoundEnabled(v); if (v) playToggleSound(true); }} className="sr-only peer" />
                        <div className="w-11 h-7 bg-surface-container-highest border-2 border-outline rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all before:content-[''] before:absolute before:top-[3px] before:left-[3px] before:bg-outline before:rounded-full before:h-5 before:w-5 before:transition-all peer-checked:before:translate-x-[18px] peer-checked:before:bg-on-primary"></div>
                      </label>
                    </div>
                  </div>
                )}
                {settingsTab === "appearance" && (
                  <div className="animate-m3-fade-in">
                    <AccentColorSection />
                  </div>
                )}
                {settingsTab === "input" && (
                  <div className="space-y-3 animate-m3-fade-in">
                    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4">
                      <div className="flex items-start gap-3">
                        <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0"><Mouse size={16}/></span>
                        <div className="flex-1">
                          <div className="text-[13px] font-medium text-on-surface">Left-handed mouse — invert clicks</div>
                          <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">Swap primary/secondary button with <span className="font-mono bg-surface-container-highest border px-1.5 py-0.5 rounded-full">SwapMouseButton</span> (0ms). Restored on exit.</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer ml-2">
                          <input type="checkbox" checked={invertMouse} onChange={e=>{ const v=e.target.checked; setInvertMouse(v); invoke("set_invert_clicks",{enabled:v}).catch(()=>{}); try{localStorage.setItem("lefty_invert",String(v));}catch{}}} className="sr-only peer" />
                          <div className="w-11 h-7 bg-surface-container-highest border-2 border-outline rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all before:content-[''] before:absolute before:top-[3px] before:left-[3px] before:bg-outline before:rounded-full before:h-5 before:w-5 before:transition-all peer-checked:before:translate-x-[18px] peer-checked:before:bg-on-primary"></div>
                        </label>
                      </div>
                    </div>
                    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4">
                      <div className="flex items-start gap-3">
                        <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0"><KeyboardOff size={16}/></span>
                        <div className="flex-1">
                          <div className="text-[13px] font-medium text-on-surface">Global hotkey to pause</div>
                          <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">Key to pause/resume remaps without closing Lefty. Default <span className="font-mono bg-primary text-on-primary px-1.5 py-0.5 rounded-full">F6</span>.</div>
                          <div className="mt-3 flex items-center gap-2">
                            <select value={hotkey} onChange={e=>{ const v=e.target.value; setHotkey(v); invoke("set_hotkey",{hotkey:v}).catch(()=>{}); }} className="h-10 rounded-xl bg-surface-container-highest border border-outline-variant text-[13px] font-mono px-3 text-on-surface min-w-[110px]">
                              {allKeys.map(k=> <option key={k} value={k}>{k}</option>)}
                            </select>
                            <span className="text-[11px] text-on-surface-variant">Saved to <span className="font-mono bg-surface-container-highest border px-1.5 py-0.5 rounded-full">%APPDATA%\Lefty\hotkey.txt</span></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {settingsTab === "profiles" && (
                  <div className="animate-m3-fade-in">
                    <ProfileImportExport onProfilesChanged={(p, a) => {
                      setProfiles(p as typeof profiles);
                      setActive(a);
                      const m = (p as typeof profiles)[a]?.mappings ?? [];
                      invoke("update_mappings", { mappings: m }).catch(()=>{});
                    }} />
                  </div>
                )}
                {settingsTab === "about" && (
                  <div className="space-y-3 animate-m3-fade-in">
                    <div className="rounded-xl bg-primary-container/20 border border-outline-variant p-3 flex gap-3">
                      <span className="w-8 h-8 rounded-full bg-primary text-on-primary grid place-items-center flex-shrink-0"><Lightbulb size={14}/></span>
                      <p className="text-[11px] leading-relaxed text-on-surface-variant"><span className="font-medium text-on-surface">How it works:</span> Lefty uses <span className="font-mono bg-surface-container-highest border px-1.5 py-0.5 rounded-full">WH_KEYBOARD_LL</span> + <span className="font-mono bg-surface-container-highest border px-1.5 py-0.5 rounded-full">SendInput</span> in Rust with low latency. Activate profile before launching game and use <span className="font-mono bg-primary text-on-primary px-1.5 py-0.5 rounded-full">{hotkey}</span> to pause.</p>
                    </div>
                    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-[12px] bg-primary-container text-on-primary-container grid place-items-center flex-shrink-0 overflow-hidden border border-outline-variant">
                        <img src={laskIcon} alt="Lefty" className="w-full h-full object-cover" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-on-surface flex items-center gap-2">Lefty <span className="text-[10px] font-medium tracking-widest text-on-surface-variant border border-outline-variant px-1.5 py-0.5 rounded-full">v2</span></div>
                        <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">Tauri v2 · React · Rust native engine. By Sycho — left-handed layouts.</div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0"><Gauge size={16}/></span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-on-surface">Engine latency</div>
                        <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">Hook → injection, measured in-engine (last second).</div>
                        <div className="mt-2 font-mono text-[12px] text-on-surface">
                          {latStats && Date.now() - latStats.ts_ms < 3000 && latStats.events > 0 ? (
                            <>avg <span className="font-medium">{(latStats.avg_us / 1000).toFixed(3)}ms</span> · max <span className="font-medium">{(latStats.max_us / 1000).toFixed(3)}ms</span> · <span className="text-on-surface-variant">{latStats.events} keys</span></>
                          ) : (
                            <span className="text-on-surface-variant">idle — press a mapped key</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-outline-variant bg-surface-container-high flex gap-3">
              <button onClick={closeSettings} className="flex-1 h-11 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface text-[13px] font-medium m3-pressable active:scale-[0.97]">Close</button>
              <button onClick={closeSettings} className="flex-1 h-11 rounded-full bg-primary text-on-primary text-[13px] font-medium m3-pressable active:scale-[0.97] hover:scale-[1.01]">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
