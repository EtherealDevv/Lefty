/** Destinos combo: `CTRL+S`, `SHIFT+1`… El `+` une partes al guardar.
 *  Las teclas `+` y `NUM+` no pueden ser main de un combo (ambigüedad). */

export interface ComboMod {
  id: string;
  label: string;
}

/** Modificadores ofrecidos, en orden canónico de pulsado. */
export const COMBO_MODS: readonly ComboMod[] = [
  { id: "CTRL", label: "Ctrl" },
  { id: "SHIFT", label: "Shift" },
  { id: "ALT", label: "Alt" },
  { id: "LWIN", label: "Win" },
];

/** Mains prohibidos con mods (contienen el separador). */
export const PLUS_KEYS: readonly string[] = ["+", "NUM+"];

/** `"CTRL+S"` → `["CTRL", "S"]`. Regla de pegado: un `""` se suma al
 *  anterior (`"CTRL+NUM+"` → `["CTRL", "NUM+"]`). Sin `+` → single. */
export function splitComboTarget(dst: string): string[] {
  if (!dst.includes("+")) return [dst];
  const out: string[] = [];
  for (const part of dst.split("+")) {
    if (part === "" && out.length > 0) out[out.length - 1] += "+";
    else out.push(part);
  }
  const clean = out.filter((p) => p !== "");
  return clean.length > 0 ? clean : [dst];
}

export function isComboTarget(dst: string): boolean {
  return splitComboTarget(dst).length > 1;
}

/** Une mods (orden canónico) + main. Sin mods = la tecla sola. */
export function joinComboTarget(mods: readonly string[], main: string): string {
  const ordered = COMBO_MODS.map((m) => m.id).filter((id) => mods.includes(id));
  if (ordered.length === 0) return main;
  return [...ordered, main].join("+");
}

/** Muestra bonito: `CTRL+S` (el chip ya es mono, sin cambios). */
export function displayComboTarget(dst: string): string {
  return dst;
}
