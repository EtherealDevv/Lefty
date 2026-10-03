// Importación / exportación local de perfiles (sin nube, sin backend).
// Todo vive en localStorage ("lefty_profiles"); este módulo valida,
// fusiona y mueve ese JSON hacia/desde archivos `.json` del usuario.

export type Mapping = [string, string];

export type Profile = {
  display_name: string;
  description: string;
  icon: string;
  mappings: Mapping[];
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
      icon: typeof r.icon === "string" && r.icon ? r.icon : "✦",
      mappings,
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
    const bySrc = new Map<string, string>(lp.mappings);
    for (const [s, d] of rp.mappings) bySrc.set(s, d);
    merged[id] = {
      ...lp,
      display_name: rp.display_name || lp.display_name,
      description: rp.description || lp.description,
      icon: rp.icon || lp.icon,
      mappings: [...bySrc.entries()] as Mapping[],
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
