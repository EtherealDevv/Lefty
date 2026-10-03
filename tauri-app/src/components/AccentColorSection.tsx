import { Check, Palette, Pipette } from "lucide-react";
import {
  ACCENT_PRESETS,
  CUSTOM_KEY,
  applyAccent,
  contrastOn,
  useAccent,
} from "../theme/accent";

const RING =
  "ring-2 ring-offset-2 ring-offset-surface-container-high ring-white/80 scale-105";

/** Tarjeta "Accent Color" para la sección APPEARANCE de Settings. */
export default function AccentColorSection(): JSX.Element {
  const { accent, setAccent, setCustomHex } = useAccent();

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
              onClick={() => {
                applyAccent(p.hex); // pintado inmediato, sin esperar al efecto
                setAccent(p.id);
              }}
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
            onChange={(e) => {
              applyAccent(e.target.value.toUpperCase()); // preview en vivo
              setCustomHex(e.target.value);
            }}
          />
          {accent.isCustom ? (
            <Check size={15} strokeWidth={3} style={{ color: contrastOn(accent.hex) }} />
          ) : (
            <Pipette size={14} strokeWidth={2.5} color="#FFFFFF" />
          )}
        </label>
      </div>
    </div>
  );
}
