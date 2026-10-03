// Earcons propios para Activate/Pause — sintetizados con WebAudio.
// Sin archivos de audio y sin sonidos del sistema de Windows:
//  - ON: quinta ascendente brillante (C5 → G5) con cuerpo cálido.
//  - OFF: quinta descendente suave (G5 → C5), un poco más tenue.

const LS_SOUNDS = "lefty_sounds";

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(LS_SOUNDS) !== "false"; // ON por defecto
  } catch {
    return true;
  }
}

export function setSoundEnabled(v: boolean): void {
  try {
    localStorage.setItem(LS_SOUNDS, String(v));
  } catch {
    /* almacenamiento no disponible: sigue sonando en sesión */
  }
}

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/** Llamar desde cualquier gesto del usuario para desbloquear el audio (autoplay policy). */
export function unlockAudio(): void {
  ensureCtx();
}

interface ToneOpts {
  freq: number;
  at: number;
  dur: number;
  vol: number;
  type?: OscillatorType;
}

function tone(ac: AudioContext, dest: AudioNode, o: ToneOpts): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, o.at);
  g.gain.setValueAtTime(0.0001, o.at);
  g.gain.exponentialRampToValueAtTime(Math.max(o.vol, 0.0002), o.at + 0.014);
  g.gain.exponentialRampToValueAtTime(0.0001, o.at + o.dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(o.at);
  osc.stop(o.at + o.dur + 0.05);
}

export function playToggleSound(on: boolean): void {
  if (!isSoundEnabled()) return;
  const ac = ensureCtx();
  // Si el contexto sigue bloqueado (sin gesto previo), silencio sin errores.
  if (!ac || ac.state !== "running") return;
  const t = ac.currentTime + 0.01;
  const master = ac.createGain();
  master.gain.value = 1;
  master.connect(ac.destination);
  if (on) {
    tone(ac, master, { freq: 523.25, at: t, dur: 0.22, vol: 0.16, type: "triangle" });
    tone(ac, master, { freq: 783.99, at: t + 0.085, dur: 0.26, vol: 0.18, type: "sine" });
    tone(ac, master, { freq: 261.63, at: t, dur: 0.24, vol: 0.05, type: "sine" });
    tone(ac, master, { freq: 1567.98, at: t + 0.085, dur: 0.18, vol: 0.03, type: "sine" });
  } else {
    tone(ac, master, { freq: 783.99, at: t, dur: 0.2, vol: 0.13, type: "sine" });
    tone(ac, master, { freq: 523.25, at: t + 0.085, dur: 0.24, vol: 0.15, type: "triangle" });
    tone(ac, master, { freq: 261.63, at: t + 0.085, dur: 0.22, vol: 0.04, type: "sine" });
  }
}
