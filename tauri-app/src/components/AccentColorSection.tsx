import { Check, Contrast, Palette, Pipette } from "lucide-react";
import {
  ACCENT_PRESETS,
  CUSTOM_KEY,
  adjustForContrast,
  contrastOn,
  useAccent,
} from "../theme/accent";

const RING =
  "ring-2 ring-offset-2 ring-offset-surface-container-high ring-white/80 scale-105";

/** Tarjeta "Accent Color" para la sección APPEARANCE de Settings. */
export default function AccentColorSection(): JSX.Element {
  const { accent, setAccent, setCustomHex, highContrast, setHighContrast } = useAccent();
  const painted = highContrast ? adjustForContrast(accent.hex) : accent.hex;
  const adjusted = painted !== accent.hex;

  return (
    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0">
          <Palette size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-on-surface">Accent Color</div>
          <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">
            Active state, selected profile, action buttons & toggles.{" "}
            <span className="font-medium text-on-surface">{accent.name}</span>{" "}
            <span className="font-mono bg-surface-container-highest border border-outline-variant px-1.5 py-0.5 rounded-full">
              {accent.hex}
            </span>
          </div>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-on-surface-variant mt-3">
        Global default. A profile can override it from Edit profile → Accent.
      </p>

      <div
        className="flex flex-wrap items-center gap-2.5 mt-4"
        role="radiogroup"
        aria-label="Accent color"
      >
        {ACCENT_PRESETS.map((p) => {
          const selected = !accent.isCustom && accent.key === p.id;
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={selected}
              aria-label={p.name}
              title={p.name}
              onClick={() => setAccent(p.id)}
              style={{ backgroundColor: p.hex }}
              className={`w-9 h-9 rounded-full grid place-items-center border border-outline-variant m3-pressable active:scale-90 transition-transform duration-150 hover:scale-110 ${
                selected ? RING : "opacity-80 hover:opacity-100"
              }`}
            >
              {selected && (
                <Check size={15} strokeWidth={3} style={{ color: contrastOn(p.hex) }} />
              )}
            </button>
          );
        })}

        {/* Color personalizado */}
        <label
          title="Custom color"
          className={`w-9 h-9 rounded-full grid place-items-center border border-outline-variant cursor-pointer m3-pressable active:scale-90 transition-transform duration-150 hover:scale-110 ${
            accent.isCustom ? RING : "opacity-80 hover:opacity-100"
          }`}
          style={{
            background:
              "conic-gradient(#EF4444,#F59E0B,#84CC16,#06B6D4,#3B82F6,#8B5CF6,#EC4899,#EF4444)",
          }}
        >
          <span className="sr-only">Custom color ({CUSTOM_KEY})</span>
          <input
            type="color"
            aria-label="Custom color picker"
            className="sr-only"
            value={accent.hex}
            onChange={(e) => setCustomHex(e.target.value)}
          />
          {accent.isCustom ? (
            <Check size={15} strokeWidth={3} style={{ color: contrastOn(accent.hex) }} />
          ) : (
            <Pipette size={14} strokeWidth={2.5} color="#FFFFFF" />
          )}
        </label>
      </div>

      <div className="mt-4 pt-4 border-t border-outline-variant flex items-start gap-3">
        <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0">
          <Contrast size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-on-surface">High contrast</div>
          <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">
            Auto-darkens or lightens the accent for ≥4.5:1 legibility.
            {adjusted && (
              <>
                {" "}Now painted as{" "}
                <span className="font-mono bg-surface-container-highest border border-outline-variant px-1.5 py-0.5 rounded-full">
                  {painted}
                </span>
              </>
            )}
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
          <input
            type="checkbox"
            checked={highContrast}
            onChange={(e) => setHighContrast(e.target.checked)}
            aria-label="High contrast accent"
            className="sr-only peer"
          />
          <div className="w-11 h-7 bg-surface-container-highest border-2 border-outline rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all before:content-[''] before:absolute before:top-[3px] before:left-[3px] before:bg-outline before:rounded-full before:h-5 before:w-5 before:transition-all peer-checked:before:translate-x-[18px] peer-checked:before:bg-on-primary"></div>
        </label>
      </div>
    </div>
  );
}
