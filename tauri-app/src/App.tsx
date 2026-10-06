import { useState, useEffect, useRef, useCallback } from "react";
import { Keyboard, Plus, Trash2, ArrowLeftRight, Activity, Settings, Mouse, Power, EyeOff, KeyboardOff, Info, Lightbulb, Shield, TriangleAlert, SlidersHorizontal, Palette, FileJson, Volume2, VolumeX, Minimize2, Play, Pause, Gauge, Pencil, Copy, MoreHorizontal, Share2, Check, Download, Loader2, ArrowUp, ArrowDown, X, Github, Search, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import laskIcon from "./LASK.png";
import ProfileImportExport from "./components/ProfileImportExport";
import GameBrowser from "./components/GameBrowser";
import AccentColorSection from "./components/AccentColorSection";
import { PROFILE_ICONS, ProfileGlyph, DEFAULT_PROFILE_ICON, migrateLegacyIcon } from "./lib/profileIcons";
import { useAccent, applyAccent, resolveAccent, normalizeProfileAccent, adjustForContrast, ACCENT_PRESETS, contrastOn } from "./theme/accent";
import GuidedTour from "./components/GuidedTour";
import { useMappingValidation } from "./lib/useMappingValidation";
import { isSoundEnabled, setSoundEnabled, playToggleSound, unlockAudio } from "./lib/toggleSound";
import { encodeShareCode, type Profile, type Mapping, type ProfilesMap } from "./lib/profilesIO";
import { copyText } from "./lib/clipboard";

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

const BUILTIN: ProfilesMap = {
  // Modelo: [tecla física mano derecha] → [tecla que espera el juego].
  // El juego keeps sus bindings WASD por defecto; tu mano derecha juega en
  // el cluster derecho. Modificadores/ESPACIO/ENTER derechos NO se mapean
  // (ya están al alcance y pasan tal cual).
  zurdo_ijkl: {
    display_name: "Left-handed IJKL",
    description: "Press IJKL, games see WASD · Complete right-hand cluster. Community layout.",
    icon: "Keyboard",
    mappings: [["I","W"],["J","A"],["K","S"],["L","D"],["U","Q"],["O","E"],["Y","R"],["H","F"],["P","ESC"],["N","Z"],["M","X"],[";","C"],["Ñ","C"],["B","V"],["7","1"],["8","2"],["9","3"],["0","4"],["T","TAB"],["G","T"],["/","B"],[",","ALT"]],
  },
  zurdo_flechas: {
    display_name: "Arrow Keys",
    description: "Press arrows, games see WASD · Cluster above arrows mapped. Classic.",
    icon: "Move",
    mappings: [["UP","W"],["LEFT","A"],["DOWN","S"],["RIGHT","D"],["INSERT","Q"],["HOME","E"],["END","R"],["DELETE","F"],["PAGEUP","Z"],["PAGEDOWN","X"],["NUMLOCK","TAB"],["NUM1","Z"],["NUM2","X"],["NUM3","C"],["NUM0","V"],["NUMENTER","G"],["NUM+","B"]],
  },
  numpad: {
    display_name: "Numpad 8456",
    description: "Move on 8456 for WASD games · Digits and big keys as actions.",
    icon: "Calculator",
    mappings: [["NUM8","W"],["NUM4","A"],["NUM5","S"],["NUM6","D"],["NUM7","Q"],["NUM9","E"],["NUM0","R"],["NUMENTER","F"],["NUM1","Z"],["NUM2","X"],["NUM3","C"],["NUM.","V"],["NUM-","TAB"],["NUM+","G"],["DELETE","G"],["END","B"],["HOME","Y"],["PAGEUP","H"],["PAGEDOWN","T"],["INSERT","U"]],
  },
  okl: {
    display_name: "OKL; Mirror",
    description: "WASD-shape mirror (Q→I, E→P, F→J) for WASD games. Community layout.",
    icon: "Target",
    mappings: [["O","W"],["K","A"],["L","S"],[";","D"],["Ñ","D"],["I","Q"],["P","E"],["J","F"],["[","R"],["´","R"],["Y","T"],["U","G"],[".","C"],[",","X"],["/","V"],["0","1"],["9","2"],["8","3"],["7","4"],["M","B"],["ENTER","SPACE"],["BACKSPACE","TAB"]],
  },
};

// Fábrica vieja (para detectar perfiles NO tocados por el usuario y actualizarlos).
const LEGACY_FACTORY: Record<string, Mapping[]> = {
  zurdo_ijkl: [["W","I"],["A","J"],["S","K"],["D","L"],["Q","U"],["E","O"],["R","P"],["F","M"],["C","N"]],
  zurdo_flechas: [["W","UP"],["A","LEFT"],["S","DOWN"],["D","RIGHT"]],
};
const BUILTIN_VERSION = "2";

type SettingsTabId = "general" | "appearance" | "input" | "profiles" | "about";

const SETTINGS_TABS: readonly { id: SettingsTabId; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "input", label: "Input", icon: Keyboard },
  { id: "profiles", label: "Profiles", icon: FileJson },
  { id: "about", label: "About", icon: Info },
];

function isNewerVersion(latest: string, current: string): boolean {
  const pa = latest.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = current.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const a = pa[i] ?? 0;
    const b = pb[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

// ── Mapeos pausados ──────────────────────────────────────────────────
// `Profile.disabled` guarda sources en pausa: reservan su source (la
// validación los trata como ocupados) pero NO llegan al engine.

/** Podado: solo conserva sources presentes en mappings. */
function pruneDisabledSources(mappings: Mapping[], disabled: readonly string[] | undefined): string[] {
  if (!disabled || disabled.length === 0) return [];
  const srcs = new Set(mappings.map(([s]) => s));
  return [...new Set(disabled.filter((d) => srcs.has(d)))];
}

/** Sources pausados válidos del perfil. */
function disabledSet(p: Profile): Set<string> {
  return new Set(pruneDisabledSources(p.mappings, p.disabled));
}

/** Lo que realmente recibe el engine (activos). */
function engineMappings(p: Profile): Mapping[] {
  const off = p.disabled;
  if (!off || off.length === 0) return p.mappings;
  const set = disabledSet(p);
  return set.size === 0 ? p.mappings : p.mappings.filter(([s]) => !set.has(s));
}

/** ¿El exe/título en foco corresponde a la lista (autoApps o playApps)? */
function matchesAppList(apps: readonly string[] | undefined, exe: string, title: string): boolean {
  if (!apps || apps.length === 0) return false;
  return apps.some((a) => {
    const n = a.trim().toLowerCase();
    return n !== "" && (exe === n || (title !== "" && title.includes(n)));
  });
}

/** ¿El exe/título en foco corresponde a las autoApps del perfil? */
function profileMatchesApps(p: Profile | undefined, exe: string, title: string): boolean {
  return matchesAppList(p?.autoApps, exe, title);
}

export default function App() {
  const [active, setActive] = useState("zurdo_ijkl");
  const [profiles, setProfiles] = useState<ProfilesMap>(BUILTIN);
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
  // Probador en vivo del modal Add: última tecla física capturada.
  const [testing, setTesting] = useState(false);
  const [testKey, setTestKey] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [hideToTray, setHideToTray] = useState(true);
  const [startMinimized, setStartMinimized] = useState(false);
  const [startActive, setStartActive] = useState<boolean>(() => {
    try { return localStorage.getItem("lefty_start_active") === "true"; } catch { return false; }
  });
  const [hotkey, setHotkey] = useState("F6");
  // Auto-play por allowlist (solo perfiles con playApps).
  const [autoPause, setAutoPause] = useState<boolean>(() => {
    try { return localStorage.getItem("lefty_autopause_focus") !== "false"; } catch { return true; }
  });
  // Espejo en estado del auto-pause para mostrar el badge AUTO.
  const [autoHeld, setAutoHeld] = useState(false);
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

  // Chime al cambiar ACTIVE/INACTIVE (botón o hotkey); sin sonido en el sync inicial.
  // Los cambios automáticos (auto-pausa) son silenciosos: chime solo manual.
  const firstEnabledSync = useRef(true);
  const suppressChimeRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  useEffect(() => {
    if (firstEnabledSync.current) {
      firstEnabledSync.current = false;
      return;
    }
    if (suppressChimeRef.current) {
      suppressChimeRef.current = false;
      return;
    }
    playToggleSound(enabled);
  }, [enabled]);
  // El arranque (fichero + spawn del engine) se ejecuta UNA sola vez por
  // sesión: los re-runs del efecto por profiles/active solo reponen el poll.
  const launchedRef = useRef(false);
  // Telemetría de latencia del engine (About).
  const [latStats, setLatStats] = useState<{ avg_us: number; max_us: number; events: number; ts_ms: number } | null>(null);
  // Update checker.
  const [updateInfo, setUpdateInfo] = useState<{ latest: string; url: string } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  // Onboarding de primer uso.
  const [showOnboard, setShowOnboard] = useState<boolean>(() => {
    try {
      return !localStorage.getItem("lefty_onboarded");
    } catch {
      return false;
    }
  });
  const [onboardStep, setOnboardStep] = useState(0);
  useEffect(() => {
    if (firstEnabledSync.current) {
      firstEnabledSync.current = false;
      return;
    }
    playToggleSound(enabled);
  }, [enabled]);

  // Foco gamer en CADA transición (botón, F6 o arranque): F6 conmuta en el
  // engine sin pasar por set_engine_enabled, así que va por efecto y no por comando.
  useEffect(() => {
    invoke("apply_gamer_focus", { enabled }).catch(() => {});
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

  // Update checker: compara con el último release de GitHub (una vez por arranque).
  const finishOnboard = () => {
    try {
      localStorage.setItem("lefty_onboarded", "1");
    } catch {
      /* sin storage: solo cerrar */
    }
    setShowOnboard(false);
    setOnboardStep(0);
  };
  // Inicia el tour cerrando antes cualquier modal (si no, el spotlight
  // apuntaría detrás de Settings y parecería roto).
  const startTour = () => {
    setOnboardStep(0);
    if (showSettings) {
      closeSettings();
      window.setTimeout(() => setShowOnboard(true), 420);
    } else {
      setShowOnboard(true);
    }
  };
  // El tour abre el editor en los pasos 3-5 y lo cierra al salir o retroceder.
  const handleTourStep = useCallback((s: number) => {
    if (s >= 3 && s <= 5) {
      setClosingAdd(false);
      setShowAdd(true);
    } else {
      setShowAdd(false);
    }
  }, []);
  const finishTour = () => {
    setShowAdd(false);
    finishOnboard();
  };
  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const ctrl = new AbortController();
        const to = window.setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch("https://api.github.com/repos/EtherealDevv/Lefty/releases/latest", { signal: ctrl.signal });
        window.clearTimeout(to);
        if (stop || !res.ok) return;
        const data = (await res.json()) as { tag_name?: string; html_url?: string };
        const latest = (data.tag_name ?? "").replace(/^v/, "");
        let current = "";
        try {
          current = (await invoke<string>("get_app_version")).replace(/^v/, "");
        } catch {
          return;
        }
        if (current) setAppVersion(current);
        if (latest && current && isNewerVersion(latest, current)) {
          setUpdateInfo({
            latest: data.tag_name ?? latest,
            url: data.html_url ?? "https://github.com/EtherealDevv/Lefty/releases",
          });
        }
      } catch {
        /* sin red: silencio */
      }
    };
    check();
    return () => {
      stop = true;
    };
  }, []);

  // Auto-switch: si la app en foco coincide con la lista de otro perfil,
  // cambiar solo cuando cambia el foco (nunca pelea con tu selección manual).
  // Auto-play (allowlist playApps): los mapeos solo viven en TUS juegos.
  // Entras → reanudar (si pausamos nosotros); sales → pausar. Lista
  // vacía = manual, sin automatismo. Solo en transiciones de foco y con
  // settle/debounce anti-transitorias. El control manual siempre gana.
  const lastFgSig = useRef("");
  const fgPrimed = useRef(false);
  // Poll adaptativo: rápido (250ms) solo si hay listas que vigilar
  // (autoApps o playApps en algún perfil); si no, 2s de bajo consumo.
  const FG_FAST_MS = 250;
  const FG_SLOW_MS = 2000;
  const PAUSE_SETTLE_MS = 250;
  const RESUME_SETTLE_MS = 350;
  useEffect(() => {
    // Sin el toggle, o sin listas en ningún perfil: poll lento.
    const watch =
      autoPause &&
      Object.values(profiles).some(
        (p) => (p.autoApps?.length ?? 0) > 0 || (p.playApps?.length ?? 0) > 0
      );
    const interval = watch ? FG_FAST_MS : FG_SLOW_MS;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stop) return;
      try {
        const fg = await invoke<{ exe: string; title: string }>("get_foreground_app");
        const sig = `${fg.exe}\n${fg.title}`.toLowerCase();
        if (!stop && sig !== lastFgSig.current) {
          lastFgSig.current = sig;
          // Nuevo foco: cancela diferidos pendientes (era una transitoria).
          if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = undefined; }
          if (pauseTimer.current) { clearTimeout(pauseTimer.current); pauseTimer.current = undefined; }
          const exe = fg.exe.toLowerCase();
          const title = fg.title.toLowerCase();
          const hit = Object.entries(profiles).find(
            ([id, p]) => id !== active && profileMatchesApps(p, exe, title)
          );
          const curId = hit ? hit[0] : active;
          if (hit) setActive(hit[0]);
          const cur = hit ? hit[1] : profiles[active];
          // Primer tick: solo se salta si Lefty está enfocado (editar sin
          // interferencias); si arrancas ya en el juego, evalúa de una vez.
          const first = !fgPrimed.current;
          fgPrimed.current = true;
          const skipFirst = first && exe === "lefty.exe";
          // Allowlist por perfil (playApps): en zona → reanudar si pausamos
          // nosotros; fuera → pausar. Vacía = manual, no se toca nada.
          // Al caer en un perfil manual por switch, también se reanuda:
          // el cambio de contexto ya es señal suficiente.
          const queueResume = (m: Mapping[], id: string) => {
            if (resumeTimer.current) return;
            const sigAtSchedule = sig;
            resumeTimer.current = setTimeout(() => {
              resumeTimer.current = undefined;
              if (stop || lastFgSig.current !== sigAtSchedule) return;
              if (!autoPausedRef.current || enabledRef.current) return;
              autoPausedRef.current = false;
              setAutoHeld(false);
              suppressChimeRef.current = true;
              setEnabled(true);
              invoke("set_engine_enabled", { enabled: true })
                .then(() => {
                  invoke("update_mappings", { mappings: m }).catch(() => {});
                  invoke("start_engine", { profile: id }).catch(() => {});
                })
                .catch(() => {});
            }, RESUME_SETTLE_MS);
          };
          const queuePause = () => {
            if (pauseTimer.current) return;
            const sigAtSchedule = sig;
            pauseTimer.current = setTimeout(() => {
              pauseTimer.current = undefined;
              if (stop || lastFgSig.current !== sigAtSchedule) return;
              if (!enabledRef.current || autoPausedRef.current) return;
              autoPausedRef.current = true;
              setAutoHeld(true);
              suppressChimeRef.current = true;
              setEnabled(false);
              invoke("set_engine_enabled", { enabled: false })
                .then(() => invoke("stop_engine").catch(() => {}))
                .catch(() => {});
            }, PAUSE_SETTLE_MS);
          };
          if (autoPause && !skipFirst && cur) {
            if (hit && autoPausedRef.current && !enabled && (cur.playApps ?? []).length === 0) {
              queueResume(engineMappings(cur), curId);
            } else if ((cur.playApps ?? []).length > 0) {
              const inZone = matchesAppList(cur.playApps, exe, title);
              if (inZone && autoPausedRef.current && !enabled) queueResume(engineMappings(cur), curId);
              else if (!inZone && enabled && !autoPausedRef.current) queuePause();
            }
          }
        }
      } catch {
        /* sin foco legible: no tocar nada */
      }
      if (!stop) timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, interval);
    return () => { stop = true; if (timer) clearTimeout(timer); if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = undefined; } if (pauseTimer.current) { clearTimeout(pauseTimer.current); pauseTimer.current = undefined; } };
  }, [profiles, active, enabled, autoPause]);

  const closeAdd = () => {
    setTesting(false);
    setTestKey(null);
    setTestOpen(false);
    setArmedCapture(false);
    setCapturing(null);
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
      if (saved) {
        const parsed = JSON.parse(saved) as ProfilesMap;
        // Migración única: glifos legacy → iconos Lucide.
        for (const p of Object.values(parsed)) {
          if (p && typeof p.icon === "string") p.icon = migrateLegacyIcon(p.icon);
          // Podado: la lista de pausados solo conserva sources existentes.
          if (p && p.disabled) p.disabled = pruneDisabledSources(p.mappings ?? [], p.disabled);
          // Migración pauseApps → playApps (allowlist): misma lista, semántica nueva.
          const legacy = p as Profile & { pauseApps?: unknown };
          if (p && !p.playApps && Array.isArray(legacy.pauseApps)) {
            const apps = legacy.pauseApps
              .filter((x): x is string => typeof x === "string")
              .map((a) => a.trim().toLowerCase())
              .filter((a) => a.length > 0);
            if (apps.length > 0) p.playApps = [...new Set(apps)];
          }
          if (p && "pauseApps" in p) delete (p as Record<string, unknown>).pauseApps;
        }
        // Migración de builtins (una vez): añade los nuevos que falten y
        // actualiza los idénticos a la fábrica vieja (los tocados se respetan).
        let stamped: string | null = null;
        try {
          stamped = localStorage.getItem("lefty_builtins_v");
        } catch {
          stamped = BUILTIN_VERSION;
        }
        if (stamped !== BUILTIN_VERSION && parsed && typeof parsed === "object") {
          const cloneProfile = (p: Profile): Profile => ({
            ...p,
            mappings: p.mappings.map((m): Mapping => [m[0], m[1]]),
          });
          for (const [id, bp] of Object.entries(BUILTIN)) {
            if (!parsed[id]) parsed[id] = cloneProfile(bp);
          }
          for (const [id, legacy] of Object.entries(LEGACY_FACTORY)) {
            const cur = parsed[id];
            if (cur && JSON.stringify(cur.mappings) === JSON.stringify(legacy) && BUILTIN[id]) {
              parsed[id] = cloneProfile(BUILTIN[id]);
            }
          }
          try {
            localStorage.setItem("lefty_builtins_v", BUILTIN_VERSION);
          } catch {}
        }
        setProfiles(parsed);
      }
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

  // Menú del tray: Show, pause/resume, perfiles (checked el activo), Close.
  // El toggle del tray reusa la misma función que el switch del header.
  const toggleRef = useRef<() => Promise<void>>(async () => {});
  const profilesRef = useRef(profiles);
  useEffect(() => {
    toggleRef.current = toggle;
    profilesRef.current = profiles;
  });
  useEffect(() => {
    let off1: (() => void) | undefined;
    let off2: (() => void) | undefined;
    let dead = false;
    (async () => {
      try {
        const u1 = await listen("tray-toggle", () => {
          toggleRef.current();
        });
        const u2 = await listen<string>("tray-switch-profile", (e) => {
          const id = e.payload;
          if (id && profilesRef.current[id]) setActive(id);
        });
        if (dead) {
          u1();
          u2();
        } else {
          off1 = u1;
          off2 = u2;
        }
      } catch {
        /* sin backend de eventos: el tray queda con Show/Close */
      }
    })();
    return () => {
      dead = true;
      off1?.();
      off2?.();
    };
  }, []);
  useEffect(() => {
    invoke("update_tray_menu", {
      profiles: Object.entries(profiles).map(([id, p]) => ({ id, name: p.display_name })),
      active,
      enabled,
    }).catch(() => {});
  }, [profiles, active, enabled]);

  // Probador en vivo: captura teclas en bucle y muestra qué vería el juego
  // según el perfil activo (sin inyectar nada). Mutuamente excluyente con Capture.
  useEffect(() => {
    if (!testing) return;
    let cancelled = false;
    const normalize = (key: string): string | null => {
      if (allKeys.includes(key)) return key;
      if (key.length === 1) {
        const up = key.toUpperCase();
        if (allKeys.includes(up)) return up;
        if (key.startsWith("VK_")) return key;
        return null;
      }
      if (key.includes("(") || key.includes("VK")) return key;
      return null;
    };
    const loop = async () => {
      while (!cancelled) {
        try {
          const key = await invoke<string>("capture_key");
          if (cancelled) return;
          const norm = normalize(key);
          if (norm) setTestKey(norm);
        } catch {
          if (cancelled) return;
          // Sin tecla / error del engine: pequeña pausa para no girar en caliente.
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    };
    loop();
    return () => { cancelled = true; };
  }, [testing, allKeys]);

  const prof = profiles[active];
  const [mapFilter, setMapFilter] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);
  const filterQuery = mapFilter.trim().toLowerCase();
  const visibleMappings = filterQuery
    ? prof.mappings.filter(
        ([s, d]) => s.toLowerCase().includes(filterQuery) || d.toLowerCase().includes(filterQuery)
      )
    : prof.mappings;
  const pausedSrcs = disabledSet(prof);
  const pausedCount = pausedSrcs.size;

  useEffect(() => {
    if (showFilter) filterRef.current?.focus();
    else setMapFilter("");
  }, [showFilter]);
  // Validación en tiempo real del modal Add contra el perfil activo
  const mappingValidation = useMappingValidation(srcKey, dstKey, prof.mappings);
  // Pausa automática: la toma el usuario con el switch/botón.
  const autoPausedRef = useRef(false);
  // Resume diferido pendiente (debounce anti-flicker).
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Pausa diferida pendiente (settle: el foco debe quedarse fuera/dentro).
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toggle = async () => {
    // Optimista: la UI y el chime son instantáneos; f6_toggle.txt manda y el poll corrige.
    autoPausedRef.current = false;
    setAutoHeld(false);
    if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = undefined; }
    if (pauseTimer.current) { clearTimeout(pauseTimer.current); pauseTimer.current = undefined; }
    const next = !enabled;
    setEnabled(next);
    try {
      await invoke("set_engine_enabled", { enabled: next });
      if (next) {
        await invoke("update_mappings", { mappings: engineMappings(prof) });
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

  /** Sincroniza un perfil al engine (solo mapeos activos). */
  const syncProfile = (p: Profile) => {
    syncEngine(engineMappings(p));
  };

  // Acento por perfil: si el activo trae uno válido, manda; si no, el global.
  // El pintado se centraliza aquí (el provider solo persiste el global).
  // applyAccent respeta el modo alto contraste; highContrast en deps repinta al conmutar.
  const { accent, accentHex, highContrast } = useAccent();
  useEffect(() => {
    syncProfile(profiles[active]);
  }, [active]);
  useEffect(() => {
    const stored = profiles[active]?.accent;
    const perProfile = normalizeProfileAccent(stored);
    if (perProfile) {
      applyAccent(resolveAccent(perProfile).hex);
    } else {
      applyAccent(accentHex);
    }
  }, [active, profiles, accentHex, highContrast]);

  // Auto-start: apply the launch preference, then load profiles and start engine
  // El poll de 100ms NO sincroniza hasta que el arranque escribe la
  // preferencia: si no, el f6_toggle.txt rancio de la sesión anterior
  // voltea la UI dos veces (activo→pausado con doble chime).
  const engineReadyRef = useRef(false);
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
          const cp = (curProfiles[curActive] ?? profiles[active]) as Profile | undefined;
          const m = cp ? engineMappings(cp) : [];
          invoke("update_mappings", {mappings: m}).then(()=> invoke("start_engine", {profile: curActive}).catch(()=>{})).catch(()=>{});
        } catch {
          invoke("update_mappings", {mappings: engineMappings(profiles[active])}).then(()=> invoke("start_engine", {profile: active}).catch(()=>{})).catch(()=>{});
        }
      };
      const go = () => { engineReadyRef.current = true; launch(); };
      invoke("set_engine_enabled", { enabled: startActive }).then(go).catch(go);
    }, 400);
    const id = setInterval(async () => {
      // Hasta que el arranque escribe la preferencia, el fichero manda
      // basura de la sesión anterior: no espejarlo.
      if (!engineReadyRef.current) return;
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
    // Bloqueado por validación (el botón ya viene disabled)
    if (!mappingValidation.canSave) return;
    const next = { ...profiles };
    const cur = next[active];
    const newMappings = [...cur.mappings, [srcKey, dstKey] as Mapping];
    cur.mappings = newMappings;
    next[active] = { ...cur };
    setProfiles(next);
    syncProfile(next[active]);
    closeAdd();
  };

  const swapMap = (s: string, d: string) => {
    const next = { ...profiles };
    const cur = next[active];
    const wasOff = (cur.disabled ?? []).includes(s);
    const newMappings = cur.mappings.filter(([src]) => src !== s);
    let disabled = (cur.disabled ?? []).filter((x) => x !== s);
    if (!newMappings.some(([src]) => src === d)) {
      newMappings.push([d, s] as Mapping);
      // La pausa sigue al remapeo: si s estaba en pausa, d hereda la pausa.
      if (wasOff) disabled = [...disabled, d];
    }
    next[active] = { ...cur, mappings: newMappings, disabled: pruneDisabledSources(newMappings, disabled) };
    setProfiles(next);
    syncProfile(next[active]);
  };

  const delMap = (src: string) => {
    const next = { ...profiles };
    const cur = next[active];
    const newMappings = cur.mappings.filter(([s]) => s !== src);
    next[active] = { ...cur, mappings: newMappings, disabled: pruneDisabledSources(newMappings, cur.disabled) };
    setProfiles(next);
    syncProfile(next[active]);
  };

  /** Pausa/reanuda un mapeo suelto (reserva su source, no llega al engine). */
  const toggleMapping = (src: string) => {
    const cur = profiles[active];
    const off = new Set(cur.disabled ?? []);
    if (off.has(src)) off.delete(src);
    else off.add(src);
    const next = {
      ...profiles,
      [active]: { ...cur, disabled: pruneDisabledSources(cur.mappings, [...off]) },
    };
    setProfiles(next);
    syncProfile(next[active]);
  };

  // ── Profile CRUD ──
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [copiedTick, setCopiedTick] = useState<string | null>(null);
  const [confirmProfile, setConfirmProfile] = useState<string | null>(null);
  const [closingProfile, setClosingProfile] = useState(false);
  const [editProfileId, setEditProfileId] = useState<string | null>(null);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [closingEdit, setClosingEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState<string>(DEFAULT_PROFILE_ICON);
  const [editAccent, setEditAccent] = useState<string | null>(null);
  const [editGames, setEditGames] = useState<string[]>([]);
  const [gameDraft, setGameDraft] = useState("");
  const [showBrowser, setShowBrowser] = useState(false);
  const [pickHint, setPickHint] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<"general" | "appearance" | "automation">("general");

  const closeProfileModal = () => {
    setClosingProfile(true);
    setTimeout(() => { setConfirmProfile(null); setClosingProfile(false); }, 320);
  };

  const openEditProfile = (id: string) => {
    const p = profiles[id];
    if (!p) return;
    setEditName(p.display_name);
    setEditIcon(p.icon || DEFAULT_PROFILE_ICON);
    setEditAccent(normalizeProfileAccent(p.accent) ?? null);
    // Una sola lista Games: unión de autoApps + playApps (mismo contenido).
    const unionGames = (p: Profile): string[] => [...new Set([...(p.autoApps ?? []), ...(p.playApps ?? [])])]
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length > 0);
    setEditGames(unionGames(p));
    setGameDraft("");
    setShowBrowser(false);
    setPickHint(null);
    setEditTab("general");
    setEditProfileId(id);
    setCreatingProfile(false);
    setOpenMenuId(null);
  };

  const closeEditProfile = (revertPreview = true) => {
    setShowBrowser(false);
    setArmedCapture(false);
    if (revertPreview) {
      // Revertir el preview del picker al efectivo del perfil activo.
      const perProfile = normalizeProfileAccent(profiles[active]?.accent);
      applyAccent(perProfile ? resolveAccent(perProfile).hex : accentHex);
    }
    setClosingEdit(true);
    setTimeout(() => { setEditProfileId(null); setCreatingProfile(false); setClosingEdit(false); }, 320);
  };

  // Picker con preview en vivo: pinta al elegir, Save lo hace definitivo,
  // Cancel (closeEditProfile) revierte al efectivo del activo.
  const pickEditAccent = (v: string | null) => {
    const norm = v === null ? null : normalizeProfileAccent(v) ?? null;
    // Si el custom venía en minúsculas, normalizar a mayúsculas.
    setEditAccent(norm);
    if (norm) applyAccent(resolveAccent(norm).hex);
    else applyAccent(accentHex);
  };

  const saveEditProfile = () => {
    const name = editName.trim();
    if (!name) return;
    const games = editGames.length > 0 ? [...editGames] : undefined;
    const autoApps = games;
    const playApps = games;
    const accent = normalizeProfileAccent(editAccent) ?? undefined;
    if (creatingProfile) {
      const id = `custom_${Date.now().toString(36)}`;
      const p: Profile = { display_name: name, description: "Custom layout", icon: editIcon || DEFAULT_PROFILE_ICON, mappings: [], autoApps, playApps, accent };
      setProfiles({ ...profiles, [id]: p });
      setActive(id);
      setOpenMenuId(null);
      syncEngine([]);
      setCreatingProfile(false);
      closeEditProfile(false);
      return;
    }
    if (!editProfileId || !profiles[editProfileId]) return;
    setProfiles({
      ...profiles,
      [editProfileId]: {
        ...profiles[editProfileId],
        display_name: name,
        icon: editIcon || DEFAULT_PROFILE_ICON,
        autoApps,
        playApps,
        accent,
      },
    });
    closeEditProfile(false);
  };

  const addGameApp = () => {
    const norm = gameDraft.trim().toLowerCase();
    if (!norm || editGames.includes(norm)) return;
    setEditGames([...editGames, norm]);
    setGameDraft("");
  };

  /** Captura armada: clic, luego clickea el juego (20s). Sin prisa. */
  const [armedCapture, setArmedCapture] = useState<boolean>(false);
  const armedAt = useRef(0);
  const armCapture = () => {
    setPickHint(null);
    armedAt.current = Date.now();
    setArmedCapture(true);
  };
  useEffect(() => {
    if (!armedCapture) return;
    let stop = false;
    const finish = (hint: string) => {
      setPickHint(hint);
      setArmedCapture(false);
    };
    const id = setInterval(async () => {
      if (stop) return;
      if (Date.now() - armedAt.current > 20000) {
        finish("Timed out — no other app focused.");
        return;
      }
      try {
        const fg = await invoke<{ exe: string; title: string }>("get_foreground_app");
        const cand = (fg.exe || "").trim().toLowerCase();
        if (stop || !cand || cand === "lefty.exe") return;
        setEditGames((prev) => (prev.includes(cand) ? prev : [...prev, cand]));
        finish(`Added ${cand} from the game window.`);
      } catch {
        /* reintentar en el próximo tick */
      }
    }, 500);
    return () => { stop = true; clearInterval(id); };
  }, [armedCapture]);

  const createProfile = () => {
    // Modo borrador: no se crea nada hasta Save.
    setEditName("");
    setEditIcon(DEFAULT_PROFILE_ICON);
    setEditAccent(null);
    setEditGames([]);
    setGameDraft("");
    setShowBrowser(false);
    setPickHint(null);
    setEditTab("general");
    setEditProfileId(null);
    setCreatingProfile(true);
    setOpenMenuId(null);
  };

  const duplicateProfile = (id: string) => {
    const src = profiles[id];
    if (!src) return;
    let nid = `${id}_copy`;
    for (let i = 2; nid in profiles; i++) nid = `${id}_copy${i}`;
    const mappings = src.mappings.map(([s, d]) => [s, d] as Mapping);
    const games = [...new Set([...(src.autoApps ?? []), ...(src.playApps ?? [])])];
    const gamesOrUndef = games.length > 0 ? games : undefined;
    const p: Profile = {
      ...src,
      display_name: `${src.display_name} copy`,
      mappings,
      autoApps: gamesOrUndef,
      playApps: gamesOrUndef,
      disabled: pruneDisabledSources(mappings, src.disabled),
    };
    setProfiles({ ...profiles, [nid]: p });
    setActive(nid);
    setOpenMenuId(null);
    syncProfile(p);
  };

  const confirmDeleteProfile = (id: string) => {    if (Object.keys(profiles).length <= 1) return;
    const next = { ...profiles };
    delete next[id];
    const ids = Object.keys(next);
    setProfiles(next);
    setOpenMenuId(null);
    if (active === id && ids.length > 0) {
      setActive(ids[0]);
      syncProfile(next[ids[0]]);
    }
    closeProfileModal();
  };

  // Mover en la lista conservando el orden exacto.
  const moveProfile = (id: string, dir: -1 | 1) => {
    const ids = Object.keys(profiles);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const next: ProfilesMap = {};
    for (const k of ids) next[k] = profiles[k];
    setProfiles(next);
    setOpenMenuId(null);
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
          <div data-tour="switch" className="hidden sm:block">{renderStatusSwitch(false)}</div>
          <div data-tour="switch" className="sm:hidden">{renderStatusSwitch(true)}</div>
          <div data-tour="settings" className="relative">
            <button onClick={()=> { setSettingsTab("general"); setShowSettings(true); }} aria-label="Settings" className="w-11 h-11 rounded-full bg-surface-container-high border border-outline-variant hover:bg-surface-container-highest grid place-items-center text-on-surface-variant hover:text-on-surface m3-pressable active:scale-90 transition-transform duration-150 hover:rotate-90">
              <Settings size={18} />
            </button>
            {updateInfo && (
              <span title={`Update available: ${updateInfo.latest}`} className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-surface-container animate-pulse" />
            )}
          </div>
        </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-5 p-5 max-w-[1440px] w-full mx-auto overflow-hidden">
        <aside data-tour="profiles" className="col-span-12 lg:col-span-3 bg-surface-container rounded-[28px] border border-outline-variant flex flex-col overflow-hidden min-h-0 shadow-m3-1">
          <div className="px-4 pt-4 pb-3 border-b border-outline-variant flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[11px] font-display font-medium tracking-widest text-on-surface">PROFILES</h2>
              <p className="text-[11px] text-on-surface-variant mt-1">Choose your left-handed layout</p>
            </div>
            <button onClick={createProfile} title="New profile" aria-label="New profile" className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant grid place-items-center text-on-surface-variant hover:text-on-primary hover:bg-primary hover:border-primary shrink-0 m3-pressable active:scale-90 transition-colors">
              <Plus size={14} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-2.5 pb-3 space-y-1.5">
            {Object.entries(profiles).map(([key, p], idx, arr) => {
              const selected = active === key;
              const menuOpen = openMenuId === key;
              const canUp = idx > 0;
              const canDown = idx < arr.length - 1;
              const customAccent = normalizeProfileAccent(p.accent);
              const customHex = customAccent ? resolveAccent(customAccent).hex : null;
              const customPainted = customHex && highContrast ? adjustForContrast(customHex) : customHex;
              return (
              <div key={key} className="relative">
                <button onClick={() => { setActive(key); setOpenMenuId(null); }} className={`w-full text-left p-3 rounded-xl border flex items-center gap-3 ${selected ? "bg-primary text-on-primary border-primary shadow-m3-1" : "bg-surface-container-high border-outline-variant hover:bg-surface-container-highest text-on-surface"}`}>
                  <span className={`relative w-8 h-8 grid place-items-center rounded-lg font-medium flex-shrink-0 ${selected ? "bg-on-primary text-primary" : "bg-secondary-container text-on-secondary-container"}`}><ProfileGlyph icon={p.icon} size={15} />
                    {customPainted && <span title="Custom accent" className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-container" style={{ backgroundColor: customPainted }} />}
                  </span>
                  <div className="flex-1 min-w-0 pr-6">
                    <div className={`text-[13px] font-medium leading-none truncate ${selected ? "text-on-primary" : "text-on-surface"}`}>{p.display_name}</div>
                    <div className={`text-[11px] mt-1 truncate ${selected ? "text-on-primary/80" : "text-on-surface-variant"}`}>{p.mappings.length} mappings{((p.autoApps?.length ?? 0) > 0 || (p.playApps?.length ?? 0) > 0) ? " · games" : ""}{customHex ? " · accent" : ""}</div>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : key); }}
                  title="Profile options"
                  aria-label="Profile options"
                  aria-expanded={menuOpen}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-full transition-all duration-150 hover:scale-110 active:scale-95 ${selected ? "text-on-primary hover:bg-on-primary hover:text-primary" : "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"}`}
                >
                  <MoreHorizontal size={15} />
                </button>
                {copiedTick === key && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-full bg-primary text-on-primary animate-m3-scale-in" aria-live="polite">
                    <Check size={15} strokeWidth={3} />
                  </span>
                )}
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40 cursor-default" onClick={() => setOpenMenuId(null)} />
                    <div className="absolute right-2 top-10 z-50 w-44 rounded-xl bg-surface-container-highest border border-outline-variant shadow-m3-2 p-1 animate-m3-fade-in" role="menu">
                      <button onClick={() => openEditProfile(key)} role="menuitem" className="w-full h-9 px-3 rounded-lg text-[12px] font-medium flex items-center gap-2 text-on-surface hover:bg-surface-container-high">
                        <Pencil size={13} /> Edit
                      </button>
                      <button onClick={() => moveProfile(key, -1)} disabled={!canUp} role="menuitem" className="w-full h-9 px-3 rounded-lg text-[12px] font-medium flex items-center gap-2 text-on-surface hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed">
                        <ArrowUp size={13} /> Move up
                      </button>
                      <button onClick={() => moveProfile(key, 1)} disabled={!canDown} role="menuitem" className="w-full h-9 px-3 rounded-lg text-[12px] font-medium flex items-center gap-2 text-on-surface hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed">
                        <ArrowDown size={13} /> Move down
                      </button>
                      <button onClick={() => duplicateProfile(key)} role="menuitem" className="w-full h-9 px-3 rounded-lg text-[12px] font-medium flex items-center gap-2 text-on-surface hover:bg-surface-container-high">
                        <Copy size={13} /> Duplicate
                      </button>
                      <button
                        onClick={async () => {
                          setOpenMenuId(null);
                          try {
                            await copyText(encodeShareCode(key, p));
                            setCopiedTick(key);
                            window.setTimeout(() => setCopiedTick((c) => (c === key ? null : c)), 1600);
                          } catch {
                            /* clipboard bloqueado: el usuario puede reintentar */
                          }
                        }}
                        role="menuitem"
                        className="w-full h-9 px-3 rounded-lg text-[12px] font-medium flex items-center gap-2 text-on-surface hover:bg-surface-container-high"
                      >
                        <Share2 size={13} /> Share
                      </button>
                      <button
                        onClick={() => { setOpenMenuId(null); setConfirmProfile(key); }}
                        disabled={Object.keys(profiles).length <= 1}
                        role="menuitem"
                        className="w-full h-9 px-3 rounded-lg text-[12px] font-medium flex items-center gap-2 text-on-surface hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
              );
            })}
          </div>
        </aside>

        <main className="col-span-12 lg:col-span-9 bg-surface-container rounded-[28px] border border-outline-variant flex flex-col overflow-hidden min-h-0 shadow-m3-1">
          <div className="px-6 py-5 border-b border-outline-variant">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[17px] font-display font-semibold tracking-tight text-on-surface flex items-center gap-2"><Keyboard size={16} className="text-on-surface-variant"/> {prof.display_name}{autoHeld && !enabled && (<span title="Paused automatically — return to your games or resume manually" className="text-[10px] font-medium tracking-widest text-on-surface-variant border border-outline-variant px-1.5 py-0.5 rounded-full">AUTO</span>)}</h2>
                <p className="text-[13px] text-on-surface-variant mt-1.5 leading-relaxed max-w-[560px]">{prof.description}</p>
              </div>
               <button data-tour="add" onClick={()=>setShowAdd(true)} className="hidden sm:inline-flex h-9 px-5 rounded-full bg-primary text-on-primary text-[13px] font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-all duration-150 m3-pressable active:scale-[0.96] hover:scale-[1.02]"><Plus size={15}/> Add</button>
            </div>
          </div>
          <div className="px-6 py-3 flex items-center justify-between gap-2 text-[11px] font-medium tracking-widest text-on-surface-variant border-b border-outline-variant bg-surface-container-high">
            <span>{filterQuery ? `${visibleMappings.length} OF ${prof.mappings.length}` : `${prof.mappings.length} MAPPINGS`}{pausedCount > 0 ? ` · ${pausedCount} PAUSED` : ""}</span>
            <span className="flex items-center gap-2">
              <button onClick={() => { if (!showFilter) setShowFilter(true); else filterRef.current?.focus(); }} title="Filter mappings" aria-label="Filter mappings" aria-expanded={showFilter} className={`w-7 h-7 grid place-items-center rounded-full transition-colors ${showFilter ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"}`}>
                <Search size={13} />
              </button>
              <span className="font-normal tracking-wide text-outline hidden md:inline">SOURCE → TARGET</span>
            </span>
          </div>
          {showFilter && (
            <>
              <div className="fixed inset-0 z-30 cursor-default" onClick={() => { setMapFilter(""); setShowFilter(false); }} />
              <div className="relative z-40 px-4 sm:px-6 py-2 border-b border-outline-variant bg-surface-container-high flex items-center gap-2 animate-m3-fade-in">
              <input
                ref={filterRef}
                value={mapFilter}
                onChange={(e) => setMapFilter(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setMapFilter(""); setShowFilter(false); } }}
                placeholder="Filter mappings…"
                aria-label="Filter mappings"
                className="flex-1 h-8 bg-transparent font-mono text-[13px] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
              />
              {mapFilter && (
                <button onClick={() => { setMapFilter(""); setShowFilter(false); }} aria-label="Clear filter" className="w-7 h-7 grid place-items-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface">
                  <X size={13} />
                </button>
              )}
            </div>
            </>
          )}
          <div className="flex-1 min-h-0 overflow-auto p-4 space-y-2 bg-surface-container">
            {prof.mappings.length===0 ? (
              <div className="py-20 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-surface-container-high border border-outline-variant grid place-items-center text-outline"><Keyboard size={22}/></div>
                <p className="text-[15px] font-medium text-on-surface mt-4">No mappings</p>
                <p className="text-[13px] text-on-surface-variant mt-1">Add your first remap to start</p>
                <button onClick={()=>setShowAdd(true)} className="mt-5 h-10 px-5 rounded-full bg-primary text-on-primary text-[13px] font-medium m3-pressable active:scale-[0.96] transition-transform duration-150">Add mapping</button>
              </div>
            ) : visibleMappings.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[13px] text-on-surface-variant">No mappings match “{mapFilter.trim()}”</p>
                <button onClick={() => { setMapFilter(""); setShowFilter(false); }} className="mt-3 h-8 px-4 rounded-full bg-surface-container-high border border-outline-variant text-on-surface text-[12px] font-medium m3-pressable active:scale-[0.97]">Clear filter</button>
              </div>
            ) : visibleMappings.map(([s, d]) => {
              const paused = pausedSrcs.has(s);
              return (
              <div key={s} className={`h-[58px] bg-surface-container-high border border-outline-variant rounded-2xl flex items-center px-4 gap-3 ${paused ? "opacity-60" : ""}`}>
                <span className="px-4 py-1.5 rounded-full bg-surface-container-highest border border-outline-variant text-[13px] font-mono font-medium min-w-[76px] text-center text-on-surface">{s}</span>
                <span className={`w-8 h-8 rounded-full grid place-items-center text-[14px] font-medium ${paused ? "bg-surface-container-highest border border-outline-variant text-on-surface-variant" : "bg-primary text-on-primary shadow-m3-1"}`}>→</span>
                <span className="px-4 py-1.5 rounded-full bg-primary-container text-on-primary-container text-[13px] font-mono font-medium min-w-[76px] text-center border border-outline-variant">{d}</span>
                <span className="hidden sm:block text-[12px] text-on-surface-variant ml-1">{paused ? "paused" : "remap"}</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button onClick={()=>toggleMapping(s)} title={paused ? "Resume this mapping" : "Pause this mapping"} aria-label={paused ? `Resume ${s}` : `Pause ${s}`} aria-pressed={!paused} className="w-9 h-9 grid place-items-center rounded-full bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:bg-secondary-container hover:text-on-secondary-container">{paused ? <Play size={14}/> : <Pause size={14}/>}</button>
                  <button onClick={()=>swapMap(s,d)} title="Swap" className="w-9 h-9 grid place-items-center rounded-full bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:bg-secondary-container hover:text-on-secondary-container"><ArrowLeftRight size={14}/></button>
                  <button onClick={()=> setConfirmDelete(s)} title="Delete" className="w-9 h-9 grid place-items-center rounded-full bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:bg-primary hover:text-on-primary hover:border-primary transition-colors"><Trash2 size={14}/></button>
                </div>
              </div>
              );
            })}
          </div>
          <div className="p-3 bg-surface-container-high border-t border-outline-variant flex items-center justify-end sm:hidden">
            <button data-tour="add" onClick={()=>setShowAdd(true)} className="h-8 px-4 rounded-full bg-primary text-on-primary text-[12px] font-medium flex items-center gap-1.5"><Plus size={14}/>Add</button>
          </div>
        </main>
      </div>
      {(showAdd || closingAdd) && (
        <div className={`fixed inset-0 bg-scrim/60 backdrop-blur-sm grid place-items-center z-50 p-4 m3-backdrop ${closingAdd ? "animate-m3-backdrop-out" : "animate-m3-backdrop-in"}`} onClick={closeAdd}>
          <div className={`w-full max-w-[540px] max-h-[calc(90vh-2rem)] overflow-y-auto bg-surface-container rounded-[28px] border border-outline-variant p-6 shadow-m3-3 m3-modal ${closingAdd ? "animate-m3-slide-down" : "animate-m3-slide-up"}`} onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-[14px] bg-primary text-on-primary grid place-items-center shadow-m3-1 shrink-0"><Plus size={18}/></span>
              <div>
                <h3 className="text-[16px] font-display font-semibold text-on-surface leading-none">Add mapping</h3>
                <p className="text-[11px] text-on-surface-variant mt-1.5">Pick the key you press and what it should type</p>
              </div>
            </div>
            {capturing && <p className="mt-4 text-[12px] font-medium text-on-tertiary-container bg-tertiary-container border border-outline-variant rounded-full px-3 py-2 text-center animate-pulse">Capturing… press any key ({capturing === "src" ? "source" : "target"})</p>}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 mt-5 items-stretch">
              <div data-tour="add-source" className={`rounded-2xl border p-3.5 flex flex-col gap-2.5 transition-colors duration-200 ${capturing === "src" ? "bg-surface-container-high border-primary shadow-m3-1" : "bg-surface-container-high border-outline-variant"}`}>
                <span className="text-[10px] font-medium tracking-widest text-on-surface-variant">SOURCE · YOU PRESS</span>
                <div className={`h-16 rounded-xl border grid place-items-center font-mono font-medium px-2 text-center truncate transition-colors ${capturing === "src" ? "bg-primary-container text-on-primary-container border-primary" : "bg-surface-container-highest border-outline-variant text-on-surface"} ${srcKey.length > 6 ? "text-[13px]" : "text-[22px]"}`}>{capturing === "src" ? "?" : srcKey}</div>
                <select value={srcKey} onChange={e=>setSrcKey(e.target.value)} aria-label="Source key" aria-invalid={!mappingValidation.canSave} className={`w-full h-10 rounded-xl bg-surface-container-highest border text-[12px] font-mono px-3 text-on-surface focus:outline-none transition-colors duration-200 ${!mappingValidation.canSave ? "border-error/70 focus:border-error" : "border-outline-variant focus:border-primary"}`}>
                  {allKeys.map(k=><option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={()=>{ setTesting(false); setCapturing("src"); }} className={`w-full h-10 rounded-xl text-[12px] font-medium border flex items-center justify-center gap-1.5 transition-colors ${capturing==="src" ? "bg-primary text-on-primary border-primary" : "bg-surface-container-highest border-outline-variant text-on-surface hover:border-primary"}`}><Keyboard size={13}/>Capture</button>
              </div>
              <div className="flex items-center">
                <span className="w-9 h-9 rounded-full bg-primary text-on-primary grid place-items-center text-[15px] font-medium shadow-m3-1">→</span>
              </div>
              <div data-tour="add-target" className={`rounded-2xl border p-3.5 flex flex-col gap-2.5 transition-colors duration-200 ${capturing === "dst" ? "bg-surface-container-high border-primary shadow-m3-1" : "bg-surface-container-high border-outline-variant"}`}>
                <span className="text-[10px] font-medium tracking-widest text-on-surface-variant">TARGET · IT TYPES</span>
                <div className={`h-16 rounded-xl border grid place-items-center font-mono font-medium px-2 text-center truncate transition-colors ${capturing === "dst" ? "bg-primary-container text-on-primary-container border-primary" : "bg-surface-container-highest border-outline-variant text-on-surface"} ${dstKey.length > 6 ? "text-[13px]" : "text-[22px]"}`}>{capturing === "dst" ? "?" : dstKey}</div>
                <select value={dstKey} onChange={e=>setDstKey(e.target.value)} aria-label="Target key" aria-invalid={mappingValidation.conflict.kind === "self"} className={`w-full h-10 rounded-xl bg-surface-container-highest border text-[12px] font-mono px-3 text-on-surface focus:outline-none transition-colors duration-200 ${mappingValidation.conflict.kind === "self" ? "border-error/70 focus:border-error" : "border-outline-variant focus:border-primary"}`}>
                  {allKeys.map(k=><option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={()=>{ setTesting(false); setCapturing("dst"); }} className={`w-full h-10 rounded-xl text-[12px] font-medium border flex items-center justify-center gap-1.5 transition-colors ${capturing==="dst" ? "bg-primary text-on-primary border-primary" : "bg-surface-container-highest border-outline-variant text-on-surface hover:border-primary"}`}><Keyboard size={13}/>Capture</button>
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
            <div className="mt-4 rounded-2xl border border-outline-variant bg-surface-container-high overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  if (testOpen) setTesting(false);
                  setTestOpen((o) => !o);
                }}
                aria-expanded={testOpen}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-3"
              >
                <span className="text-[10px] font-medium tracking-widest text-on-surface-variant">TRY IT · WHAT THE GAME SEES</span>
                <ChevronDown size={14} className={`text-on-surface-variant transition-transform shrink-0 ${testOpen ? "rotate-180" : ""}`} />
              </button>
              {testOpen && (
                <div className="px-3.5 pb-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-on-surface-variant">Check keys against {prof.display_name} without leaving the app.</p>
                    <button
                      onClick={() => {
                        if (testing) setTesting(false);
                        else { setCapturing(null); setTesting(true); }
                      }}
                      className={`h-8 px-4 rounded-full text-[12px] font-medium m3-pressable active:scale-[0.97] transition-colors shrink-0 ${testing ? "bg-surface-container-highest border border-outline-variant text-on-surface hover:border-primary" : "bg-primary text-on-primary shadow-m3-1"}`}
                    >
                      {testing ? "Stop" : "Test"}
                    </button>
                  </div>
                  {testing && !testKey && (
                    <p className="mt-2.5 text-[12px] font-medium text-on-surface-variant animate-pulse">Press any key…</p>
                  )}
                  {testKey && (
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap" aria-live="polite">
                      <span className="px-4 py-1.5 rounded-full bg-surface-container-highest border border-outline-variant text-[13px] font-mono font-medium min-w-[64px] text-center text-on-surface">{testKey}</span>
                      <span className="w-7 h-7 rounded-full bg-primary text-on-primary grid place-items-center text-[13px] font-medium">→</span>
                      {(() => {
                        const entry = prof.mappings.find(([s]) => s === testKey);
                        if (!entry) return <span className="text-[12px] text-on-surface-variant">passes through unchanged</span>;
                        if (pausedSrcs.has(testKey)) return <span className="text-[12px] text-on-surface-variant">paused in this profile — resume it to use</span>;
                        return <span className="px-4 py-1.5 rounded-full bg-primary-container text-on-primary-container text-[13px] font-mono font-medium min-w-[64px] text-center border border-outline-variant">{entry[1]}</span>;
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={closeAdd} className="flex-1 h-12 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-container-high text-[14px] font-medium shadow-sm m3-pressable active:scale-[0.97]">Cancel</button>
              <button data-tour="add-save" onClick={addMap} disabled={!mappingValidation.canSave} className="flex-1 h-12 rounded-full bg-primary text-on-primary text-[14px] font-medium shadow-m3-1 hover:shadow-m3-2 active:scale-[0.97] m3-pressable transition-all duration-150 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:scale-100">Save mapping</button>
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
      {(confirmProfile || closingProfile) && profiles[confirmProfile ?? ""] && (
        <div className={`fixed inset-0 bg-scrim/70 backdrop-blur-sm grid place-items-center z-[60] p-4 m3-backdrop ${closingProfile ? "animate-m3-backdrop-out" : "animate-m3-backdrop-in"}`} onClick={closeProfileModal}>
          <div className={`w-full max-w-[440px] bg-surface-container rounded-[28px] border border-outline-variant shadow-m3-3 p-6 m3-modal ${closingProfile ? "animate-m3-scale-out" : "animate-m3-scale-in"}`} onClick={e=>e.stopPropagation()}>
            <div className="flex items-start gap-4">
              <span className="w-12 h-12 rounded-2xl bg-primary text-on-primary grid place-items-center flex-shrink-0 shadow-m3-1 animate-m3-shake"><Trash2 size={22}/></span>
              <div className="flex-1 min-w-0">
                <h3 className="text-[17px] font-display font-medium text-on-surface leading-snug">Delete this profile?</h3>
                <p className="text-[13px] leading-relaxed text-on-surface-variant mt-2"><span className="font-medium text-on-surface">{profiles[confirmProfile ?? ""].display_name}</span> with <span className="font-medium text-on-surface">{profiles[confirmProfile ?? ""].mappings.length} mappings</span> will be permanently deleted. This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={closeProfileModal} className="flex-1 h-12 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-container-high text-[14px] font-medium m3-pressable active:scale-[0.97]">Cancel</button>
              <button onClick={()=> confirmProfile && confirmDeleteProfile(confirmProfile)} className="flex-1 h-12 rounded-full bg-primary text-on-primary text-[14px] font-medium shadow-m3-1 hover:shadow-m3-2 active:scale-[0.97] m3-pressable transition-all duration-150 hover:scale-[1.01]">Delete</button>
            </div>
          </div>
        </div>
      )}
      {(creatingProfile || ((editProfileId || closingEdit) && editProfileId && profiles[editProfileId])) && (
        <div className={`fixed inset-0 bg-scrim/60 backdrop-blur-sm grid place-items-center z-[60] p-4 m3-backdrop ${closingEdit ? "animate-m3-backdrop-out" : "animate-m3-backdrop-in"}`} onClick={() => closeEditProfile()}>
          <div className={`w-full max-w-[480px] h-[min(600px,88vh)] flex flex-col bg-surface-container rounded-[28px] border border-outline-variant p-6 shadow-m3-3 m3-modal ${closingEdit ? "animate-m3-slide-down" : "animate-m3-slide-up"}`} onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3 shrink-0">
              <span className="w-10 h-10 rounded-[14px] bg-primary text-on-primary grid place-items-center shadow-m3-1 shrink-0"><Pencil size={17}/></span>
              <div>
                <h3 className="text-[16px] font-display font-semibold text-on-surface leading-none">{creatingProfile ? "New profile" : "Edit profile"}</h3>
                <p className="text-[11px] text-on-surface-variant mt-1.5">{creatingProfile ? "Design it, Save creates it" : `${profiles[editProfileId ?? ""].mappings.length} mappings · changes apply instantly`}</p>
              </div>
            </div>
            <div className="mt-4 text-[10px] font-medium tracking-widest text-on-surface-variant shrink-0">PREVIEW</div>
            {(() => {
              // Replica exacta de la fila del sidebar: cómo se verá en la lista.
              const isActive = !creatingProfile && editProfileId === active;
              const count = creatingProfile ? 0 : profiles[editProfileId ?? ""]?.mappings.length ?? 0;
              const accentKey = normalizeProfileAccent(editAccent);
              const dotHex = accentKey ? resolveAccent(accentKey).hex : null;
              const painted = dotHex && highContrast ? adjustForContrast(dotHex) : dotHex;
              return (
                <div className={`mt-2 w-full text-left p-3 rounded-xl border flex items-center gap-3 shrink-0 ${isActive ? "bg-primary text-on-primary border-primary shadow-m3-1" : "bg-surface-container-high border-outline-variant text-on-surface"}`}>
                  <span className={`relative w-8 h-8 grid place-items-center rounded-lg font-medium shrink-0 ${isActive ? "bg-on-primary text-primary" : "bg-secondary-container text-on-secondary-container"}`}>
                    <ProfileGlyph icon={editIcon} size={15} />
                    {painted && <span title="Custom accent" className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-container" style={{ backgroundColor: painted }} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-medium leading-none truncate ${isActive ? "text-on-primary" : "text-on-surface"}`}>{editName.trim() || "…"}</div>
                    <div className={`text-[11px] mt-1 truncate ${isActive ? "text-on-primary/80" : "text-on-surface-variant"}`}>{count} mappings{editGames.length > 0 ? " · games" : ""}{painted ? " · accent" : ""}</div>
                  </div>
                </div>
              );
            })()}
            <form onSubmit={(e) => { e.preventDefault(); if (editName.trim()) saveEditProfile(); }} className="flex flex-col flex-1 min-h-0">
              <div className="mt-4 flex gap-1 p-1 rounded-full bg-surface-container-high border border-outline-variant shrink-0" role="tablist" aria-label="Profile sections">
                {(["general", "appearance", "automation"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={editTab === t}
                    onClick={() => setEditTab(t)}
                    className={`flex-1 h-8 rounded-full text-[12px] font-medium capitalize transition-all m3-pressable active:scale-[0.97] ${editTab === t ? "bg-primary text-on-primary shadow-m3-1" : "text-on-surface-variant hover:text-on-surface"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
              {editTab === "general" && (
              <>
              <div className="mt-4 text-[10px] font-medium tracking-widest text-on-surface-variant">ICON</div>
              <div className="mt-2 grid grid-cols-8 gap-1.5 max-h-[132px] overflow-auto" role="radiogroup" aria-label="Profile icon">
                {PROFILE_ICONS.map(({ name, Icon }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setEditIcon(name)}
                    title={name}
                    aria-checked={editIcon === name}
                    className={`h-10 grid place-items-center rounded-xl border transition-all m3-pressable active:scale-90 ${editIcon === name ? "bg-primary text-on-primary border-primary shadow-m3-1 scale-105" : "text-on-surface-variant border-outline-variant hover:bg-surface-container-high hover:text-on-surface"}`}
                  ><Icon size={16} /></button>
                ))}
              </div>
              <div className="mt-4 text-[10px] font-medium tracking-widest text-on-surface-variant">NAME</div>
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={40}
                placeholder="Profile name"
                aria-label="Profile name"
                className="mt-2 w-full h-11 rounded-xl bg-surface-container-highest border border-outline-variant text-[13px] font-medium px-3.5 text-on-surface focus:outline-none focus:border-primary transition-colors"
              />
              </>
              )}
              {editTab === "appearance" && (
              <>
              <div className="mt-4 text-[10px] font-medium tracking-widest text-on-surface-variant">ACCENT</div>
              <div className="mt-2 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Profile accent">
                <button
                  type="button"
                  role="radio"
                  aria-checked={editAccent === null}
                  title={`Use global (${accent.name})`}
                  onClick={() => pickEditAccent(null)}
                  className={`h-9 px-3 rounded-full border text-[12px] font-medium transition-all m3-pressable active:scale-95 ${editAccent === null ? "bg-primary text-on-primary border-primary shadow-m3-1" : "bg-surface-container-highest border-outline-variant text-on-surface hover:border-primary"}`}
                >
                  Global
                </button>
                {ACCENT_PRESETS.map((p) => {
                  const selected = editAccent === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={p.name}
                      title={p.name}
                      onClick={() => pickEditAccent(p.id)}
                      style={{ backgroundColor: p.hex }}
                      className={`w-9 h-9 rounded-full grid place-items-center border border-outline-variant m3-pressable active:scale-90 transition-transform hover:scale-110 ${selected ? "ring-2 ring-offset-2 ring-offset-surface-container ring-white/80 scale-105" : "opacity-80 hover:opacity-100"}`}
                    >
                      {selected && <span style={{ color: contrastOn(p.hex), fontSize: 14, fontWeight: 700 }}>✓</span>}
                    </button>
                  );
                })}
                <label
                  title="Custom color"
                  className={`w-9 h-9 rounded-full grid place-items-center border border-outline-variant cursor-pointer m3-pressable active:scale-90 transition-transform hover:scale-110 ${editAccent !== null && editAccent.startsWith("#") ? "ring-2 ring-offset-2 ring-offset-surface-container ring-white/80 scale-105" : "opacity-80 hover:opacity-100"}`}
                  style={{ background: "conic-gradient(#EF4444,#F59E0B,#84CC16,#06B6D4,#3B82F6,#8B5CF6,#EC4899,#EF4444)" }}
                >
                  <span className="sr-only">Custom color</span>
                  <input
                    type="color"
                    aria-label="Custom profile color"
                    className="sr-only"
                    value={editAccent !== null && editAccent.startsWith("#") ? editAccent : accentHex}
                    onChange={(e) => pickEditAccent(e.target.value.toUpperCase())}
                  />
                  <span className="text-[13px] font-bold text-white drop-shadow">·</span>
                </label>
              </div>
              <p className="text-[11px] text-on-surface-variant mt-1.5">
                {editAccent === null ? `Using global (${accent.name}).` : `Overrides global (${accent.name}) when this profile is active.`} Preview is live.
              </p>
              </>
              )}
              {editTab === "automation" && (
              <>
              <div className="mt-4 text-[10px] font-medium tracking-widest text-on-surface-variant">GAMES</div>
              <div className="mt-2">
                {editGames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {editGames.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-mono">
                        {a}
                        <button type="button" onClick={() => setEditGames(editGames.filter((x) => x !== a))} aria-label={`Remove ${a}`} className="w-4 h-4 grid place-items-center rounded-full hover:bg-on-secondary-container/20">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={gameDraft}
                    onChange={(e) => setGameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGameApp(); } }}
                    placeholder="e.g. eldenring.exe"
                    aria-label="Game exe or title"
                    className="flex-1 h-10 rounded-xl bg-surface-container-highest border border-outline-variant text-[12px] font-mono px-3 text-on-surface focus:outline-none focus:border-primary transition-colors"
                  />
                  <button type="button" onClick={addGameApp} className="h-10 px-4 rounded-xl bg-surface-container-highest border border-outline-variant text-[12px] font-medium text-on-surface hover:border-primary transition-colors">Add</button>
                </div>
                <p className="text-[11px] text-on-surface-variant mt-1.5">This profile switches and works only here. Empty = manual everywhere.</p>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => { if (armedCapture) { setArmedCapture(false); setPickHint(null); } else armCapture(); }} title="Arm capture, then click the game" className={`h-8 px-3.5 rounded-full border text-[11px] font-medium transition-colors m3-pressable active:scale-[0.97] ${armedCapture ? "bg-primary text-on-primary border-primary animate-pulse" : "bg-surface-container-highest border-outline-variant text-on-surface hover:border-primary"}`}>{armedCapture ? "Click the game… (cancel)" : "Use current app"}</button>
                  <button type="button" onClick={() => setShowBrowser(true)} title="Browse installed games" className="h-8 px-3.5 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface text-[11px] font-medium hover:border-primary transition-colors m3-pressable active:scale-[0.97]">Browse installed</button>
                </div>
                {pickHint && (
                  <p className="text-[11px] text-on-surface-variant mt-1.5" aria-live="polite">{pickHint}</p>
                )}
              </div>
              </>
              )}
              </div>
              <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant shrink-0">
                <button type="button" onClick={() => closeEditProfile()} className="flex-1 h-12 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-container-high text-[14px] font-medium m3-pressable active:scale-[0.97]">Cancel</button>
                <button type="submit" disabled={!editName.trim()} className="flex-1 h-12 rounded-full bg-primary text-on-primary text-[14px] font-medium shadow-m3-1 hover:shadow-m3-2 active:scale-[0.97] m3-pressable transition-all duration-150 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:scale-100">Save changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showBrowser && (
        <GameBrowser
          title="Add game"
          onPick={(key) => {
            if (!editGames.includes(key)) setEditGames([...editGames, key]);
          }}
          isTaken={(key) => editGames.includes(key)}
          onClose={() => setShowBrowser(false)}
        />
      )}
      {showOnboard && (
        <GuidedTour
          onDone={finishTour}
          onStepEnter={handleTourStep}
          profiles={Object.entries(profiles).map(([id, p]) => ({ id, name: p.display_name, icon: p.icon }))}
          activeId={active}
          onSelectProfile={(id) => setActive(id)}
        />
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
              <div className="flex-1 h-[min(460px,60vh)] overflow-auto p-4 bg-surface-container">
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
                  <div className="animate-m3-fade-in space-y-3">
                    <AccentColorSection />
                    {normalizeProfileAccent(prof.accent) && (
                      <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4 flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: highContrast ? adjustForContrast(resolveAccent(normalizeProfileAccent(prof.accent)!).hex) : resolveAccent(normalizeProfileAccent(prof.accent)!).hex }} />
                        <p className="flex-1 text-[11px] leading-relaxed text-on-surface-variant">
                          <span className="font-medium text-on-surface">{prof.display_name}</span> overrides global with its own accent.
                        </p>
                        <button
                          onClick={() => {
                            const next = { ...profiles };
                            const cur = { ...next[active] };
                            delete cur.accent;
                            next[active] = cur;
                            setProfiles(next);
                          }}
                          className="h-8 px-3.5 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface text-[12px] font-medium hover:border-primary m3-pressable active:scale-[0.98]"
                        >
                          Use global
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {settingsTab === "input" && (
                  <div className="space-y-3 animate-m3-fade-in">
                    <div className="rounded-xl bg-primary-container/20 border border-outline-variant p-3 flex gap-3">
                      <span className="w-8 h-8 rounded-full bg-primary text-on-primary grid place-items-center flex-shrink-0"><Info size={14}/></span>
                      <p className="text-[11px] leading-relaxed text-on-surface-variant"><span className="font-medium text-on-surface">Gaming focus:</span> Sticky/Filter key popups stay silent while mappings are active.</p>
                    </div>
                    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4">
                      <div className="flex items-start gap-3">
                        <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0"><Pause size={16}/></span>
                        <div className="flex-1">
                          <div className="text-[13px] font-medium text-on-surface">Auto-play in your games</div>
                          <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">List games per profile (Edit profile → Games): this profile switches and works only there. Empty list = manual everywhere. Your manual switch always wins.</div>
                          {autoPause && !Object.values(profiles).some((p) => (p.autoApps?.length ?? 0) > 0 || (p.playApps?.length ?? 0) > 0) && (
                            <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1.5">Tip: no profile lists games yet — add them in Edit profile → Games.</div>
                          )}
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer ml-2">
                          <input type="checkbox" checked={autoPause} onChange={e=>{ const v=e.target.checked; setAutoPause(v); try{localStorage.setItem("lefty_autopause_focus",String(v));}catch{} if (!v) { autoPausedRef.current = false; setAutoHeld(false); if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = undefined; } if (pauseTimer.current) { clearTimeout(pauseTimer.current); pauseTimer.current = undefined; } } }} className="sr-only peer" />
                          <div className="w-11 h-7 bg-surface-container-highest border-2 border-outline rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all before:content-[''] before:absolute before:top-[3px] before:left-[3px] before:bg-outline before:rounded-full before:h-5 before:w-5 before:transition-all peer-checked:before:translate-x-[18px] peer-checked:before:bg-on-primary"></div>
                        </label>
                      </div>
                    </div>
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
                      setProfiles(p);
                      setActive(a);
                      const m = p[a] ? engineMappings(p[a]) : [];
                      invoke("update_mappings", { mappings: m }).catch(()=>{});
                    }} />
                  </div>
                )}
                {settingsTab === "about" && (
                  <div className="space-y-3 animate-m3-fade-in">
                    <button
                      onClick={() => invoke("open_external_url", { url: "https://github.com/EtherealDevv" }).catch(() => {})}
                      title="Open GitHub profile"
                      className="w-full rounded-2xl border border-outline-variant bg-gradient-to-br from-primary-container via-surface-container-high to-surface-container-high p-5 flex items-center gap-4 text-left hover:border-primary transition-colors m3-pressable active:scale-[0.99] shadow-m3-1"
                    >
                      <span className="w-14 h-14 rounded-2xl bg-primary text-on-primary grid place-items-center shrink-0 shadow-m3-1">
                        <Github size={26} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[17px] font-display font-medium text-on-surface leading-none">Sycho</span>
                        <span className="block text-[12px] text-on-surface-variant mt-1.5 font-mono">@EtherealDevv</span>
                        <span className="block text-[11px] text-on-surface-variant mt-1">Left-handed gamer building Lefty — tap to open GitHub ↗</span>
                      </span>
                    </button>
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
                    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0"><Download size={16}/></span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-on-surface">
                          Updates{appVersion ? <span className="font-normal text-on-surface-variant"> · v{appVersion}</span> : null}
                        </div>
                        {updateInfo ? (
                          <>
                            <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">
                              New version <span className="font-medium text-on-surface">{updateInfo.latest}</span> available.
                            </div>
                            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                              <button
                                onClick={async () => {
                                  try {
                                    await copyText(updateInfo.url);
                                    setLinkCopied(true);
                                    window.setTimeout(() => setLinkCopied(false), 2000);
                                  } catch {
                                    /* clipboard bloqueado */
                                  }
                                }}
                                className="h-8 px-3.5 rounded-full bg-primary text-on-primary text-[12px] font-medium flex items-center gap-1.5 hover:opacity-90 m3-pressable active:scale-[0.98]"
                              >
                                {linkCopied ? <Check size={13} strokeWidth={3} /> : <Download size={13} />}
                                {linkCopied ? "Link copied" : "Copy download link"}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1 flex items-center gap-2">
                            {checkingUpdate ? (
                              <><Loader2 size={12} className="animate-spin" /> Checking…</>
                            ) : (
                              "You're on the latest version."
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={startTour}
                      className="text-[11px] text-on-surface-variant hover:text-on-surface underline underline-offset-2 mx-auto block"
                    >
                      Replay tour
                    </button>
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
