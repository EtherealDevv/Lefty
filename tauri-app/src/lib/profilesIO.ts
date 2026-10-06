// Importación / exportación local de perfiles (sin nube, sin backend).
import { DEFAULT_PROFILE_ICON } from "./profileIcons";
import { splitComboTarget } from "./comboTarget";
// Todo vive en localStorage ("lefty_profiles"); este módulo valida,
// fusiona y mueve ese JSON hacia/desde archivos `.json` del usuario.

export type Mapping = [string, string];

// Fuente única de Profile/Mapping: App.tsx y el resto de la UI importan
// estos tipos de aquí (no duplicarlos).
export type Profile = {
  display_name: string;
  description: string;
  icon: string;
  mappings: Mapping[];
  /** Apps para auto-switch (exe o subcadena del título, minúsculas).
   *  Ausente o vacío = solo manual. */
  autoApps?: string[];
  /** Apps donde el perfil se activa solo (allowlist, misma sintaxis).
   *  Vacío = manual en todas partes. No lo comparte el switch. */
  playApps?: string[];
  /** Acento por perfil: preset id o `#RRGGBB`. Ausente = usar global. */
  accent?: string;
  /** Sources en pausa: reservan su source pero no llegan al engine.
   *  Ausente o vacío = todo activo. No viaja en share codes. */
  disabled?: string[];
};

export type ProfilesMap = Record<string, Profile>;

export const LS_PROFILES = "lefty_profiles";
export const LS_ACTIVE = "lefty_active";

export function getLocalProfiles(): ProfilesMap {
  try {
    const raw = localStorage.getItem(LS_PROFILES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as ProfilesMap;
    return {};
  } catch {
    return {};
  }
}

function isMapping(m: unknown): m is Mapping {
  return (
    Array.isArray(m) &&
    m.length === 2 &&
    typeof m[0] === "string" &&
    typeof m[1] === "string"
  );
}

/** Normaliza la lista de apps para auto-switch de un perfil importado. */
export function normalizeAutoApps(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const apps = [...new Set(
    raw
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0)
  )];
  return apps.length > 0 ? apps : undefined;
}

// Mismo criterio que theme/accent normalizeProfileAccent (duplicado para
// no arrastrar React/Material a este módulo): preset id o `#RRGGBB`.
const ACCENT_IDS = new Set([
  "mono",
  "emerald",
  "cyan",
  "blue",
  "violet",
  "pink",
  "crimson",
  "orange",
  "amber",
  "lime",
]);

export function normalizeAccent(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (t === "") return undefined;
  if (ACCENT_IDS.has(t)) return t;
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toUpperCase();
  return undefined;
}

/** Normaliza sources en pausa: solo conserva los presentes en mappings. */
export function normalizeDisabled(mappings: Mapping[], raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const srcs = new Set(mappings.map(([s]) => s));
  const out = [...new Set(
    raw
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && srcs.has(s))
  )];
  return out.length > 0 ? out : undefined;
}

/**
 * Valida un JSON parseado con tolerancia: ignora entradas malformadas y
 * devuelve warnings legibles. Lanza si no hay NI UN perfil válido.
 */
export function validateProfilesMap(data: unknown): {
  profiles: ProfilesMap;
  warnings: string[];
} {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid file: expected a JSON object { profileId: {...} }.");
  }
  const profiles: ProfilesMap = {};
  const warnings: string[] = [];
  for (const [id, raw] of Object.entries(data as Record<string, unknown>)) {
    if (!id || typeof id !== "string") continue;
    if (!raw || typeof raw !== "object") {
      warnings.push(`Skipped "${id}": not an object.`);
      continue;
    }
    const r = raw as Record<string, unknown>;
    const mappings = Array.isArray(r.mappings)
      ? (r.mappings as unknown[]).filter(isMapping)
      : [];
    if (!Array.isArray(r.mappings)) {
      warnings.push(`"${id}": missing mappings, imported empty.`);
    } else if (mappings.length !== (r.mappings as unknown[]).length) {
      warnings.push(`"${id}": some mappings were malformed and skipped.`);
    }
    profiles[id] = {
      display_name: typeof r.display_name === "string" ? r.display_name : id,
      description: typeof r.description === "string" ? r.description : "",
      icon: typeof r.icon === "string" && r.icon ? r.icon : DEFAULT_PROFILE_ICON,
      mappings,
      autoApps: normalizeAutoApps(r.autoApps),
      // Migración pauseApps → playApps (códigos/archivos viejos).
      playApps: normalizeAutoApps(r.playApps ?? (r as Record<string, unknown>).pauseApps),
      accent: normalizeAccent(r.accent),
      disabled: normalizeDisabled(mappings, r.disabled),
    };
  }
  if (Object.keys(profiles).length === 0) {
    throw new Error("Invalid file: no valid profiles found.");
  }
  return { profiles, warnings };
}

function persist(profiles: ProfilesMap, active?: string) {
  localStorage.setItem(LS_PROFILES, JSON.stringify(profiles));
  if (active) localStorage.setItem(LS_ACTIVE, active);
}

// ── Backups automáticos ──────────────────────────────────────────────
// Snapshot de seguridad antes de cada import/restore. Rotativo: se
// conservan los últimos MAX_BACKUPS en localStorage ("lefty_backups").

export interface ProfilesBackup {
  stamp: string;
  label: string;
  reason: string;
  profiles: ProfilesMap;
  active: string;
}

const LS_BACKUPS = "lefty_backups";
const MAX_BACKUPS = 8;

export function listBackups(): ProfilesBackup[] {
  try {
    const raw = localStorage.getItem(LS_BACKUPS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is ProfilesBackup =>
        !!b && typeof b === "object" &&
        typeof (b as ProfilesBackup).stamp === "string" &&
        !!(b as ProfilesBackup).profiles &&
        typeof (b as ProfilesBackup).profiles === "object"
    );
  } catch {
    return [];
  }
}

function saveBackups(list: ProfilesBackup[]) {
  try {
    localStorage.setItem(LS_BACKUPS, JSON.stringify(list.slice(0, MAX_BACKUPS)));
  } catch {
    /* cuota llena: el import sigue igual, solo se pierde el snapshot */
  }
}

/** Guarda el estado actual como backup. `null` si no hay nada que guardar. */
export function createBackup(reason: string): ProfilesBackup | null {
  const profiles = getLocalProfiles();
  if (!profiles || Object.keys(profiles).length === 0) return null;
  const active = localStorage.getItem(LS_ACTIVE) ?? Object.keys(profiles)[0] ?? "";
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const label = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())} · ${reason} (${Object.keys(profiles).length} profiles)`;
  const b: ProfilesBackup = {
    stamp: `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    label,
    reason,
    profiles,
    active,
  };
  saveBackups([b, ...listBackups()]);
  return b;
}

/** Restaura un backup (con snapshot previo del estado actual). `null` si no existe. */
export function restoreBackup(stamp: string): { profiles: ProfilesMap; active: string } | null {
  const found = listBackups().find((b) => b.stamp === stamp);
  if (!found) return null;
  createBackup("pre-restore");
  persist(found.profiles, found.active);
  return { profiles: found.profiles, active: found.active };
}

export function deleteBackup(stamp: string): ProfilesBackup[] {
  const next = listBackups().filter((b) => b.stamp !== stamp);
  saveBackups(next);
  return next;
}

/** El archivo importado reemplaza por completo los perfiles locales. */
export function applyImportedReplace(imported: ProfilesMap): {
  profiles: ProfilesMap;
  active: string;
} {
  const keys = Object.keys(imported);
  const prevActive = localStorage.getItem(LS_ACTIVE);
  const active = prevActive && imported[prevActive] ? prevActive : keys[0];
  persist(imported, active);
  return { profiles: imported, active };
}

/**
 * Fusión no destructiva: perfiles nuevos se añaden; en perfiles existentes
 * los mappings se unen por `source` (gana el importado); lo solo-local se conserva.
 */
export function applyImportedMerge(imported: ProfilesMap): {
  profiles: ProfilesMap;
  active: string;
} {
  const local = getLocalProfiles();
  const merged: ProfilesMap = { ...local };
  for (const [id, rp] of Object.entries(imported)) {
    const lp = merged[id];
    if (!lp) {
      merged[id] = rp;
      continue;
    }
    const cloneMapping = (m: Mapping): Mapping => [m[0], m[1]];
    const bySrc = new Map<string, Mapping>(lp.mappings.map((m) => [m[0], cloneMapping(m)]));
    for (const m of rp.mappings) bySrc.set(m[0], cloneMapping(m));
    const autoApps = [...new Set([...(lp.autoApps ?? []), ...(rp.autoApps ?? [])])];
    const playApps = [...new Set([...(lp.playApps ?? []), ...(rp.playApps ?? [])])];
    const mergedMappings = [...bySrc.values()];
    const mergedDisabled = [...new Set([...(lp.disabled ?? []), ...(rp.disabled ?? [])])]
      .filter((s) => mergedMappings.some(([src]) => src === s));
    merged[id] = {
      ...lp,
      display_name: rp.display_name || lp.display_name,
      description: rp.description || lp.description,
      icon: rp.icon || lp.icon,
      mappings: mergedMappings,
      autoApps: autoApps.length > 0 ? autoApps : undefined,
      playApps: playApps.length > 0 ? playApps : undefined,
      // Acento: el importado manda si trae uno; si no, se conserva el local.
      accent: rp.accent ?? lp.accent,
      // Pausados: unión podada a los sources supervivientes.
      disabled: mergedDisabled.length > 0 ? mergedDisabled : undefined,
    };
  }
  const prevActive = localStorage.getItem(LS_ACTIVE);
  const active = prevActive ?? Object.keys(merged)[0] ?? "custom";
  persist(merged, active);
  return { profiles: merged, active };
}

/** Diccionario de teclas para share codes compactos (mismo orden que FALLBACK_ALL_KEYS).
 *  Nombres fuera de la lista se escapan con `~` + encodeURIComponent. */
const SHARE_KEY_DICT: readonly string[] = [
  "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
  "1","2","3","4","5","6","7","8","9","0",
  "F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12",
  "ESC","TAB","CAPSLOCK","SHIFT","LSHIFT","RSHIFT","CTRL","LCTRL","RCTRL","ALT","LALT","RALT","LWIN","RWIN","SPACE","ENTER","BACKSPACE",
  "UP","DOWN","LEFT","RIGHT","INSERT","DELETE","HOME","END","PAGEUP","PAGEDOWN","NUMLOCK","SCROLLLOCK","PRINTSCREEN","PAUSE",
  "`","°","'","?","¡","¿","=","´","¨","[","{","+","*","]","}","Ñ",";",":","Ç","ç","\"",",",".","-","_","/","\\","|","¬",">","<",
  "NUM0","NUM1","NUM2","NUM3","NUM4","NUM5","NUM6","NUM7","NUM8","NUM9","NUM*","NUM+","NUM-","NUM.","NUM/","NUMENTER",
  "VOLUME_MUTE","VOLUME_DOWN","VOLUME_UP","MEDIA_NEXT","MEDIA_PREV","MEDIA_STOP","MEDIA_PLAY","LAUNCH_MAIL","LAUNCH_MEDIA","BROWSER_BACK","BROWSER_FORWARD","BROWSER_REFRESH","BROWSER_STOP","BROWSER_SEARCH","BROWSER_FAVORITES","BROWSER_HOME","SLEEP","DISABLED",
  "MOUSE_X1","MOUSE_X2"
];

const SHARE_DICT_IDX = new Map<string, number>(SHARE_KEY_DICT.map((n, i) => [n, i]));

function encKeyName(n: string): string {
  const i = SHARE_DICT_IDX.get(n);
  if (i !== undefined) return i.toString(36);
  return `~${b64urlEncode(n)}`;
}

function decKeyName(t: string): string {
  if (t.startsWith("~")) return b64urlDecode(t.slice(1));
  const i = parseInt(t, 36);
  if (!Number.isInteger(i) || i < 0 || i >= SHARE_KEY_DICT.length) {
    throw new Error("Invalid share code (unknown key).");
  }
  return SHARE_KEY_DICT[i];
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  let b = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4 !== 0) b += "=";
  const bin = atob(b);
  const arr = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(arr);
}

function slugName(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "shared";
}

const SHARE_PREFIX_V1 = "LFT1.";
const SHARE_PREFIX_V2 = "LFT2.";

/**
 * Empaqueta un perfil en un share code COMPACTO v2:
 * `LFT2.<icon>.<nombreB64>.<s:d,s:d>[.<autos>[.<@acento>]][.<!juegos>]]` (la descripción se omite).
 * El acento viaja como segmento extra `@preset` o `@#RRGGBB` y la lista de
 * juego como `!b64`: las versiones viejas ignoran ambos segmentos y las
 * nuevas los recuperan.
 * Los mapeos en pausa (`disabled`) NO viajan: el receptor los recibe todos activos.
 */
export function encodeShareCode(_id: string, profile: Profile): string {
  // Destino combo: cada parte se codifica aparte y se une con `+`
  // (`+` nunca aparece en nombres codificados: base36 o ~b64url).
  const pairs = profile.mappings
    .map(([s, d]) => `${encKeyName(s)}:${splitComboTarget(d).map(encKeyName).join("+")}`)
    .join(",");
  // Icono: nombre Lucide ("Gamepad2") o glifo legacy; nunca contiene ".".
  const icon =
    profile.icon && !profile.icon.includes(".") ? profile.icon : DEFAULT_PROFILE_ICON;
  let code = `LFT2.${icon}.${b64urlEncode(profile.display_name)}.${pairs}`;
  const autos = (profile.autoApps ?? [])
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);
  const play = (profile.playApps ?? [])
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);
  const accent = normalizeAccent(profile.accent);
  if (accent) {
    const autosB64 = autos.length > 0 ? b64urlEncode(autos.join(",")) : "";
    code += `.${autosB64}.@${accent}`;
  } else if (autos.length > 0) {
    code += `.${b64urlEncode(autos.join(","))}`;
  }
  if (play.length > 0) {
    // Segmentos posicionales: rellenar huecos vacíos para no mover nada.
    if (accent) code += `.`;
    else if (autos.length > 0) code += `..`;
    else code += `...`;
    code += `!${b64urlEncode(play.join(","))}`;
  }
  return code;
}

/** Desempaqueta y valida un share code (v2 compacto o v1 legacy). */
export function decodeShareCode(code: string): { id: string; profile: Profile } {
  const raw = code.trim();
  if (raw.startsWith(SHARE_PREFIX_V2)) return decodeShareCodeV2(raw);
  return decodeShareCodeV1(raw);
}

function decodeShareCodeV2(raw: string): { id: string; profile: Profile } {
  const parts = raw.split(".");
  if (parts.length < 4 || parts[0] !== "LFT2") throw new Error("Invalid share code.");
  const [, icon, nameB64, pairsRaw] = parts;
  const rest = parts.slice(4);
  let autosRaw: string | undefined;
  let accentRaw: string | undefined;
  let playRaw: string | undefined;
  if (rest.length === 1) {
    if (rest[0].startsWith("@")) accentRaw = rest[0].slice(1);
    else if (rest[0] !== "") autosRaw = rest[0];
  } else if (rest.length >= 2) {
    if (rest[0] !== "" && !rest[0].startsWith("@")) autosRaw = rest[0];
    if (rest[1].startsWith("@")) accentRaw = rest[1].slice(1);
    const playSeg = rest[2];
    if (playSeg && playSeg.startsWith("!")) playRaw = playSeg.slice(1);
  }
  let display_name: string;
  try {
    display_name = b64urlDecode(nameB64);
  } catch {
    throw new Error("Invalid share code (bad name).");
  }
  if (!display_name) throw new Error("Invalid share code (no name).");
  const mappings: Mapping[] = [];
  if (pairsRaw) {
    for (const pair of pairsRaw.split(",")) {
      const kv = pair.split(":");
      if (kv.length !== 2 || !kv[0] || !kv[1]) {
        throw new Error("Invalid share code (bad mapping).");
      }
      let s: string;
      let d: string;
      try {
        s = decKeyName(kv[0]);
        d = kv[1].split("+").map(decKeyName).join("+");
      } catch {
        throw new Error("Invalid share code (unknown key).");
      }
      mappings.push([s, d]);
    }
  }
  const obj = {
    display_name,
    description: "",
    icon: icon || "✦",
    mappings,
  };
  const id = `shared-${slugName(display_name)}`;
  const { profiles } = validateProfilesMap({ [id]: obj });
  const p = profiles[id];
  if (!p) throw new Error("Invalid share code.");
  if (autosRaw) {
    let list: string[];
    try {
      list = b64urlDecode(autosRaw).split(",");
    } catch {
      throw new Error("Invalid share code (bad apps).");
    }
    const autoApps = normalizeAutoApps(list);
    if (autoApps) p.autoApps = autoApps;
  }
  const accent = normalizeAccent(accentRaw);
  if (accent) p.accent = accent;
  if (playRaw) {
    let list: string[];
    try {
      list = b64urlDecode(playRaw).split(",");
    } catch {
      throw new Error("Invalid share code (bad play apps).");
    }
    const playApps = normalizeAutoApps(list);
    if (playApps) p.playApps = playApps;
  }
  return { id, profile: p };
}

/** Formato legacy v1 (JSON completo en base64). Se sigue aceptando al importar. */
function decodeShareCodeV1(raw: string): { id: string; profile: Profile } {
  if (!raw.startsWith(SHARE_PREFIX_V1)) {
    throw new Error("Invalid share code (must start with LFT1. or LFT2.).");
  }
  let json: string;
  try {
    const bin = atob(raw.slice(SHARE_PREFIX_V1.length));
    const arr = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    json = new TextDecoder().decode(arr);
  } catch {
    throw new Error("Invalid share code (bad encoding).");
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Invalid share code (bad data).");
  }
  if (!data || typeof data !== "object") throw new Error("Invalid share code.");
  const { id, profile } = data as { id?: unknown; profile?: unknown };
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Invalid share code (no id).");
  }
  const { profiles } = validateProfilesMap({ [id]: profile });
  const p = profiles[id];
  if (!p) throw new Error("Invalid share code (no valid profile).");
  return { id, profile: p };
}
