import {
  Gamepad2,
  Keyboard,
  Zap,
  Ghost,
  Rocket,
  Trophy,
  Target,
  Crosshair,
  Flame,
  Star,
  Crown,
  Gem,
  Bot,
  Skull,
  Joystick,
  Dices,
  Headphones,
  Monitor,
  Moon,
  Sun,
  Music,
  Coffee,
  Puzzle,
  Sparkles,
  Move,
  Plus,
  Calculator,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ProfileIconDef {
  name: string;
  Icon: LucideIcon;
}

export const PROFILE_ICONS: readonly ProfileIconDef[] = [
  { name: "Gamepad2", Icon: Gamepad2 },
  { name: "Keyboard", Icon: Keyboard },
  { name: "Zap", Icon: Zap },
  { name: "Ghost", Icon: Ghost },
  { name: "Rocket", Icon: Rocket },
  { name: "Trophy", Icon: Trophy },
  { name: "Target", Icon: Target },
  { name: "Crosshair", Icon: Crosshair },
  { name: "Flame", Icon: Flame },
  { name: "Star", Icon: Star },
  { name: "Crown", Icon: Crown },
  { name: "Gem", Icon: Gem },
  { name: "Bot", Icon: Bot },
  { name: "Skull", Icon: Skull },
  { name: "Joystick", Icon: Joystick },
  { name: "Dices", Icon: Dices },
  { name: "Headphones", Icon: Headphones },
  { name: "Monitor", Icon: Monitor },
  { name: "Moon", Icon: Moon },
  { name: "Sun", Icon: Sun },
  { name: "Music", Icon: Music },
  { name: "Coffee", Icon: Coffee },
  { name: "Puzzle", Icon: Puzzle },
  { name: "Sparkles", Icon: Sparkles },
  { name: "Move", Icon: Move },
  { name: "Plus", Icon: Plus },
  { name: "Calculator", Icon: Calculator },
];

const BY_NAME: Record<string, LucideIcon> = Object.fromEntries(
  PROFILE_ICONS.map((d) => [d.name, d.Icon])
);

/** Icono de perfil: componente Lucide por nombre, o glifo legacy como texto. */
export function ProfileGlyph({
  icon,
  size = 14,
}: {
  icon: string;
  size?: number;
}): JSX.Element {
  const C = BY_NAME[icon];
  if (C) return <C size={size} />;
  return <span style={{ fontSize: size }}>{icon}</span>;
}

export const DEFAULT_PROFILE_ICON = "Gamepad2";

/** Glifos legacy → Lucide. Lo desconocido se conserva tal cual (fallback texto). */
const LEGACY_GLYPH_MAP: Record<string, string> = {
  "◆": "Zap",
  "◇": "Keyboard",
  "→": "Move",
  "↑": "Move",
  "✦": "Sparkles",
  "✧": "Sparkles",
  "★": "Star",
  "☆": "Star",
  "➔": "Move",
  "⚡": "Flame",
  "☾": "Moon",
  "☀": "Sun",
  "❄": "Ghost",
  "◈": "Crosshair",
  "◎": "Target",
  "●": "Gem",
  "○": "Monitor",
  "■": "Coffee",
  "□": "Puzzle",
  "▲": "Trophy",
  "△": "Rocket",
  "▶": "Gamepad2",
  "▷": "Bot",
  "⬢": "Crown",
  "⬣": "Skull",
};

export function migrateLegacyIcon(icon: string): string {
  return LEGACY_GLYPH_MAP[icon] ?? icon;
}

export function isProfileIconName(icon: string): boolean {
  return icon in BY_NAME;
}
