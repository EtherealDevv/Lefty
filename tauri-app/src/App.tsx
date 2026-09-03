import { useState, useEffect } from "react";
import { Gamepad2, Keyboard, Mouse, Plus, Trash2, ArrowLeftRight, Settings2, Shield, Zap, Activity } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [srcKey, setSrcKey] = useState("W");
  const [dstKey, setDstKey] = useState("I");
  const [capturing, setCapturing] = useState<null | "src" | "dst">(null);
  const [debugInfo, setDebugInfo] = useState("");
  const [allKeys, setAllKeys] = useState<string[]>(FALLBACK_ALL_KEYS);

  useEffect(() => {
    invoke<boolean>("is_admin").then(setIsAdmin).catch(()=>{});
    // native low-level: fetch GetKeyNameList from Rust (dynamic layout, not static)
    invoke<[number, string][]>("get_key_name_list").then(list => {
      if (Array.isArray(list) && list.length > 10) {
        const names = list.map(([, name]) => name).filter(n => n && n !== "Undefined");
        // Ensure distinct LATAM OEMs are present even if layout is US (fallback)
        if (!names.includes("Ñ") && FALLBACK_ALL_KEYS.includes("Ñ")) names.push("Ñ");
        if (!names.includes("'") && FALLBACK_ALL_KEYS.includes("'")) names.push("'");
        if (!names.includes("´") && FALLBACK_ALL_KEYS.includes("´")) names.push("´");
        if (!names.includes("`") && FALLBACK_ALL_KEYS.includes("`")) names.push("`");
        setAllKeys(names);
      }
    }).catch(()=>{});
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
      // Capture: key name is already via GetKeyName — accept any from allKeys
      if (allKeys.includes(key)) {
        if (capturing === "src") setSrcKey(key);
        else setDstKey(key);
      } else if (key.length===1) {
        const up = key.toUpperCase();
        if (allKeys.includes(up)) {
          if (capturing === "src") setSrcKey(up);
          else setDstKey(up);
        } else if (key.startsWith("VK_")) {
          // Fallback for unknown VKs
          if (capturing === "src") setSrcKey(key);
          else setDstKey(key);
        }
      } else if (key.includes("(") || key.includes("VK")) {
        // Special names like "Shift (Left)" — accept
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

  // Auto-start: load profiles and activate engine
  useEffect(() => {
    // Esperar a que localStorage haya cargado perfiles (si hay)
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
    <div className="h-screen bg-[#0A0A0F] text-zinc-100 flex flex-col overflow-hidden selection:bg-white/20 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-white/[0.02] pointer-events-none" />
      {/* Header - Glassify Material Monochrome */}
      <header className="h-[68px] bg-zinc-900/60 backdrop-blur-2xl border-b border-white/[0.06] flex items-center justify-between px-7 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl overflow-hidden ring-1 ring-zinc-700 shadow-sm">
            <img src={laskIcon} alt="Lefty" className="w-full h-full object-cover" />
          </div>
          <div className="leading-none">
            <div className="flex items-baseline gap-2">
              <h1 className="text-[17px] font-semibold tracking-tight text-white">Lefty</h1>
              <span className="text-[10px] font-medium tracking-widest text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded">v2</span>
            </div>
            <p className="text-[11px] font-medium tracking-wide text-zinc-400 mt-[2px]">By Sycho <span className="text-zinc-600">·</span> Left-handed</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2.5 pl-3 pr-1 py-1 rounded-full bg-zinc-800/50 border border-zinc-700/50">
            <div className={`w-2 h-2 rounded-full ${enabled ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-600"}`} />
            <span className="text-[11px] font-medium tracking-wide text-zinc-300 pr-2">{enabled ? "ACTIVE" : "INACTIVE"}</span>
            <button onClick={toggle} className={`h-7 px-4 rounded-full text-[12px] font-medium transition-all ${enabled ? "bg-zinc-700 hover:bg-zinc-600 text-white" : "bg-white hover:bg-zinc-100 text-zinc-900"}`}>
              {enabled ? "Pause" : "Activate"}
            </button>
          </div>
          <div className="sm:hidden flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${enabled ? "bg-emerald-500" : "bg-zinc-600"}`} />
            <button onClick={toggle} className={`h-8 px-4 rounded-full text-[12px] font-medium ${enabled ? "bg-zinc-800 text-white border border-zinc-700" : "bg-white text-zinc-900"}`}>{enabled ? "Pause" : "Activate"}</button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-5 p-5 max-w-[1440px] w-full mx-auto overflow-hidden">
        {/* Left - Profiles - Glassify Monochrome */}
        <aside className="col-span-12 lg:col-span-3 bg-zinc-900/40 backdrop-blur-xl rounded-2xl border border-white/[0.06] flex flex-col overflow-hidden min-h-0 shadow-lg">
          <div className="px-4 pt-4 pb-3 border-b border-white/[0.04]">
            <h2 className="text-[11px] font-semibold tracking-widest text-zinc-400">PROFILES</h2>
            <p className="text-[11px] text-zinc-500 mt-1">Choose your left-handed layout</p>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-2.5 pb-3 space-y-1.5">
            {Object.entries(profiles).map(([key, p]) => (
              <button key={key} onClick={() => setActive(key)} className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 backdrop-blur-sm ${active===key ? "bg-white border-white text-zinc-900 shadow-md" : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/10 text-zinc-100"}`}>
                <span className={`w-8 h-8 grid place-items-center rounded-lg text-[13px] font-medium flex-shrink-0 ${active===key ? "bg-zinc-900 text-white" : "bg-zinc-900 border border-zinc-800 text-zinc-400"}`}>{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-medium leading-none truncate ${active===key ? "text-zinc-900" : "text-white"}`}>{p.display_name}</div>
                  <div className={`text-[11px] mt-1 truncate ${active===key ? "text-zinc-500" : "text-zinc-400"}`}>{p.mappings.length} mappings · {p.description.split("·")[0]?.trim() || p.description.slice(0,22)}</div>
                </div>
                {active===key && <div className="w-1.5 h-1.5 rounded-full bg-zinc-900 flex-shrink-0" />}
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-zinc-800 bg-zinc-900/50">
            <div className="rounded-xl bg-zinc-800 border border-zinc-700/50 p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white text-zinc-900 grid place-items-center"><Zap size={14} /></div>
              <div>
                <div className="text-[11px] font-medium text-white leading-none">Native Engine</div>
                <div className="text-[11px] text-zinc-400 mt-1">Rust • 0.02ms • WH_KEYBOARD_LL</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Center - Mappings */}
        <main className="col-span-12 lg:col-span-6 bg-zinc-900 rounded-2xl border border-zinc-800 flex flex-col overflow-hidden min-h-0 shadow-sm">
          <div className="px-5 py-4 border-b border-zinc-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-white flex items-center gap-2"><Keyboard size={14} className="text-zinc-500"/> {prof.display_name}</h2>
                <p className="text-[12px] text-zinc-400 mt-1.5 leading-relaxed max-w-[520px]">{prof.description}</p>
              </div>
              <button onClick={()=>setShowAdd(true)} className="hidden sm:inline-flex h-8 px-3.5 rounded-full bg-white text-zinc-900 text-[12px] font-medium items-center gap-1.5 hover:bg-zinc-100 transition shadow-sm"><Plus size={14} className="text-zinc-700"/> Add</button>
            </div>
          </div>
          <div className="px-5 py-2.5 flex items-center justify-between text-[10px] font-medium tracking-widest text-zinc-500 border-b border-zinc-800/80 bg-zinc-900">
            <span>{prof.mappings.length} MAPPINGS</span><span className="font-normal tracking-wide text-zinc-600">SOURCE → TARGET</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-3 space-y-1.5 bg-zinc-900">
            {prof.mappings.length===0 ? (
              <div className="py-16 text-center">
                <div className="w-10 h-10 mx-auto rounded-xl bg-zinc-800 border border-zinc-700 grid place-items-center text-zinc-500"><Keyboard size={18}/></div>
                <p className="text-[13px] font-medium text-zinc-300 mt-3">No mappings</p>
                <p className="text-[12px] text-zinc-500">Add your first remap to start</p>
                <button onClick={()=>setShowAdd(true)} className="mt-4 h-8 px-4 rounded-full bg-white text-zinc-900 text-[12px] font-medium">Add mapping</button>
              </div>
            ) : prof.mappings.map(([s,d])=>(
              <div key={s} className="h-[46px] bg-zinc-800/70 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 rounded-xl flex items-center px-3 gap-2.5 group transition">
                <span className="px-3 py-1 rounded-full bg-zinc-900 border border-zinc-700 text-[11px] font-mono font-medium min-w-[64px] text-center text-zinc-200">{s}</span>
                <span className="w-6 h-6 rounded-full bg-white text-zinc-900 grid place-items-center text-[10px] font-medium">→</span>
                <span className="px-3 py-1 rounded-full bg-white text-zinc-900 text-[11px] font-mono font-medium min-w-[64px] text-center border border-zinc-200">{d}</span>
                <span className="hidden sm:block text-[11px] text-zinc-500 ml-1">remap</span>
                <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={()=>swapMap(s,d)} title="Swap" className="w-7 h-7 grid place-items-center rounded-full bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-zinc-300"><ArrowLeftRight size={11}/></button>
                  <button onClick={()=>delMap(s)} title="Delete" className="w-7 h-7 grid place-items-center rounded-full bg-zinc-900 hover:bg-red-950/50 border border-zinc-800 hover:border-red-900/50 text-zinc-400 hover:text-red-400"><Trash2 size={11}/></button>
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* Right - Status */}
        <aside className="col-span-12 lg:col-span-3 space-y-4 overflow-auto min-h-0 pr-1">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold tracking-widest text-zinc-400">STATUS</h3>
              <span className={`px-2 py-1 rounded-full text-[10px] font-medium tracking-widest border ${enabled ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-zinc-800 border-zinc-700 text-zinc-500"}`}>{enabled ? "LIVE" : "IDLE"}</span>
            </div>
            <div className={`mt-3 p-3.5 rounded-xl border ${enabled ? "bg-zinc-800 border-zinc-700" : "bg-zinc-800/50 border-zinc-800"}`}>
              <div className="flex items-center gap-2">
                <Activity size={14} className={enabled ? "text-emerald-500" : "text-zinc-600"} />
                <div className="text-[13px] font-medium text-white">WH_KEYBOARD_LL</div>
                {enabled && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
              </div>
              <div className="text-[11px] text-zinc-400 mt-1">{enabled ? "Hook active • Ready" : "Hook paused"}</div>
            </div>
            {!isAdmin ? (
              <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-2.5">
                <Shield size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[11px] font-medium text-amber-200">Admin required</div>
                  <div className="text-[11px] leading-relaxed text-amber-200/70 mt-1">Some games need elevation. Run as admin for full coverage.</div>
                </div>
              </div>
            ) : (
              <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex gap-2.5">
                <Shield size={14} className="text-emerald-500 mt-0.5" />
                <div className="text-[11px] font-medium text-emerald-200">Admin active</div>
              </div>
            )}
          </div>

          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 shadow-sm">
            <h3 className="text-[11px] font-semibold tracking-widest text-zinc-400">LEFT-HANDED MOUSE</h3>
            <label className="mt-3 flex items-center justify-between cursor-pointer group">
              <span className="text-[12px] font-medium text-zinc-200 group-hover:text-white transition">Invert clicks</span>
              <input type="checkbox" checked={invertMouse} onChange={e=>{ const v=e.target.checked; setInvertMouse(v); invoke("set_invert_clicks", {enabled: v}).catch(()=>{}); }} className="w-9 h-5 rounded-full appearance-none bg-zinc-800 border border-zinc-700 checked:bg-white checked:border-white relative before:absolute before:w-3.5 before:h-3.5 before:rounded-full before:bg-zinc-400 before:top-[2px] before:left-[2px] checked:before:bg-zinc-900 checked:before:translate-x-4 before:transition-all" />
            </label>
            <p className="text-[11px] text-zinc-500 mt-2">Windows native • 0ms</p>
          </div>

          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white text-zinc-900 grid place-items-center"><Gamepad2 size={13} /></div>
              <div>
                <h3 className="text-[11px] font-semibold tracking-widest text-zinc-400 leading-none">GAMING</h3>
                <p className="text-[11px] font-medium text-white leading-none mt-1">Always optimized</p>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-400 mt-3">Native Rust engine, 0.02ms. No gaming mode needed.</p>
          </div>

          <div className="bg-zinc-800/50 rounded-xl border border-zinc-800 p-3 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 grid place-items-center text-zinc-500"><Mouse size={13}/></div>
            <div>
              <div className="text-[11px] font-medium text-zinc-200">How it works</div>
              <div className="text-[11px] text-zinc-500">Hook • SendInput • return 1</div>
            </div>
          </div>

          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-3">
            <h3 className="text-[11px] font-semibold tracking-widest text-zinc-400">DEBUG</h3>
            <button onClick={async()=>{ try{ const info=await invoke<string>("get_debug_info"); setDebugInfo(info);}catch(e){setDebugInfo(String(e))} }} className="mt-2.5 w-full h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-medium text-zinc-300 transition">Check mappings file</button>
            <pre className="text-[9px] leading-relaxed text-zinc-500 mt-2.5 whitespace-pre-wrap break-all max-h-28 overflow-auto bg-zinc-950 rounded-lg p-2.5 border border-zinc-800">{debugInfo || "No data"}</pre>
          </div>

          <div className="flex gap-2">
            <button className="flex-1 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-[11px] font-medium transition">Export</button>
            <button className="flex-1 h-8 rounded-full bg-white hover:bg-zinc-100 text-zinc-900 text-[11px] font-medium transition">Import</button>
          </div>
          <p className="text-[10px] text-center tracking-wide text-zinc-600">Lefty v2 • By Sycho • Rust</p>
        </aside>
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm grid place-items-center z-50 p-4" onClick={()=>setShowAdd(false)}>
          <div className="w-full max-w-[440px] bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl" onClick={e=>e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-white">Add mapping</h3>
            <p className="text-[11px] text-zinc-400 mt-1">Choose source and target — Type supported</p>
            {capturing && <p className="mt-3 text-[11px] font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1.5 text-center">Capturing… press a key ({capturing})</p>}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="text-[10px] font-medium tracking-widest text-zinc-400">SOURCE</label>
                <select value={srcKey} onChange={e=>setSrcKey(e.target.value)} className="mt-1.5 w-full h-9 rounded-full bg-zinc-800 border border-zinc-700 text-[11px] font-mono px-3 text-white focus:outline-none focus:border-zinc-600">
                  {allKeys.map(k=><option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={()=>setCapturing("src")} className={`mt-2 w-full h-7 rounded-full text-[11px] font-medium border transition ${capturing==="src" ? "bg-white text-zinc-900 border-white" : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300"}`}>Capture source</button>
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-widest text-zinc-400">TARGET</label>
                <select value={dstKey} onChange={e=>setDstKey(e.target.value)} className="mt-1 w-full h-9 rounded-full bg-zinc-800 border border-zinc-700 text-[11px] font-mono px-3 text-white focus:outline-none focus:border-zinc-600">
                  {allKeys.map(k=><option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={()=>setCapturing("dst")} className={`mt-2 w-full h-7 rounded-full text-[11px] font-medium border transition ${capturing==="dst" ? "bg-white text-zinc-900 border-white" : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300"}`}>Capture target</button>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mt-5">
              <span className="px-3.5 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-[11px] font-mono text-zinc-200">{srcKey}</span>
              <span className="w-6 h-6 rounded-full bg-white text-zinc-900 grid place-items-center text-[10px]">→</span>
              <span className="px-3.5 py-1.5 rounded-full bg-white text-zinc-900 text-[11px] font-mono border border-zinc-200">{dstKey}</span>
            </div>
            <div className="flex gap-2.5 mt-6">
              <button onClick={()=>setShowAdd(false)} className="flex-1 h-9 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-[12px] font-medium transition">Cancel</button>
              <button onClick={addMap} className="flex-1 h-9 rounded-full bg-white hover:bg-zinc-100 text-zinc-900 text-[12px] font-medium transition">Save mapping</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
