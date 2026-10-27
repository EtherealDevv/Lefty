/** Destinos combo: `CTRL+S`, `SHIFT+1`… El `+` une partes al guardar. */

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

const COMBO_MOD_IDS = new Set(COMBO_MODS.map((m) => m.id));

/** `"CTRL+S"` → `["CTRL", "S"]`; `"CTRL++ (Numpad)"` → `["CTRL", "+ (Numpad)"]`.
 *  Solo consume modificadores conocidos al inicio, así una tecla `+` (o
 *  `NUM+`) como destino principal sobrevive intacta. Sin combo → `[dst]`. */
export function splitComboTarget(dst: string): string[] {
  const out: string[] = [];
  let rest = dst;
  while (true) {
    const plus = rest.indexOf("+");
    if (plus <= 0) break;
    const head = rest.slice(0, plus);
    if (!COMBO_MOD_IDS.has(head.toUpperCase())) break;
    out.push(head);
    rest = rest.slice(plus + 1);
  }
  return out.length === 0 ? [dst] : [...out, rest];
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
