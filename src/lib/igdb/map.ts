import { z } from "zod";

// A PC game found by name outside our catalogue. Player counts are never included: we haven't
// checked how many people can play it together.
export type OtherGame = {
  key: string;
  title: string;
  year: number | null;
  image: string | null;
  steamAppId: number | null;
  // Set when the game came from CheapShark's title search; otherwise looked up by Steam ID.
  cheapsharkGameId: string | null;
  cheapest: number | null;
  links: { name: string; url: string }[];
  // IGDB rating count: picks the well-known game when two share a name ("Hades" 2020 vs 1995).
  popularity: number;
  // Ways to play according to IGDB (not checked by us). `together` is how many can play in one
  // co-op group; IGDB's other numbers are whole-match sizes, so they're never used as a group size.
  play: { label: "Online co-op" | "Local co-op" | "Online multiplayer" | "Local multiplayer"; together: number | null }[];
  singleplayer: boolean;
};

// IGDB website types we link to, with the hosts each one must point at.
// https://api-docs.igdb.com/#website-type
const WEBSITES: Record<number, { name: string; hosts: RegExp | null }> = {
  13: { name: "Steam", hosts: /^store\.steampowered\.com$/ },
  16: { name: "Epic Games Store", hosts: /^(store|www)\.epicgames\.com$/ },
  17: { name: "GOG", hosts: /^www\.gog\.com$/ },
  15: { name: "itch.io", hosts: /\.itch\.io$/ },
  1: { name: "Official site", hosts: null },
};
const STEAM_SOURCE = 1; // external_game_source for Steam

const imageSchema = z.object({ image_id: z.string() });
export const igdbGameSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  first_release_date: z.number().optional(),
  total_rating_count: z.number().optional(),
  game_modes: z.array(z.object({ name: z.string() })).optional(),
  multiplayer_modes: z
    .array(
      z.object({
        platform: z.number().optional(),
        onlinecoop: z.boolean().optional(),
        onlinecoopmax: z.number().optional(),
        offlinecoop: z.boolean().optional(),
        offlinecoopmax: z.number().optional(),
        splitscreen: z.boolean().optional(),
      }),
    )
    .optional(),
  cover: imageSchema.optional(),
  artworks: z.array(imageSchema).optional(),
  screenshots: z.array(imageSchema).optional(),
  websites: z.array(z.object({ type: z.number().optional(), url: z.string() })).optional(),
  external_games: z.array(z.object({ external_game_source: z.number().optional(), uid: z.string().optional() })).optional(),
});
export type IgdbGame = z.infer<typeof igdbGameSchema>;

// IGDB image IDs are short lowercase codes; anything else is ignored rather than put in a URL.
export function igdbImage(imageId: string | undefined, size: "t_screenshot_med" | "t_cover_big" | "t_720p"): string | null {
  return imageId && /^[a-z0-9]{1,40}$/.test(imageId) ? `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg` : null;
}

// Wide art first (artwork, then a screenshot), so it fits the same frame as Steam headers.
export function igdbWideImage(game: IgdbGame): string | null {
  return igdbImage(game.artworks?.[0]?.image_id ?? game.screenshots?.[0]?.image_id, "t_screenshot_med");
}

export function igdbLinks(game: IgdbGame): OtherGame["links"] {
  const links: OtherGame["links"] = [];
  for (const site of game.websites ?? []) {
    const kind = site.type === undefined ? undefined : WEBSITES[site.type];
    if (!kind || links.some((l) => l.name === kind.name)) continue;
    let url: URL;
    try {
      url = new URL(site.url);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || (kind.hosts && !kind.hosts.test(url.hostname))) continue;
    links.push({ name: kind.name, url: url.toString() });
  }
  // Stores first, the official site last.
  return links.sort((a, b) => Number(a.name === "Official site") - Number(b.name === "Official site"));
}

export function igdbSteamAppId(game: IgdbGame): number | null {
  const uid = game.external_games?.find((e) => e.external_game_source === STEAM_SOURCE)?.uid;
  return uid && /^\d{1,9}$/.test(uid) ? Number(uid) : null;
}

const PC = 6; // IGDB platform id

export function igdbPlay(game: IgdbGame): Pick<OtherGame, "play" | "singleplayer"> {
  const modes = new Set((game.game_modes ?? []).map((m) => m.name.toLowerCase()));
  const all = game.multiplayer_modes ?? [];
  // The PC entry when there is one; consoles can differ.
  const mm = all.find((m) => m.platform === PC) ?? all.find((m) => m.platform === undefined) ?? all[0];
  const size = (n: number | undefined) => (n && n > 1 ? n : null);
  const play: OtherGame["play"] = [];
  if (mm?.onlinecoop || size(mm?.onlinecoopmax)) play.push({ label: "Online co-op", together: size(mm?.onlinecoopmax) });
  if (size(mm?.offlinecoopmax) || (mm?.offlinecoop && mm.offlinecoopmax === undefined)) {
    play.push({ label: "Local co-op", together: size(mm?.offlinecoopmax) });
  }
  const online = modes.has("multiplayer") || modes.has("battle royale") || [...modes].some((m) => m.startsWith("massively multiplayer"));
  if (online && !play.some((p) => p.label === "Online co-op")) play.push({ label: "Online multiplayer", together: null });
  if ((modes.has("split screen") || mm?.splitscreen) && !play.some((p) => p.label === "Local co-op")) {
    play.push({ label: "Local multiplayer", together: null });
  }
  return { play, singleplayer: modes.has("single player") };
}

export function toOtherGame(game: IgdbGame): OtherGame {
  return {
    key: `igdb-${game.id}`,
    title: game.name,
    year: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null,
    image: igdbWideImage(game),
    steamAppId: igdbSteamAppId(game),
    cheapsharkGameId: null,
    cheapest: null,
    links: igdbLinks(game),
    popularity: game.total_rating_count ?? 0,
    ...igdbPlay(game),
  };
}
