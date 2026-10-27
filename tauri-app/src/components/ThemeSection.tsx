import { Check, Monitor, Zap } from "lucide-react";
import { THEME_PRESETS, useAccent } from "../theme/accent";

const ICONS = {
  default: Monitor,
  cyberpunk: Zap,
} as const;

/** Selector de tema visual para la sección APPEARANCE de Settings. */
export default function ThemeSection(): JSX.Element {
  const { theme, setTheme } = useAccent();

  return (
    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0">
          <Zap size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-on-surface">Theme</div>
          <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">
            Choose the visual language. Layout and overlay structure stay untouched.
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4"
        role="radiogroup"
        aria-label="Theme"
      >
        {THEME_PRESETS.map((preset) => {
          const selected = theme === preset.id;
          const Icon = ICONS[preset.id];
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(preset.id)}
              className={`text-left rounded-xl border p-3 transition-all duration-150 m3-pressable active:scale-[0.98] ${
                selected
                  ? "border-primary bg-primary/10 shadow-m3-1"
                  : "border-outline-variant bg-surface-container-highest hover:border-primary/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[12px] font-medium text-on-surface">
                    <Icon size={14} className="shrink-0" />
                    <span className="truncate">{preset.name}</span>
                  </div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-widest text-on-surface-variant">
                    {preset.tagline}
                  </div>
                </div>
                {selected && (
                  <span className="w-5 h-5 rounded-full bg-primary text-on-primary grid place-items-center shrink-0">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </div>

              <div className="mt-3 flex gap-1.5" aria-hidden>
                {preset.swatches.map((color) => (
                  <span
                    key={color}
                    className="h-2 flex-1 rounded-full border border-black/20"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              <p className="mt-2 text-[10px] leading-relaxed text-on-surface-variant">
                {preset.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
