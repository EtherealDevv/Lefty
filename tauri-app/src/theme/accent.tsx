import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { applyMaterialYouExpressiveTheme } from "./materialYouExpressive";

export interface AccentPreset {
  id: string;
  name: string;
  hex: string;
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: "mono", name: "White / Mono", hex: "#FFFFFF" },
  { id: "emerald", name: "Emerald / Neon", hex: "#10B981" },
  { id: "cyan", name: "Cyber Cyan", hex: "#06B6D4" },
  { id: "blue", name: "Ocean Blue", hex: "#3B82F6" },
  { id: "violet", name: "Purple / Violet", hex: "#8B5CF6" },
  { id: "pink", name: "Hot Pink", hex: "#EC4899" },
  { id: "crimson", name: "Crimson Red", hex: "#EF4444" },
  { id: "orange", name: "Sunset Orange", hex: "#F97316" },
  { id: "amber", name: "Amber Gold", hex: "#F59E0B" },
  { id: "lime", name: "Lime Volt", hex: "#84CC16" },
];

export interface ResolvedAccent {
  /** Preset id o `"custom"`. */
  key: string;
  name: string;
  hex: string;
  isCustom: boolean;
}

const LS_KEY = "lefty_accent";
export const CUSTOM_KEY = "custom";
const STYLE_ID = "lefty-accent-overrides";

/** `#RRGGBB` (o `#RGB`) → [r, g, b] 0–255. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Interpola dos hex. `t = 0` → a, `t = 1` → b. */
export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Luminancia relativa sRGB 0–1. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Color de texto (casi-negro / blanco) con mejor contraste sobre el fondo dado. */
export function contrastOn(hex: string): string {
  return luminance(hex) > 0.45 ? "#101014" : "#FFFFFF";
}

export function presetById(id: string | null): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0];
}

/** Resuelve lo guardado (preset id o `#HEX` custom) a un acento concreto. */
export function resolveAccent(raw: unknown): ResolvedAccent {
  if (typeof raw === "string") {
    const preset = ACCENT_PRESETS.find((p) => p.id === raw);
    if (preset) {
      return { key: preset.id, name: preset.name, hex: preset.hex, isCustom: false };
    }
    const t = raw.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(t)) {
      return { key: CUSTOM_KEY, name: "Custom", hex: t.toUpperCase(), isCustom: true };
    }
  }
  const mono = ACCENT_PRESETS[0];
  return { key: mono.id, name: mono.name, hex: mono.hex, isCustom: false };
}

/** Variables fijadas al valor EXACTO elegido (botones = el hex del swatch). */
function exactVars(hex: string): Record<string, string> {
  return {
    "--md-sys-color-primary": hex,
    "--md-sys-color-on-primary": contrastOn(hex),
    "--accent-color": hex,
    "--accent-color-alpha": `color-mix(in srgb, ${hex} 16%, transparent)`,
  };
}

function setInlineVar(name: string, value: string): void {
  // `important` para imponerse al <style> del tema M3 (que también usa !important).
  document.documentElement.style.setProperty(name, value, "important");
}

/** Vía redundante: <style> propio al FINAL del head (gana cualquier empate de cascada). */
function syncStyleTag(vars: Record<string, string>): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  } else if (el.parentElement !== document.head || el.nextSibling !== null) {
    document.head.appendChild(el); // re-colocar al final si algo lo movió
  }
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v} !important;`)
    .join("\n");
  const css = `:root{\n${body}\n}\n`;
  if (el.textContent !== css) el.textContent = css;
}

/**
 * Aplica el acento en dos capas:
 * 1) REGENERA el esquema M3 completo usando el acento como color semilla
 *    (tonalSpot para colores, monochrome original para grises/blanco).
 *    Es la misma vía probada del arranque: reemplaza el <style> del tema,
 *    así containers, superficies y tintados armonizan con el acento.
 * 2) Fija el primario al valor EXACTO elegido (doble vía: inline !important
 *    + <style> propio al final del head) para botones, perfil, toggles y dot.
 */
export function applyAccent(hex: string): void {
  if (typeof document === "undefined") return;
  const seed = hex.toUpperCase();
  const [r, g, b] = hexToRgb(seed);
  const colorful = Math.max(r, g, b) - Math.min(r, g, b) > 12;
  if (colorful) {
    applyMaterialYouExpressiveTheme({
      baseHex: seed,
      scheme: "tonalSpot",
      contrast: 0,
      spec: "2025",
      platform: "phone",
    });
  } else {
    // Grises/blanco: restaurar el tema monochrome original del arranque.
    applyMaterialYouExpressiveTheme({
      baseHex: "#121212",
      scheme: "monochrome",
      contrast: 0,
      spec: "2025",
      platform: "phone",
    });
  }
  const vars = exactVars(seed);
  for (const [k, v] of Object.entries(vars)) setInlineVar(k, v);
  syncStyleTag(vars);
  document.documentElement.dataset.accent = seed;
}

/** Init síncrono pre-render (llamar en main.tsx tras el tema M3, evita flash). */
export function initAccent(): void {
  try {
    const raw = localStorage.getItem(LS_KEY);
    applyAccent(resolveAccent(raw).hex);
  } catch {
    applyAccent(ACCENT_PRESETS[0].hex);
  }
}

interface AccentContextValue {
  accent: ResolvedAccent;
  setAccent: (id: string) => void;
  setCustomHex: (hex: string) => void;
}

const AccentContext = createContext<AccentContextValue>({
  accent: { key: "mono", name: "White / Mono", hex: "#FFFFFF", isCustom: false },
  setAccent: () => undefined,
  setCustomHex: () => undefined,
});

function readStoredRaw(): string {
  try {
    return localStorage.getItem(LS_KEY) ?? ACCENT_PRESETS[0].id;
  } catch {
    return ACCENT_PRESETS[0].id;
  }
}

export function AccentProvider({ children }: { children: ReactNode }): JSX.Element {
  const [stored, setStored] = useState<string>(readStoredRaw);

  const setAccent = useCallback((id: string) => {
    const r = resolveAccent(id);
    setStored(r.isCustom ? r.hex : r.key);
  }, []);

  const setCustomHex = useCallback((hex: string) => {
    const t = hex.trim();
    const norm = t.startsWith("#") ? t : `#${t}`;
    const r = resolveAccent(norm);
    setStored(r.isCustom ? r.hex : r.key);
  }, []);

  const accent = useMemo<ResolvedAccent>(() => resolveAccent(stored), [stored]);

  useEffect(() => {
    applyAccent(accent.hex);
    try {
      localStorage.setItem(LS_KEY, stored);
    } catch {
      /* modo privado: el acento aplica igual durante la sesión */
    }
  }, [accent, stored]);

  const value = useMemo<AccentContextValue>(
    () => ({ accent, setAccent, setCustomHex }),
    [accent, setAccent, setCustomHex]
  );

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
  return useContext(AccentContext);
}
