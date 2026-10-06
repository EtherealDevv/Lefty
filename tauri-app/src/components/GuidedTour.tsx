import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { ProfileGlyph } from "../lib/profileIcons";

interface TourStep {
  selector: string;
  title: string;
  text: string;
}

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="profiles"]',
    title: "Choose a profile",
    text: "Pick a left-handed layout on the left. Each one remaps keys for a different play style.",
  },
  {
    selector: '[data-tour="switch"]',
    title: "Activate it",
    text: "Flip the switch — or press F6 in-game. Mappings apply instantly, system-wide.",
  },
  {
    selector: '[data-tour="add"]',
    title: "Add mappings",
    text: "Let's create one together — press Next and I'll open the editor.",
  },
  {
    selector: '[data-tour="add-source"]',
    title: "The key you press",
    text: "Type it, pick from the list, or hit Capture and press the physical key — even mouse side buttons.",
  },
  {
    selector: '[data-tour="add-target"]',
    title: "What it types",
    text: "Same here. Duplicates and self-maps are blocked with a warning.",
  },
  {
    selector: '[data-tour="add-mods"]',
    title: "Combo it",
    text: "Hold Ctrl, Shift, Alt or Win with the target — I becomes Ctrl+S. No mods, single key.",
  },
  {
    selector: '[data-tour="add-save"]',
    title: "Save it",
    text: "Save lights up only when the mapping is valid. Cancel discards — nothing is written.",
  },
  {
    selector: '[data-tour="settings"]',
    title: "Make it yours",
    text: "Accent, games, sounds, backups and more — all in Settings. Enjoy, lefty.",
  },
];

const PAD = 8;
const TIP_W = 312;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Primer elemento visible que matchee (los duplicados mobile/desktop conviven en el DOM). */
function targetRect(selector: string): Rect | null {
  const els = Array.from(document.querySelectorAll(selector));
  for (const el of els) {
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  return null;
}

export interface TourProfile {
  id: string;
  name: string;
  icon: string;
}

/** Tour guiado con spotlight sobre la UI real. Sin target visible: tarjeta centrada. */
export default function GuidedTour({
  onDone,
  onStepEnter,
  profiles,
  activeId,
  onSelectProfile,
}: {
  onDone: () => void;
  onStepEnter: (step: number) => void;
  profiles: TourProfile[];
  activeId: string;
  onSelectProfile: (id: string) => void;
}) {
  const [step, setStep] = useState(0);
  // undefined = aún sin medir (no se muestra nada: evita el flash centrado).
  const [rect, setRect] = useState<Rect | null | undefined>(undefined);
  const s = STEPS[step];

  const refresh = useCallback((commitMissing: boolean) => {
    const r = targetRect(STEPS[step].selector);
    if (r || commitMissing) setRect(r);
  }, [step]);

  useEffect(() => {
    setRect(undefined);
    refresh(false);
    // Re-medir tras la animación de entrada del target (el modal Add hace
    // slide-up 400ms y el primer rect sale desplazado).
    const t1 = window.setTimeout(() => refresh(true), 450);
    const t2 = window.setTimeout(() => refresh(true), 1500);
    const onRs = () => refresh(true);
    window.addEventListener("resize", onRs);
    window.addEventListener("scroll", onRs, true);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", onRs);
      window.removeEventListener("scroll", onRs, true);
    };
  }, [refresh]);

  useEffect(() => {
    onStepEnter(step);
  }, [step, onStepEnter]);

  if (rect === undefined) {
    return <div className="fixed inset-0 z-[70]" aria-hidden />;
  }

  const tall = rect !== null && rect.h > 420;
  const below = rect !== null && !tall && rect.y + rect.h + 300 < window.innerHeight;
  const roomRight = rect !== null && rect.x + rect.w + 14 + TIP_W + 12 <= window.innerWidth;
  let tip: CSSProperties;
  if (rect === null) {
    tip = { left: "50%", top: "50%", transform: "translate(-50%,-50%)" };
  } else if (tall) {
    // Targets altos (sidebar, listas): tooltip al costado para no tapar.
    const top = Math.max(12, Math.min(window.innerHeight - 280, rect.y + rect.h / 2 - 140));
    tip = roomRight
      ? { left: rect.x + rect.w + 14, top }
      : { left: Math.max(12, rect.x - 14 - TIP_W), top };
  } else if (below) {
    tip = {
      left: Math.max(12, Math.min(window.innerWidth - TIP_W - 12, rect.x + rect.w / 2 - TIP_W / 2)),
      top: rect.y + rect.h + PAD + 6,
    };
  } else {
    tip = {
      left: Math.max(12, Math.min(window.innerWidth - TIP_W - 12, rect.x + rect.w / 2 - TIP_W / 2)),
      top: Math.max(12, rect.y - 14 - 250),
    };
  }

  return (
    <div className="fixed inset-0 z-[70]">
      {rect ? (
        <div
          aria-hidden
          className="fixed rounded-2xl border-2 border-primary transition-all duration-300 pointer-events-none"
          style={{
            left: rect.x - PAD,
            top: rect.y - PAD,
            width: rect.w + PAD * 2,
            height: rect.h + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-scrim/70" />
      )}
      <div
        className="fixed bg-surface-container rounded-[24px] border border-outline-variant shadow-m3-3 p-5 transition-all duration-300 ease-out"
        style={{ ...tip, width: TIP_W }}
      >
        <div key={step} className="animate-m3-fade-in">
        <div className="text-[10px] font-medium tracking-widest text-on-surface-variant">
          STEP {step + 1} OF {STEPS.length}
        </div>
        <h3 className="text-[16px] font-display font-medium text-on-surface mt-1">{s.title}</h3>
        <p className="text-[13px] leading-relaxed text-on-surface-variant mt-2">{s.text}</p>
        {step === 0 && profiles.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-3" role="radiogroup" aria-label="Choose layout">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={activeId === p.id}
                onClick={() => onSelectProfile(p.id)}
                title={p.name}
                className={`h-11 px-2 rounded-xl border text-[12px] font-medium flex items-center gap-2 transition-colors ${activeId === p.id ? "bg-primary text-on-primary border-primary" : "bg-surface-container-highest border-outline-variant text-on-surface hover:border-primary"}`}
              >
                <ProfileGlyph icon={p.icon} size={15} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-4" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-primary" : i < step ? "w-1.5 bg-primary/50" : "w-1.5 bg-outline-variant"}`}
            />
          ))}
        </div>
        <div className="flex gap-2.5 mt-4">
          {step > 0 ? (
            <button
              onClick={() => setStep((v) => Math.max(0, v - 1))}
              className="flex-1 h-11 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-container-high text-[13px] font-medium m3-pressable active:scale-[0.97]"
            >
              Back
            </button>
          ) : (
            <button
              onClick={onDone}
              className="flex-1 h-11 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high text-[13px] font-medium m3-pressable active:scale-[0.97]"
            >
              Skip
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((v) => Math.min(STEPS.length - 1, v + 1))}
              className="flex-1 h-11 rounded-full bg-primary text-on-primary text-[13px] font-medium shadow-m3-1 m3-pressable active:scale-[0.97]"
            >
              Next
            </button>
          ) : (
            <button
              onClick={onDone}
              className="flex-1 h-11 rounded-full bg-primary text-on-primary text-[13px] font-medium shadow-m3-1 m3-pressable active:scale-[0.97]"
            >
              Start playing
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
