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

/** Temas visuales completos. El acento M3 sigue existiendo dentro del tema default. */
export type ThemeId = "default" | "cyberpunk";

export interface ThemePreset {
  id: ThemeId;
  name: string;
  tagline: string;
  description: string;
  swatches: readonly string[];
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: "default",
    name: "Material UI",
    tagline: "Original",
    description: "The original Material 3 Expressive interface. Accent colors stay editable.",
    swatches: ["#121212", "#2A2A2A", "#E6E1EC", "#FFFFFF"],
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    tagline: "Night City",
    description: "Neon yellow, cyan and magenta, angular HUD panels and monospace controls.",
    swatches: ["#FCE300", "#00F0FF", "#FF2A6D", "#11141D"],
  },
];

const LS_KEY = "lefty_accent";
const LS_HC_KEY = "lefty_high_contrast";
const LS_THEME_KEY = "lefty_theme";
export const CUSTOM_KEY = "custom";
const STYLE_ID = "lefty-accent-overrides";

/**
 * Paleta completa del tema Cyberpunk. Se pinta inline con `!important`
 * después del esquema M3 para que el acento de perfil no la pise.
 * Los nombres coinciden con los tokens que consumen Tailwind y styles.css.
 */
const CYBER_VARS: Record<string, string> = {
  "--md-sys-color-primary": "#FCE300",
  "--md-sys-color-on-primary": "#0B0B00",
  "--md-sys-color-primary-container": "#3B3600",
  "--md-sys-color-on-primary-container": "#FFF27A",
  "--md-sys-color-primary-fixed": "#FCE300",
  "--md-sys-color-primary-fixed-dim": "#C9B800",
  "--md-sys-color-on-primary-fixed": "#0B0B00",
  "--md-sys-color-on-primary-fixed-variant": "#4A4300",
  "--md-sys-color-inverse-primary": "#6A5F00",
  "--md-sys-color-secondary": "#00F0FF",
  "--md-sys-color-on-secondary": "#001417",
  "--md-sys-color-secondary-container": "#003B42",
  "--md-sys-color-on-secondary-container": "#8CF8FF",
  "--md-sys-color-secondary-fixed": "#00F0FF",
  "--md-sys-color-secondary-fixed-dim": "#00B8C4",
  "--md-sys-color-on-secondary-fixed": "#001417",
  "--md-sys-color-on-secondary-fixed-variant": "#004F57",
  "--md-sys-color-tertiary": "#FF2A6D",
  "--md-sys-color-on-tertiary": "#1A0008",
  "--md-sys-color-tertiary-container": "#4A001B",
  "--md-sys-color-on-tertiary-container": "#FFB3C8",
  "--md-sys-color-tertiary-fixed": "#FF2A6D",
  "--md-sys-color-tertiary-fixed-dim": "#C4004A",
  "--md-sys-color-on-tertiary-fixed": "#1A0008",
  "--md-sys-color-on-tertiary-fixed-variant": "#5C0022",
  "--md-sys-color-error": "#FF5252",
  "--md-sys-color-on-error": "#1A0000",
  "--md-sys-color-error-container": "#4A0000",
  "--md-sys-color-on-error-container": "#FFB4B4",
  "--md-sys-color-surface": "#0A0C12",
  "--md-sys-color-surface-dim": "#05060A",
  "--md-sys-color-surface-bright": "#2A3040",
  "--md-sys-color-surface-container-lowest": "#07080D",
  "--md-sys-color-surface-container-low": "#0C0E15",
  "--md-sys-color-surface-container": "#11141D",
  "--md-sys-color-surface-container-high": "#171B26",
  "--md-sys-color-surface-container-highest": "#1E2431",
  "--md-sys-color-on-surface": "#E6F7FF",
  "--md-sys-color-on-surface-variant": "#9BB0C6",
  "--md-sys-color-surface-variant": "#1E2431",
  "--md-sys-color-outline": "#4A5A70",
  "--md-sys-color-outline-variant": "#263345",
  "--md-sys-color-inverse-surface": "#E6F7FF",
  "--md-sys-color-inverse-on-surface": "#0A0C12",
  "--md-sys-color-surface-tint": "#FCE300",
  "--md-sys-color-scrim": "#000000",
  "--md-sys-color-shadow": "#000000",
};

const CYBER_KEYS = Object.keys(CYBER_VARS);

function readStoredTheme(): ThemeId {
  try {
    return localStorage.getItem(LS_THEME_KEY) === "cyberpunk" ? "cyberpunk" : "default";
  } catch {
    return "default";
  }
}
/** Ratio WCAG mínimo exigido en modo alto contraste (texto normal AA). */
export const HC_MIN_RATIO = 4.5;

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

/** Ratio de contraste WCAG (L1+0.05)/(L2+0.05), 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Ajusta un acento hasta que su mejor texto (`contrastOn`) alcance
 * `minRatio` (def. 4.5). Mueve el color hacia negro o blanco —el que
 * menos cambio visual necesite— conservando el tono. Si ya cumple,
 * devuelve el hex intacto.
 */
export function adjustForContrast(hex: string, minRatio = HC_MIN_RATIO): string {
  const start = hex.toUpperCase();
  const bestRatio = (c: string) => contrastRatio(c, contrastOn(c));
  if (bestRatio(start) >= minRatio) return start;
  let dark: { hex: string; t: number } | null = null;
  let light: { hex: string; t: number } | null = null;
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    if (!dark) {
      const c = mixHex(start, "#000000", t);
      if (bestRatio(c) >= minRatio) dark = { hex: c, t };
    }
    if (!light) {
      const c = mixHex(start, "#FFFFFF", t);
      if (bestRatio(c) >= minRatio) light = { hex: c, t };
    }
    if (dark && light) break;
  }
  if (dark && light) return dark.t <= light.t ? dark.hex : light.hex;
  if (dark) return dark.hex;
  if (light) return light.hex;
  // Inalcanzable en la práctica (negro+blanco = 21:1), pero nunca romper.
  return luminance(start) > 0.5 ? "#FFFFFF" : "#000000";
}

/** Lee el modo alto contraste (persiste en localStorage, off por defecto). */
export function isHighContrastEnabled(): boolean {
  try {
    return localStorage.getItem(LS_HC_KEY) === "true";
  } catch {
    return false;
  }
}

function setHighContrastStored(v: boolean): void {
  try {
    localStorage.setItem(LS_HC_KEY, String(v));
  } catch {
    /* modo privado: aplica igual durante la sesión */
  }
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

function setInlineVarOn(el: HTMLElement, name: string, value: string): void {
  el.style.setProperty(name, value, "important");
}

/**
 * Pinta (o limpia) las variables del tema Cyberpunk. Se llama después de
 * `applyAccent` para que la paleta neón gane sobre el esquema M3.
 *
 * Importante: el generador M3 declara los tokens en `:root, :host, html, body`
 * con `!important`. Por eso el tema debe fijarse inline en <html> Y <body>:
 * si solo se fija en <html>, <body> conserva su propio valor y los controles
 * heredan la paleta M3 (blanco) en vez de la neón.
 */
export function applyTheme(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  const targets = [document.documentElement, document.body].filter(Boolean) as HTMLElement[];
  const root = document.documentElement;
  if (theme === "cyberpunk") {
    root.dataset.leftyTheme = "cyberpunk";
    for (const el of targets) {
      for (const [k, v] of Object.entries(CYBER_VARS)) setInlineVarOn(el, k, v);
    }
  } else {
    delete root.dataset.leftyTheme;
    for (const el of targets) {
      for (const k of CYBER_KEYS) el.style.removeProperty(k);
    }
  }
}

/** Init síncrono pre-render (llamar en main.tsx después de initAccent). */
export function initTheme(): void {
  applyTheme(readStoredTheme());
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
 * Con alto contraste activado (`lefty_high_contrast`), el hex se ajusta
 * primero con `adjustForContrast` (≥4.5:1) conservando el tono.
 */
export function applyAccent(hex: string): void {
  if (typeof document === "undefined") return;
  const requested = hex.toUpperCase();
  const seed = isHighContrastEnabled() ? adjustForContrast(requested) : requested;
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
  // Las previews de acento (p. ej. al editar un perfil) también deben
  // conservar el tema Cyberpunk mientras esté activo.
  if (document.documentElement.dataset.leftyTheme === "cyberpunk") {
    applyTheme("cyberpunk");
  }
}

/** Init síncrono pre-render (llamar en main.tsx tras el tema M3, evita flash).
 *  Respeta el acento por perfil: si el perfil activo guardado trae uno
 *  válido, ese manda; si no, el global. */
export function initAccent(): void {
  try {
    const activeId = localStorage.getItem("lefty_active");
    if (activeId) {
      try {
        const rawProfiles = localStorage.getItem("lefty_profiles");
        if (rawProfiles) {
          const parsed = JSON.parse(rawProfiles) as Record<string, { accent?: unknown }>;
          const a = parsed?.[activeId]?.accent;
          if (typeof a === "string" && a.trim() !== "") {
            // resolveAccent nunca lanza, pero si es inválido cae al mono;
            // solo usarlo si realmente resolvió a algo distinto del fallback
            // o si el valor era ya un preset/hex válido.
            const r = resolveAccent(a);
            const isPreset = ACCENT_PRESETS.some((p) => p.id === a);
            const isHex = /^#[0-9a-fA-F]{6}$/.test(a.trim());
            if (isPreset || isHex) {
              applyAccent(r.hex);
              return;
            }
          }
        }
      } catch {
        /* perfiles corruptos: caer al global */
      }
    }
    const raw = localStorage.getItem(LS_KEY);
    applyAccent(resolveAccent(raw).hex);
  } catch {
    applyAccent(ACCENT_PRESETS[0].hex);
  }
}

/** Normaliza un acento guardado en un perfil: preset id o `#RRGGBB`.
 *  `null`/vacío/inválido → `undefined` (= usar global). */
export function normalizeProfileAccent(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (t === "") return undefined;
  if (ACCENT_PRESETS.some((p) => p.id === t)) return t;
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toUpperCase();
  return undefined;
}

interface AccentContextValue {
  accent: ResolvedAccent;
  /** Atajo para `accent.hex` (evita desestructuraciones rotas). */
  accentHex: string;
  setAccent: (id: string) => void;
  setCustomHex: (hex: string) => void;
  /** Alto contraste: ajusta el acento pintado a ≥4.5:1. */
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;
  /** Tema visual completo (default / cyberpunk). */
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
}

const AccentContext = createContext<AccentContextValue>({
  accent: { key: "mono", name: "White / Mono", hex: "#FFFFFF", isCustom: false },
  accentHex: "#FFFFFF",
  setAccent: () => undefined,
  setCustomHex: () => undefined,
  highContrast: false,
  setHighContrast: () => undefined,
  theme: "default",
  setTheme: () => undefined,
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
  const [highContrast, setHighContrastState] = useState<boolean>(() => isHighContrastEnabled());
  const [theme, setThemeState] = useState<ThemeId>(readStoredTheme);

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

  const setHighContrast = useCallback((v: boolean) => {
    // Persistir ANTES del setState: App repinta vía applyAccent, que lee
    // la flag de localStorage en el siguiente render.
    setHighContrastStored(v);
    setHighContrastState(v);
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    // Persistir ya: applyAccent consulta el atributo del documento para
    // conservar el tema durante previews de acento.
    try {
      localStorage.setItem(LS_THEME_KEY, id);
    } catch {
      /* modo privado: aplica igual durante la sesión */
    }
    setThemeState(id);
  }, []);

  const accent = useMemo<ResolvedAccent>(() => resolveAccent(stored), [stored]);
  const accentHex = accent.hex;

  useEffect(() => {
    // Solo persistir: el pintado lo centraliza App.tsx (efectivo =
    // acento del perfil activo o global). Así el provider no pisa el
    // override por perfil (los efectos del hijo correrían antes que este).
    try {
      localStorage.setItem(LS_KEY, stored);
    } catch {
      /* modo privado: el acento aplica igual durante la sesión */
    }
  }, [stored]);

  const value = useMemo<AccentContextValue>(
    () => ({
      accent,
      accentHex,
      setAccent,
      setCustomHex,
      highContrast,
      setHighContrast,
      theme,
      setTheme,
    }),
    [accent, accentHex, setAccent, setCustomHex, highContrast, setHighContrast, theme, setTheme]
  );

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
  return useContext(AccentContext);
}
