import { useEffect, useState } from "react";
import { Gamepad2, Search, X } from "lucide-react";
import { gameKeyOf, scanGames, type FoundGame } from "../lib/gameScan";

interface Props {
  title: string;
  onPick: (key: string) => void;
  isTaken: (key: string) => boolean;
  onClose: () => void;
}

/** Explora juegos instalados (Steam/Epic) para añadir por nombre, con cover. */
export default function GameBrowser({ title, onPick, isTaken, onClose }: Props) {
  const [games, setGames] = useState<FoundGame[] | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let live = true;
    scanGames().then((g) => {
      if (live) setGames(g);
    });
    return () => {
      live = false;
    };
  }, []);

  const q = filter.trim().toLowerCase();
  const visible = (games ?? []).filter(
    (g) => !q || g.name.toLowerCase().includes(q) || g.exe.includes(q)
  );

  return (
    <div className="fixed inset-0 bg-scrim/70 backdrop-blur-sm grid place-items-center z-[70] p-4 m3-backdrop animate-m3-backdrop-in" onClick={onClose}>
      <div className="w-full max-w-[440px] max-h-[80vh] bg-surface-container rounded-[28px] border border-outline-variant shadow-m3-3 flex flex-col overflow-hidden m3-modal animate-m3-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-outline-variant flex items-center gap-3">
          <span className="w-10 h-10 rounded-[14px] bg-primary text-on-primary grid place-items-center shrink-0 shadow-m3-1"><Gamepad2 size={18} /></span>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-display font-semibold text-on-surface leading-none">{title}</h3>
            <p className="text-[11px] text-on-surface-variant mt-1.5">Installed Steam & Epic games</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-surface-container-highest border border-outline-variant hover:bg-primary hover:border-primary hover:text-on-primary grid place-items-center text-on-surface-variant transition-colors m3-pressable active:scale-90">✕</button>
        </div>
        <div className="px-5 pt-3">
          <div className="flex items-center gap-2 h-10 rounded-xl bg-surface-container-highest border border-outline-variant px-3">
            <Search size={14} className="text-on-surface-variant shrink-0" />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search games…"
              aria-label="Search games"
              className="flex-1 h-full bg-transparent text-[13px] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
            />
            {filter && (
              <button onClick={() => setFilter("")} aria-label="Clear search" className="w-6 h-6 grid place-items-center rounded-full text-on-surface-variant hover:text-on-surface">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-1.5">
          {games === null ? (
            <p className="text-[12px] text-on-surface-variant text-center py-10 animate-pulse">Scanning libraries…</p>
          ) : visible.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-[13px] font-medium text-on-surface">{games.length === 0 ? "No games found" : "No matches"}</p>
              <p className="text-[11px] text-on-surface-variant mt-1">{games.length === 0 ? "Install games on Steam or Epic to see them here." : "Try another search."}</p>
            </div>
          ) : (
            visible.map((g) => {
              const key = gameKeyOf(g);
              const taken = isTaken(key);
              return (
                <div key={`${g.source}:${g.exe || g.name}`} className="flex items-center gap-3 p-2 rounded-xl border border-outline-variant bg-surface-container-high">
                  {g.art ? (
                    <img src={g.art} alt="" loading="lazy" className="w-16 h-9 rounded-lg object-cover shrink-0 border border-outline-variant" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <span className="w-9 h-9 rounded-lg bg-secondary-container text-on-secondary-container grid place-items-center text-[13px] font-medium shrink-0">
                      {g.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-on-surface truncate">{g.name}</div>
                    <div className="text-[10px] font-mono text-on-surface-variant truncate">{g.exe || g.name.toLowerCase()} · {g.source}</div>
                  </div>
                  <button
                    onClick={() => onPick(key)}
                    disabled={taken}
                    className={`h-8 px-4 rounded-full text-[12px] font-medium shrink-0 m3-pressable active:scale-[0.97] ${taken ? "bg-surface-container-highest border border-outline-variant text-on-surface-variant opacity-60 cursor-default" : "bg-primary text-on-primary shadow-m3-1"}`}
                  >
                    {taken ? "Added" : "Add"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
