import "server-only";
import { bestTitleMatch, cleanWhy, type Pick } from "@/lib/ai/picks";
import type { Game } from "@/lib/catalogue/schema";
import { igdbConfig } from "./env";
import { searchIgdb } from "./igdb";

// Checks each game the AI recommended. A pick is kept only if it's one of our games or IGDB
// knows a PC game by that name; anything else (a misremembered or invented title) is dropped.
export async function resolvePicks(picks: { title: string; why: string }[], catalogue: readonly Game[]): Promise<Pick[]> {
  const canSearch = igdbConfig() !== null;
  const byId = new Map(catalogue.filter((g) => g.steamAppId !== null).map((g) => [g.steamAppId, g]));

  async function resolve(pick: { title: string; why: string }): Promise<Pick | null> {
    const why = cleanWhy(pick.why);
    const ours = bestTitleMatch(pick.title, catalogue, 0.9);
    if (ours) return { kind: "catalogue", id: ours.id, why };
    if (!canSearch) return null;
    try {
      // Better-known games first, so a name shared by two games resolves to the famous one.
      const results = [...(await searchIgdb(pick.title))].sort((a, b) => b.popularity - a.popularity);
      const found = bestTitleMatch(pick.title, results, 0.8);
      if (!found) return null;
      // The same game under a slightly different name: show our verified entry instead.
      const same = found.steamAppId !== null ? byId.get(found.steamAppId) : undefined;
      return same ? { kind: "catalogue", id: same.id, why } : { kind: "other", game: found, why };
    } catch {
      return null;
    }
  }

  // At most three IGDB searches at a time (IGDB allows four requests per second).
  const resolved: (Pick | null)[] = [];
  const list = picks.slice(0, 6);
  for (let i = 0; i < list.length; i += 3) resolved.push(...(await Promise.all(list.slice(i, i + 3).map(resolve))));

  const seen = new Set<string>();
  return resolved.filter((pick): pick is Pick => {
    if (!pick) return false;
    const key = pick.kind === "catalogue" ? pick.id : pick.game.key;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
