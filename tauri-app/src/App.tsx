import { useState, useEffect } from "react";
import { Keyboard, Plus, Trash2, ArrowLeftRight, Zap, Activity, Sparkles, Settings, Mouse, Power, EyeOff, KeyboardOff, Info, Lightbulb } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import laskIcon from "./LASK.png";

type Mapping = [string, string];
type Profile = { display_name: string; description: string; icon: string; mappings: Mapping[] };

// native low-level: GetKeyNameList dynamic via Rust (keyboard_layout.rs) — fallback to LATAM distinct static for dev without Rust
const FALLBACK_ALL_KEYS = ["'","´","¨","Ç","ç","+","*","°","|","¬","<",">",";","Ñ",":",",","-","_",".","/","?","=","¡","¿","0","1","2","3","4","5","6","7","8","9", "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","[","{","\\","]","}", "`","ALT","BACKSPACE","CAPSLOCK","CTRL","DELETE","DISABLED","DOWN","END","ENTER","ESC","F1","F10","F11","F12","F2","F3","F4","F5","F6","F7","F8","F9","HOME","INSERT","LALT","LCTRL","LEFT","LSHIFT","LWIN","NUM*","NUM+","NUM-","NUM.","NUM/","NUM0","NUM1","NUM2","NUM3","NUM4","NUM5","NUM6","NUM7","NUM8","NUM9","NUMLOCK","PAGEDOWN","PAGEUP","RALT","RCTRL","RIGHT","RSHIFT","RWIN","SCROLLLOCK","SHIFT","SPACE","TAB","UP"];

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

export default function App() {
  const [active, setActive] = useState("sycho");
  const [profiles, setProfiles] = useState<Record<string, Profile>>(BUILTIN);
  const [enabled, setEnabled] = useState(true);
  const [invertMouse, setInvertMouse] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [srcKey, setSrcKey] = useState("W");
  const [dstKey, setDstKey] = useState("I");
  const [capturing, setCapturing] = useState<null | "src" | "dst">(null);
  const [allKeys, setAllKeys] = useState<string[]>(FALLBACK_ALL_KEYS);
  const [autostart, setAutostart] = useState(false);
  const [hideToTray, setHideToTray] = useState(true);
  const [hotkey, setHotkey] = useState("F6");
  const [hotkeyOptions] = useState(["F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12"]);

  useEffect(() => {
    invoke<[number, string][]>("get_key_name_list").then(list => {
      if (Array.isArray(list) && list.length > 10) {
        const names = list.map(([, name]) => name).filter(n => n && n !== "Undefined");
        if (!names.includes("Ñ") && FALLBACK_ALL_KEYS.includes("Ñ")) names.push("Ñ");
        if (!names.includes("'") && FALLBACK_ALL_KEYS.includes("'")) names.push("'");
        if (!names.includes("´") && FALLBACK_ALL_KEYS.includes("´")) names.push("´");
        if (!names.includes("`") && FALLBACK_ALL_KEYS.includes("`")) names.push("`");
        setAllKeys(names);
      }
    }).catch(()=>{});
    // Load settings didácticos
    invoke<boolean>("get_autostart").then(setAutostart).catch(()=>{});
    invoke<boolean>("get_hide_to_tray").then(setHideToTray).catch(()=>{});
    invoke<string>("get_hotkey").then(v=> v && setHotkey(v.toUpperCase())).catch(()=>{});
    invoke<boolean>("get_engine_enabled").then(setEnabled).catch(()=>{});
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
  const toggle = async () => {
    try {
      if (enabled) {
        await invoke("set_engine_enabled", {enabled: false}).catch(()=>{});
        await invoke("stop_engine");
        setEnabled(false);
      } else {
        await invoke("set_engine_enabled", {enabled: true}).catch(()=>{});
        await invoke("update_mappings", { mappings: prof.mappings });
        await invoke("start_engine", { profile: active });
        setEnabled(true);
      }
    } catch {
      setEnabled(!enabled);
    }
  };

  const syncEngine = (mappings: Mapping[]) => {
    invoke("update_mappings", { mappings }).catch(()=>{});
  };

  useEffect(() => {
    syncEngine(profiles[active].mappings);
  }, [active]);

  useEffect(() => {
    const t = setTimeout(() => {
      invoke("set_engine_enabled", {enabled: true}).catch(()=>{});
      invoke("update_mappings", {mappings: profiles[active].mappings}).then(()=> invoke("start_engine", {profile: active}).catch(()=>{})).catch(()=>{});
    }, 400);
    const id = setInterval(async () => {
      try {
        const state = await invoke<boolean>("get_engine_enabled");
        setEnabled(prev => prev !== state ? state : prev);
      } catch {}
    }, 300);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [profiles, active]);

  useEffect(() => {
    return () => {
      invoke("set_invert_clicks", {enabled: false}).catch(()=>{});
      invoke("stop_engine").catch(()=>{});
    };
  }, []);

  const addMap = () => {
    if (!srcKey || !dstKey || srcKey === dstKey) return;
    const next = { ...profiles };
    const cur = next[active];
    const newMappings = cur.mappings.some(([s]) => s === srcKey)
      ? cur.mappings.map(([s,d]) => s === srcKey ? [s, dstKey] as Mapping : [s,d] as Mapping)
      : [...cur.mappings, [srcKey, dstKey] as Mapping];
    cur.mappings = newMappings;
    next[active] = { ...cur };
    setProfiles(next);
    syncEngine(newMappings);
    setShowAdd(false);
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
      {/* M3 Expressive background — surface dim with tonal overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-tertiary/5 pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, var(--md-sys-color-on-surface) 1px, transparent 0)`, backgroundSize: `24px 24px` }} />

      {/* Header — M3 Expressive Top App Bar */}
      <header className="h-[72px] bg-surface-container border-b border-outline-variant flex items-center justify-between px-6 sticky top-0 z-10 shadow-m3-1 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary-container grid place-items-center shadow-m3-1 overflow-hidden border border-outline-variant">
            <img src={laskIcon} alt="Lefty" className="w-full h-full object-cover" />
          </div>
          <div className="leading-none">
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-[22px] font-display font-medium tracking-tight text-on-surface">Lefty</h1>
              <span className="text-[11px] font-medium tracking-widest text-on-surface-variant bg-surface-container-high border border-outline-variant px-2 py-0.5 rounded-full">v2 • Expressive</span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-tertiary bg-tertiary-container border border-outline-variant px-2 py-0.5 rounded-full"><Sparkles size={11}/>M3 2025</span>
            </div>
            <p className="text-[12px] font-sans tracking-wide text-on-surface-variant mt-1">By Sycho <span className="text-outline">·</span> Left-handed • Monochrome #121212</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-full bg-surface-container-high border border-outline-variant shadow-m3-1">
            <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${enabled ? "bg-tertiary shadow-[0_0_10px_var(--md-sys-color-tertiary)]" : "bg-outline"}`} />
            <span className="text-[12px] font-medium tracking-wide text-on-surface pr-1">{enabled ? "ACTIVE" : "INACTIVE"}</span>
            <button onClick={toggle} className={`h-9 px-5 rounded-full text-[13px] font-medium transition-all duration-[300ms] ease-m3-emphasized shadow-m3-1 active:scale-[0.98] ${enabled ? "bg-surface-container-highest border border-outline text-on-surface hover:bg-surface-container-high" : "bg-primary text-on-primary hover:shadow-m3-2"}`}>
              {enabled ? "Pause" : "Activate"}
            </button>
          </div>
          <div className="sm:hidden flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${enabled ? "bg-tertiary" : "bg-outline"}`} />
            <button onClick={toggle} className={`h-9 px-5 rounded-full text-[13px] font-medium shadow-m3-1 ${enabled ? "bg-surface-container-high border border-outline text-on-surface" : "bg-primary text-on-primary"}`}>{enabled ? "Pause" : "Activate"}</button>
          </div>
          <button onClick={()=> setShowSettings(true)} aria-label="Settings" className="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant hover:bg-surface-container-highest hover:border-outline grid place-items-center text-on-surface-variant hover:text-on-surface transition-all shadow-m3-1 hover:shadow-m3-2 active:scale-95">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-4 p-4 max-w-[1440px] w-full mx-auto overflow-hidden">
        {/* Left — Profiles — M3 Navigation Drawer expressive */}
        <aside className="col-span-12 lg:col-span-3 bg-surface-container rounded-[28px] border border-outline-variant flex flex-col overflow-hidden min-h-0 shadow-m3-1">
          <div className="px-5 pt-5 pb-4">
            <h2 className="text-[13px] font-display font-medium tracking-wide text-on-surface flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-primary"/>PROFILES</h2>
            <p className="text-[12px] font-sans leading-relaxed text-on-surface-variant mt-1.5">Choose your left-handed layout — expressive M3</p>
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-3 pb-3 space-y-2">
            {Object.entries(profiles).map(([key, p]) => (
              <button key={key} onClick={() => setActive(key)} className={`w-full text-left p-3.5 rounded-[16px] border transition-all duration-[300ms] ease-m3-spring flex items-center gap-3 group ${active===key ? "bg-primary text-on-primary border-primary shadow-m3-2 scale-[1.01]" : "bg-surface-container-high border-outline-variant hover:bg-surface-container-highest hover:border-outline hover:shadow-m3-1 hover:scale-[1.005] text-on-surface"}`}>
                <span className={`w-10 h-10 grid place-items-center rounded-[12px] text-[15px] font-medium flex-shrink-0 transition-colors ${active===key ? "bg-on-primary text-primary" : "bg-secondary-container text-on-secondary-container group-hover:bg-primary-container group-hover:text-on-primary-container"}`}>{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium leading-none truncate ${active===key ? "text-on-primary" : "text-on-surface"}`}>{p.display_name}</div>
                  <div className={`text-[11px] mt-1 truncate ${active===key ? "text-on-primary/80" : "text-on-surface-variant"}`}>{p.mappings.length} mappings · {p.description.split("·")[0]?.trim() || p.description.slice(0,22)}</div>
                </div>
                {active===key && <div className="w-2 h-2 rounded-full bg-on-primary flex-shrink-0 animate-pulse" />}
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-outline-variant bg-surface-container-high/50">
            <div className="rounded-[16px] bg-surface-container-high border border-outline-variant p-3.5 flex items-center gap-3 shadow-m3-1">
              <div className="w-10 h-10 rounded-[12px] bg-primary text-on-primary grid place-items-center shadow-m3-1"><Zap size={16} /></div>
              <div>
                <div className="text-[12px] font-medium text-on-surface leading-none font-display">Native Engine</div>
                <div className="text-[11px] font-mono text-on-surface-variant mt-1">Rust • 0.02ms • WH_KEYBOARD_LL</div>
              </div>
              <span className="ml-auto w-2 h-2 rounded-full bg-tertiary animate-pulse" />
            </div>
          </div>
        </aside>

        {/* Center — Mappings — M3 Card expressive (expandido) */}
        <main className="col-span-12 lg:col-span-9 bg-surface-container rounded-[28px] border border-outline-variant flex flex-col overflow-hidden min-h-0 shadow-m3-1">
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[20px] font-display font-medium tracking-tight text-on-surface flex items-center gap-2.5"><span className="w-8 h-8 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center"><Keyboard size={16}/></span> {prof.display_name}</h2>
                <p className="text-[13px] font-sans text-on-surface-variant mt-2 leading-relaxed max-w-[520px]">{prof.description}</p>
              </div>
              <button onClick={()=>setShowAdd(true)} className="hidden sm:inline-flex h-10 px-5 rounded-full bg-primary text-on-primary text-[13px] font-medium items-center gap-2 hover:shadow-m3-2 transition-all duration-300 ease-m3-emphasized active:scale-[0.98] shadow-m3-1"><Plus size={16} className="text-on-primary"/> Add</button>
            </div>
          </div>
          <div className="px-6 py-3 flex items-center justify-between text-[11px] font-medium tracking-widest text-on-surface-variant border-y border-outline-variant bg-surface-container-high">
            <span className="flex items-center gap-2"><span className="w-1 h-3 rounded-full bg-primary"/>{prof.mappings.length} MAPPINGS</span><span className="font-mono font-normal tracking-wide text-outline text-[10px]">SOURCE → TARGET</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 bg-surface-container" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--md-sys-color-outline) transparent' } as React.CSSProperties}>
            {prof.mappings.length===0 ? (
              <div className="py-16 text-center animate-m3-fade-in">
                <div className="w-16 h-16 mx-auto rounded-[20px] bg-surface-container-high border border-outline-variant grid place-items-center text-outline shadow-m3-1"><Keyboard size={24}/></div>
                <p className="text-[15px] font-display font-medium text-on-surface mt-4">No mappings</p>
                <p className="text-[13px] font-sans text-on-surface-variant">Add your first remap to start — expressive</p>
                <button onClick={()=>setShowAdd(true)} className="mt-6 h-10 px-6 rounded-full bg-primary text-on-primary text-[13px] font-medium shadow-m3-1 hover:shadow-m3-2 transition-all">Add mapping</button>
              </div>
            ) : prof.mappings.map(([s,d])=>(
              <div key={s} className="h-[56px] bg-surface-container-high border border-outline-variant hover:bg-surface-container-highest hover:border-outline rounded-[16px] flex items-center px-4 gap-3 transition-colors duration-200">
                <span className="px-3.5 py-1.5 rounded-full bg-surface-container-highest border border-outline-variant text-[12px] font-mono font-medium min-w-[72px] text-center text-on-surface shadow-sm">{s}</span>
                <span className="w-7 h-7 rounded-full bg-primary text-on-primary grid place-items-center text-[12px] font-medium shadow-m3-1">→</span>
                <span className="px-3.5 py-1.5 rounded-full bg-primary-container text-on-primary-container text-[12px] font-mono font-medium min-w-[72px] text-center border border-outline-variant shadow-sm">{d}</span>
                <span className="hidden sm:block text-[11px] font-sans text-on-surface-variant ml-1">remap</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button onClick={()=>swapMap(s,d)} title="Swap" className="w-8 h-8 grid place-items-center rounded-full bg-surface-container-highest hover:bg-secondary-container border border-outline-variant hover:border-outline text-on-surface-variant hover:text-on-secondary-container transition-colors active:scale-95"><ArrowLeftRight size={13}/></button>
                  <button onClick={()=>delMap(s)} title="Delete" className="w-8 h-8 grid place-items-center rounded-full bg-surface-container-highest hover:bg-error-container border border-outline-variant hover:border-error text-on-surface-variant hover:text-on-error-container transition-colors active:scale-95"><Trash2 size={13}/></button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 bg-surface-container-high border-t border-outline-variant flex items-center justify-between">
            <span className="text-[11px] font-mono text-on-surface-variant">{prof.mappings.length} active • M3 Expressive</span>
            <button onClick={()=>setShowAdd(true)} className="sm:hidden h-9 px-5 rounded-full bg-primary text-on-primary text-[13px] font-medium shadow-m3-1 flex items-center gap-1.5"><Plus size={14}/>Add</button>
          </div>
        </main>

        {/* Right eliminado — keymaps expandido a 9 cols para aprovechar ancho */}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-scrim/60 backdrop-blur-sm grid place-items-center z-50 p-4 animate-m3-fade-in" onClick={()=>setShowAdd(false)}>
          <div className="w-full max-w-[460px] bg-surface-container rounded-[28px] border border-outline-variant p-6 shadow-m3-3 animate-m3-fade-in" onClick={e=>e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-[20px] font-display font-medium text-on-surface">Add mapping</h3>
                <p className="text-[12px] font-sans text-on-surface-variant mt-1">Choose source and target — M3 Expressive Type</p>
              </div>
              <span className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container grid place-items-center"><Plus size={16}/></span>
            </div>
            {capturing && <p className="mt-4 text-[12px] font-medium text-on-tertiary-container bg-tertiary-container border border-outline-variant rounded-full px-4 py-2 text-center animate-pulse">Capturing… press a key ({capturing})</p>}
            <div className="grid grid-cols-2 gap-4 mt-5">
              <div>
                <label className="text-[11px] font-medium tracking-widest text-on-surface-variant">SOURCE</label>
                <select value={srcKey} onChange={e=>setSrcKey(e.target.value)} className="mt-2 w-full h-11 rounded-[12px] bg-surface-container-high border border-outline-variant text-[13px] font-mono px-3 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all">
                  {allKeys.map(k=><option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={()=>setCapturing("src")} className={`mt-2 w-full h-9 rounded-full text-[12px] font-medium border transition-all duration-300 ease-m3-spring ${capturing==="src" ? "bg-primary text-on-primary border-primary shadow-m3-1 scale-[1.02]" : "bg-surface-container-high hover:bg-surface-container-highest border-outline-variant text-on-surface hover:shadow-sm"}`}>Capture source</button>
              </div>
              <div>
                <label className="text-[11px] font-medium tracking-widest text-on-surface-variant">TARGET</label>
                <select value={dstKey} onChange={e=>setDstKey(e.target.value)} className="mt-2 w-full h-11 rounded-[12px] bg-surface-container-high border border-outline-variant text-[13px] font-mono px-3 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all">
                  {allKeys.map(k=><option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={()=>setCapturing("dst")} className={`mt-2 w-full h-9 rounded-full text-[12px] font-medium border transition-all duration-300 ease-m3-spring ${capturing==="dst" ? "bg-primary text-on-primary border-primary shadow-m3-1 scale-[1.02]" : "bg-surface-container-high hover:bg-surface-container-highest border-outline-variant text-on-surface hover:shadow-sm"}`}>Capture target</button>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 mt-6 p-3 rounded-[16px] bg-surface-container-high border border-outline-variant">
              <span className="px-4 py-2 rounded-full bg-surface-container-highest border border-outline-variant text-[13px] font-mono text-on-surface shadow-sm min-w-[72px] text-center">{srcKey}</span>
              <span className="w-8 h-8 rounded-full bg-primary text-on-primary grid place-items-center text-[13px] font-medium shadow-m3-1">→</span>
              <span className="px-4 py-2 rounded-full bg-primary-container text-on-primary-container text-[13px] font-mono border border-outline-variant shadow-sm min-w-[72px] text-center">{dstKey}</span>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={()=>setShowAdd(false)} className="flex-1 h-11 rounded-full border-2 border-outline text-on-surface hover:bg-surface-container-high text-[13px] font-medium transition-all">Cancel</button>
              <button onClick={addMap} className="flex-1 h-11 rounded-full bg-primary text-on-primary text-[13px] font-medium transition-all shadow-m3-1 hover:shadow-m3-2 hover:scale-[1.01] active:scale-[0.98]">Save mapping</button>
            </div>
          </div>
        </div>
      )}
      {showSettings && (
        <div className="fixed inset-0 bg-scrim/60 backdrop-blur-sm grid place-items-center z-50 p-4 animate-m3-fade-in" onClick={()=> setShowSettings(false)}>
          <div className="w-full max-w-[640px] max-h-[86vh] bg-surface-container rounded-[28px] border border-outline-variant shadow-m3-3 flex flex-col overflow-hidden animate-m3-fade-in" onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-outline-variant bg-surface-container-high flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-[12px] bg-primary text-on-primary grid place-items-center shadow-m3-1"><Settings size={18}/></span>
                <div>
                  <h3 className="text-[18px] font-display font-medium text-on-surface leading-none">Settings</h3>
                  <p className="text-[11px] font-sans text-on-surface-variant mt-1">Didáctico • Todo explicado • M3 Expressive monochrome</p>
                </div>
              </div>
              <button onClick={()=> setShowSettings(false)} className="w-9 h-9 rounded-full bg-surface-container-highest border border-outline-variant hover:bg-surface-container-high grid place-items-center text-on-surface-variant hover:text-on-surface">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface-container">
              <div className="rounded-[16px] bg-primary-container/30 border border-outline-variant p-3 flex gap-3">
                <span className="w-8 h-8 rounded-full bg-primary text-on-primary grid place-items-center flex-shrink-0"><Lightbulb size={14}/></span>
                <p className="text-[11px] leading-relaxed font-sans text-on-surface-variant"><span className="font-medium text-on-surface">Cómo funciona:</span> Lefty usa <span className="font-mono bg-surface-container-highest border border-outline-variant px-1.5 py-0.5 rounded-full">WH_KEYBOARD_LL</span> + <span className="font-mono bg-surface-container-highest border border-outline-variant px-1.5 py-0.5 rounded-full">SendInput</span> en Rust (0.02ms). Activa el perfil antes de abrir el juego y usa <span className="font-mono bg-primary text-on-primary px-1.5 py-0.5 rounded-full">{hotkey}</span> para pausar.</p>
              </div>

              <div className="space-y-3">
                <h4 className="text-[11px] font-display font-medium tracking-widest text-on-surface flex items-center gap-2"><span className="w-1 h-3 rounded-full bg-primary"/>GENERAL</h4>
                <div className="rounded-[16px] bg-surface-container-high border border-outline-variant p-4 flex items-start gap-3">
                  <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0"><Power size={16}/></span>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-on-surface">Iniciar con Windows</div>
                    <div className="text-[11px] font-sans leading-relaxed text-on-surface-variant mt-1">Abre Lefty al encender el PC. Usa la clave Run del registro, sin servicios. Ideal si juegas a diario.</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={autostart} onChange={e=>{ const v=e.target.checked; setAutostart(v); invoke("set_autostart",{enabled:v}).catch(()=>{}); }} className="sr-only peer" />
                    <div className="w-11 h-7 bg-surface-container-highest border-2 border-outline peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all before:content-[''] before:absolute before:top-[3px] before:left-[3px] before:bg-outline before:rounded-full before:h-5 before:w-5 before:transition-all peer-checked:before:translate-x-[18px] peer-checked:before:bg-on-primary"></div>
                  </label>
                </div>
                <div className="rounded-[16px] bg-surface-container-high border border-outline-variant p-4 flex items-start gap-3">
                  <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0"><EyeOff size={16}/></span>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-on-surface">Cerrar a bandeja</div>
                    <div className="text-[11px] font-sans leading-relaxed text-on-surface-variant mt-1">El botón X no cierra el programa, lo deja en la bandeja (tray). Click izquierdo muestra, derecho cierra.</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={hideToTray} onChange={e=>{ const v=e.target.checked; setHideToTray(v); invoke("set_hide_to_tray",{enabled:v}).catch(()=>{}); }} className="sr-only peer" />
                    <div className="w-11 h-7 bg-surface-container-highest border-2 border-outline peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all before:content-[''] before:absolute before:top-[3px] before:left-[3px] before:bg-outline before:rounded-full before:h-5 before:w-5 before:transition-all peer-checked:before:translate-x-[18px] peer-checked:before:bg-on-primary"></div>
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[11px] font-display font-medium tracking-widest text-on-surface flex items-center gap-2"><span className="w-1 h-3 rounded-full bg-tertiary"/>ENTRADA</h4>
                <div className="rounded-[16px] bg-surface-container-high border border-outline-variant p-4">
                  <div className="flex items-start gap-3">
                    <span className="w-9 h-9 rounded-[12px] bg-tertiary-container text-on-tertiary-container grid place-items-center flex-shrink-0"><Mouse size={16}/></span>
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-on-surface">Ratón para zurdos — invertir clicks</div>
                      <div className="text-[11px] font-sans leading-relaxed text-on-surface-variant mt-1">Intercambia botón primario/secundario con <span className="font-mono bg-surface-container-highest border border-outline-variant px-1.5 py-0.5 rounded-full">SwapMouseButton</span> nativo de Windows (0ms). Afecta a todo el sistema. Se restaura al salir.</div>
                      <div className="mt-2 inline-flex items-center gap-2 text-[11px] font-mono bg-surface-container-highest border border-outline-variant px-2.5 py-1 rounded-full text-on-surface-variant"><Info size={12}/>Recomendado si usas ratón con mano izquierda</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-2">
                      <input type="checkbox" checked={invertMouse} onChange={e=>{ const v=e.target.checked; setInvertMouse(v); invoke("set_invert_clicks",{enabled:v}).catch(()=>{}); try{localStorage.setItem("lefty_invert",String(v));}catch{}}} className="sr-only peer" />
                      <div className="w-11 h-7 bg-surface-container-highest border-2 border-outline peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all before:content-[''] before:absolute before:top-[3px] before:left-[3px] before:bg-outline before:rounded-full before:h-5 before:w-5 before:transition-all peer-checked:before:translate-x-[18px] peer-checked:before:bg-on-primary"></div>
                    </label>
                  </div>
                </div>
                <div className="rounded-[16px] bg-surface-container-high border border-outline-variant p-4">
                  <div className="flex items-start gap-3">
                    <span className="w-9 h-9 rounded-[12px] bg-primary-container text-on-primary-container grid place-items-center flex-shrink-0"><KeyboardOff size={16}/></span>
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-on-surface">Hotkey global para pausar</div>
                      <div className="text-[11px] font-sans leading-relaxed text-on-surface-variant mt-1">Tecla que detiene/reanuda todos los remapeos sin cerrar Lefty. Útil para escribir o si un juego detecta el hook. Por defecto <span className="font-mono bg-primary text-on-primary px-1.5 py-0.5 rounded-full">F6</span>.</div>
                      <div className="mt-3 flex items-center gap-2">
                        <select value={hotkey} onChange={e=>{ const v=e.target.value; setHotkey(v); invoke("set_hotkey",{hotkey:v}).catch(()=>{}); }} className="h-10 rounded-[12px] bg-surface-container-highest border border-outline-variant text-[13px] font-mono px-3 text-on-surface focus:outline-none focus:border-primary min-w-[110px]">
                          {hotkeyOptions.map(k=> <option key={k} value={k}>{k}</option>)}
                        </select>
                        <span className="text-[11px] font-sans text-on-surface-variant">Se guarda en <span className="font-mono bg-surface-container-highest border border-outline-variant px-1.5 py-0.5 rounded-full">%APPDATA%\Lefty\hotkey.txt</span> y el engine lo lee sin reiniciar.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[16px] bg-surface-container-high border border-outline-variant p-3 flex items-center gap-2 text-[11px] font-sans text-on-surface-variant">
                <Info size={14} className="text-outline flex-shrink-0"/>
                <span>Todos los ajustes se guardan y se reaplican al iniciar. Usa <span className="font-mono bg-surface-container-highest border border-outline-variant px-1 py-0.5 rounded-full">WH_KEYBOARD_LL</span> + <span className="font-mono bg-surface-container-highest border border-outline-variant px-1 py-0.5 rounded-full">SendInput</span> — si un anticheat bloquea, cambia a modo Interception.</span>
              </div>
            </div>
            <div className="p-4 border-t border-outline-variant bg-surface-container-high flex gap-3">
              <button onClick={()=> setShowSettings(false)} className="flex-1 h-11 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-container-high text-[13px] font-medium">Cerrar</button>
              <button onClick={()=> setShowSettings(false)} className="flex-1 h-11 rounded-full bg-primary text-on-primary text-[13px] font-medium shadow-m3-1 hover:shadow-m3-2">Hecho</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
