import "server-only";
import type { Game } from "@/lib/catalogue/schema";
import { trendingRanks, type Popularity } from "@/lib/search/popularity";
import { igdbConfig } from "./env";
import { igdbPlaying } from "./igdb";

// What's being played right now, for the default order. Steam's public API gives live player
// counts (no key needed); IGDB covers games sold elsewhere. Refreshed at most every 30 minutes,
// and the page never waits more than a few seconds for it.

const REFRESH_MS = 30 * 60 * 1000;
let cached: { at: number; value: Popularity } | null = null;

async function steamPlayers(appId: number): Promise<number | null> {
  try {
    const response = await fetch(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`, {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: REFRESH_MS / 1000 },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const count = data?.response?.player_count;
    return data?.response?.result === 1 && Number.isInteger(count) && count >= 0 ? count : null;
  } catch {
    return null;
  }
}

async function load(games: readonly Game[]): Promise<Popularity | null> {
  if (cached && Date.now() - cached.at < REFRESH_MS) return cached.value;
  // Games mainly sold elsewhere (e.g. Rocket League, now on Epic) would look quiet on Steam,
  // so only games without another launcher use Steam's count.
  const onSteam = games.filter((g) => g.steamAppId !== null && !g.launcher);
  const [counts, playing] = await Promise.all([
    Promise.all(onSteam.map(async (g) => [g.id, await steamPlayers(g.steamAppId!)] as const)),
    igdbConfig() ? igdbPlaying(games.flatMap((g) => (g.igdbId ? [g.igdbId] : []))).catch(() => ({})) : Promise.resolve({}),
  ]);
  const playingNow = Object.fromEntries(counts.filter((entry): entry is readonly [string, number] => entry[1] !== null));
  const igdb: Record<string, number> = Object.fromEntries(
    games.filter((g) => g.igdbId && (playing as Record<number, number>)[g.igdbId] !== undefined).map((g) => [g.id, (playing as Record<number, number>)[g.igdbId!]]),
  );
  if (Object.keys(playingNow).length === 0 && Object.keys(igdb).length === 0) return null;
  const value = { rank: trendingRanks(playingNow, igdb), playingNow };
  cached = { at: Date.now(), value };
  return value;
}

export async function currentPopularity(games: readonly Game[]): Promise<Popularity | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
  return Promise.race([load(games).catch(() => null), timeout]);
}
