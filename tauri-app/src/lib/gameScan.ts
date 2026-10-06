import { invoke } from "@tauri-apps/api/core";

// Juego detectado (Steam/Epic): nombre bonito, exe para matchear y arte.
export interface FoundGame {
  source: string;
  name: string;
  /** Basename en minúsculas (Epic) o "" (Steam: matchear por título). */
  exe: string;
  /** Cover Steam o "" (tile con inicial). */
  art: string;
}

/** Escanea juegos instalados (Steam + Epic). Si Epic trae lo que Steam ya
 *  lista (mismo nombre), gana Steam (tiene carátula). */
export async function scanGames(): Promise<FoundGame[]> {
  const [steam, epic] = await Promise.all([
    invoke<FoundGame[]>("scan_steam_games").catch((): FoundGame[] => []),
    invoke<FoundGame[]>("scan_epic_games").catch((): FoundGame[] => []),
  ]);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const steamNames = new Set(steam.map((g) => norm(g.name)));
  const seenExes = new Set<string>();
  const out: FoundGame[] = [];
  const push = (g: FoundGame, preferSteam: boolean) => {
    if (!g.name) return;
    if (!preferSteam) {
      if (steamNames.has(norm(g.name))) return;
      if (g.exe) {
        const e = norm(g.exe);
        if (seenExes.has(e)) return;
        seenExes.add(e);
      }
    }
    out.push(g);
  };
  steam.forEach((g) => push(g, true));
  epic.forEach((g) => push(g, false));
  return out;
}

/** Clave que entra a las listas (exe exacto si lo hay, si no el nombre). */
export function gameKeyOf(g: FoundGame): string {
  return (g.exe || g.name).toLowerCase();
}
