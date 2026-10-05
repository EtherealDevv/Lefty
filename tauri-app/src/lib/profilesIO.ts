// Importación / exportación local de perfiles (sin nube, sin backend).
import { DEFAULT_PROFILE_ICON } from "./profileIcons";
// Todo vive en localStorage ("lefty_profiles"); este módulo valida,
// fusiona y mueve ese JSON hacia/desde archivos `.json` del usuario.

export type Mapping = [string, string];

export type Profile = {
  display_name: string;
  description: string;
  icon: string;
  mappings: Mapping[];
  /** Apps para auto-switch (exe o subcadena del título, minúsculas).
   *  Ausente o vacío = solo manual. */
  autoApps?: string[];
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
    merged[id] = {
      ...lp,
      display_name: rp.display_name || lp.display_name,
      description: rp.description || lp.description,
      icon: rp.icon || lp.icon,
      mappings: [...bySrc.values()],
      autoApps: autoApps.length > 0 ? autoApps : undefined,
    };
  }
  const prevActive = localStorage.getItem(LS_ACTIVE);
  const active = prevActive ?? Object.keys(merged)[0] ?? "custom";
  persist(merged, active);
  return { profiles: merged, active };
}

/** Descarga los perfiles actuales como `lefty-profiles-YYYYMMDD-HHmm.json`. */
export function exportProfilesToFile(): string {
  const profiles = getLocalProfiles();
  if (Object.keys(profiles).length === 0) {
    throw new Error("Nothing to export: no profiles saved.");
  }
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filename = `lefty-profiles-${stamp}.json`;
  const blob = new Blob([JSON.stringify(profiles, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  return filename;
}

/** Lee y valida un `.json` elegido por el usuario. */
export async function parseProfilesFile(file: File): Promise<ProfilesMap> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`"${file.name}" is not valid JSON.`);
  }
  return validateProfilesMap(data).profiles;
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
  "VOLUME_MUTE","VOLUME_DOWN","VOLUME_UP","MEDIA_NEXT","MEDIA_PREV","MEDIA_STOP","MEDIA_PLAY","LAUNCH_MAIL","LAUNCH_MEDIA","BROWSER_BACK","BROWSER_FORWARD","BROWSER_REFRESH","BROWSER_STOP","BROWSER_SEARCH","BROWSER_FAVORITES","BROWSER_HOME","SLEEP","DISABLED"
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
 * `LFT2.<icon>.<nombreB64>.<s:d,s:d>[.<autos>]` (la descripción se omite).
 */
export function encodeShareCode(_id: string, profile: Profile): string {
  const pairs = profile.mappings.map(([s, d]) => `${encKeyName(s)}:${encKeyName(d)}`).join(",");
  // Icono: nombre Lucide ("Gamepad2") o glifo legacy; nunca contiene ".".
  const icon =
    profile.icon && !profile.icon.includes(".") ? profile.icon : DEFAULT_PROFILE_ICON;
  let code = `LFT2.${icon}.${b64urlEncode(profile.display_name)}.${pairs}`;
  const autos = (profile.autoApps ?? [])
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);
  if (autos.length > 0) code += `.${b64urlEncode(autos.join(","))}`;
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
  const [, icon, nameB64, pairsRaw, autosRaw] = parts;
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
        d = decKeyName(kv[1]);
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
