// "Popular right now": how many people play each game at the moment, as a 0–1 rank within the
// catalogue (1 = most played). Steam's live player counts and IGDB's "playing" counts are on
// different scales, so each is ranked on its own and the ranks are compared instead.

export type Popularity = {
  rank: Record<string, number>;
  // Live Steam player counts by game id, shown on cards.
  playingNow: Record<string, number>;
};

export function percentileRanks(values: Record<string, number>): Record<string, number> {
  const sorted = Object.entries(values).sort((a, b) => a[1] - b[1]);
  if (sorted.length === 1) return { [sorted[0][0]]: 1 };
  return Object.fromEntries(sorted.map(([id], i) => [id, i / (sorted.length - 1)]));
}

// Steam games are ranked by Steam players right now; games that aren't on Steam (or whose count
// couldn't be read) by IGDB's count of people currently playing.
export function trendingRanks(steamPlayers: Record<string, number>, igdbPlaying: Record<string, number>): Record<string, number> {
  const steam = percentileRanks(steamPlayers);
  const igdb = percentileRanks(igdbPlaying);
  const ids = new Set([...Object.keys(steam), ...Object.keys(igdb)]);
  return Object.fromEntries([...ids].map((id) => [id, steam[id] ?? igdb[id]]));
}
