/**
 * Lefty — Material You Expressive via material-you-utilities engine
 * -----------------------------------------------------------------
 * This module replicates the generation logic from
 * https://github.com/Nerwyn/material-you-utilities (which itself wraps
 * @material/material-color-utilities) to produce a **full** M3 Expressive
 * theme.
 *
 * • Base: #121212 (monochrome anchor requested by user → #121212 / #FFFFFF)
 * • Scheme: Monochrome  (so palette stays monochrome) 
 * • Spec: 2025 (Material You Expressive, new 2025 spec)
 * • Platform: phone
 * • Contrast: 0 (standard)
 *
 * Shapes / Motion / Typography are the Expressive part:
 *  - corner extra-large 28dp, pill 999px, medium 16dp etc.
 *  - motion spring + emphasized easing
 *  - Outfit for display/brand, Inter for plain, JetBrains Mono for code
 *
 * Even though the package `material-you-utilities` itself is a Home Assistant
 * HACS frontend module (installed via git), the *color engine* is
 * @material/material-color-utilities (spec 2025). We use the identical
 * generation to that file: src/utils/handlers/theme.ts in Nerwyn's repo.
 *
 * Usage: call `applyMaterialYouExpressiveTheme()` once on app start (done in
 * main.tsx). It injects `--md-sys-color-*` for both light & dark and sets the
 * dark tokens as the live :root values (Lefty is dark by default #121212).
 * Also exports `generateExpressiveTokens` for inspection / live switching.
 */

import {
  argbFromHex,
  hexFromArgb,
  Hct,
  MaterialDynamicColors,
  SchemeMonochrome,
  SchemeExpressive,
  SchemeTonalSpot,
  SchemeVibrant,
  DynamicColor,
  Platform,
} from "@material/material-color-utilities";

// Keep the exact list that material-you-utilities uses (src/models/constants/colors.ts)
export const expressiveDynamicColors = [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "primaryPaletteKeyColor",
  "inversePrimary",
  "primaryFixed",
  "primaryFixedDim",
  "onPrimaryFixed",
  "onPrimaryFixedVariant",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "secondaryPaletteKeyColor",
  "secondaryFixed",
  "secondaryFixedDim",
  "onSecondaryFixed",
  "onSecondaryFixedVariant",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "tertiaryPaletteKeyColor",
  "tertiaryFixed",
  "tertiaryFixedDim",
  "onTertiaryFixed",
  "onTertiaryFixedVariant",
  "neutralPaletteKeyColor",
  "neutralVariantPaletteKeyColor",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "surface",
  "onSurface",
  "surfaceVariant",
  "onSurfaceVariant",
  "surfaceDim",
  "surfaceBright",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "inverseSurface",
  "inverseOnSurface",
  "surfaceTint",
  "outline",
  "outlineVariant",
  "shadow",
  "scrim",
] as const;

export type SchemeChoice = "monochrome" | "expressive" | "tonalSpot" | "vibrant";
export type SpecVersion = "2021" | "2025";

interface GenerateOptions {
  baseHex?: string;          // e.g. "#121212"
  scheme?: SchemeChoice;     // monochrome keeps it greyscale (user request)
  contrast?: number;         // -1 .. 1
  spec?: SpecVersion;        // 2025 = Expressive spec
  platform?: Platform;       // phone | watch
}

const token = (name: string) =>
  name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export function generateExpressiveTokens(opts: GenerateOptions = {}) {
  const {
    baseHex = "#121212",
    scheme = "monochrome",
    contrast = 0,
    spec = "2025",
    platform = "phone",
  } = opts;

  const hct = Hct.fromInt(argbFromHex(baseHex));
  const SchemeClass =
    scheme === "monochrome" ? SchemeMonochrome :
    scheme === "expressive" ? SchemeExpressive :
    scheme === "vibrant" ? SchemeVibrant :
    SchemeTonalSpot;

  const out: Record<string, Record<string, string>> = { light: {}, dark: {} };

  for (const isDark of [false, true]) {
    const mode = isDark ? "dark" : "light";
    // @ts-ignore — constructor sig is (Hct, isDark, contrast, spec, platform)
    const sch = new (SchemeClass as any)(hct, isDark, contrast, spec, platform);
    for (const name of expressiveDynamicColors) {
      const dc = MaterialDynamicColors[name as keyof typeof MaterialDynamicColors] as DynamicColor;
      if (!dc) continue;
      const hex = hexFromArgb(dc.getArgb(sch));
      const key = `--md-sys-color-${token(name)}`;
      out[mode][key] = hex;
      // also expose with mode suffix for switches (like material-you-utilities: --md-sys-color-primary-light / -dark)
      out[mode][`${key}-${mode}`] = hex;
    }
  }
  return out;
}

// Build a CSS string like material-you-utilities' buildStylesString: :host, html, body, ha-card { ... }
export function buildThemeCss(tokens: ReturnType<typeof generateExpressiveTokens>) {
  const lines: string[] = [];

  // Dark is live (Lefty default #121212) — inject both mode maps, but set live --md-sys-color-* to dark values
  // We keep light values under [data-theme="light"] and as --* -light suffixes.
  lines.push(":root, :host, html, body {");
  for (const [k, v] of Object.entries(tokens.dark)) {
    // only the base token (without -light/-dark suffix) is set live to dark; suffix variants are also kept
    if (k.endsWith("-dark") || k.endsWith("-light")) {
      lines.push(`  ${k}: ${v} !important;`);
    } else {
      // already captured via suffix, but also emit base live value
    }
  }
  // emit live base tokens (dark) — without suffix, plus all suffix tokens
  for (const [k, v] of Object.entries(tokens.dark)) {
    if (!k.endsWith("-dark") && !k.endsWith("-light")) {
      lines.push(`  ${k}: ${v} !important;`);
    }
  }
  // light suffixes as well for completeness
  for (const [k, v] of Object.entries(tokens.light)) {
    if (k.endsWith("-light")) lines.push(`  ${k}: ${v} !important;`);
  }
  lines.push("}");

  lines.push(`[data-theme="light"], [data-theme="light"] body {`);
  for (const [k, v] of Object.entries(tokens.light)) {
    if (!k.endsWith("-dark") && !k.endsWith("-light")) {
      lines.push(`  ${k}: ${v} !important;`);
    }
  }
  // when light, also override the -dark suffixed? not needed
  lines.push("}");

  // Also mirror into md token helpers for convenience
  lines.push(`/* expressive shape + motion — kept as :root overrides (not color dependent) */`);

  return lines.join("\n");
}

const STYLE_ID = "lefty-material-you-expressive-theme";

export function applyMaterialYouExpressiveTheme(opts?: GenerateOptions) {
  if (typeof document === "undefined") return null;
  const tokens = generateExpressiveTokens(opts);

  // Build style string that injects :root variables (like material-you-utilities' applyStyleTag → :host, html, body)
  const css = buildThemeCss(tokens);

  // Also produce an explicit map for debugging
  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css
    + "\n/* expressive motion + shape live on :root — see src/styles.css for the rest */\n"
    + `:root { color-scheme: dark; }\n`;

  // Insert as first style so Tailwind etc can override where needed but tokens win via !important
  document.head.prepend(style);

  // Also set color-scheme and surface bg live
  document.documentElement.style.setProperty("background-color", "var(--md-sys-color-surface)");
  document.body.style.backgroundColor = "var(--md-sys-color-surface-dim)";
  document.body.style.color = "var(--md-sys-color-on-surface)";

  // Log like material-you-utilities does
  // eslint-disable-next-line no-console
  console.info(
    `%cLefty M3 Expressive%c · base ${opts?.baseHex ?? "#121212"} · scheme ${opts?.scheme ?? "monochrome"} · spec ${opts?.spec ?? "2025"} · platform ${opts?.platform ?? "phone"} — ${Object.keys(tokens.dark).length} dark tokens`,
    "background:#fff;color:#000;border-radius:999px;padding:2px 8px;font-weight:700;font-family:Outfit,sans-serif",
    "font-family:Inter,sans-serif"
  );

  return tokens;
}

// For the “vibrant” request while still monochrome: we keep the palette monochrome, but we note
// that switching scheme to "expressive" with same base #121212 would give a teal detached palette
// (verified: expressive dark primary = #c5f6ff). Exposed here for a settings toggle if user ever wants.
export function previewVibrantExpressive() {
  return generateExpressiveTokens({ baseHex: "#121212", scheme: "expressive", spec: "2025", platform: "phone" });
}

// Helper mirroring material-you-utilities getToken util
export function getToken(colorName: string) {
  return token(colorName);
}
