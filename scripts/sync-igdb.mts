// Adds descriptions from IGDB (https://api-docs.igdb.com) to data/catalogue.json, plus artwork
// for games that aren't on Steam. Run after sync:catalogue (which rebuilds the file):
//   npm run sync:igdb      (or `npm run sync` for both)
// Needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env.local.
//
// Games are matched by Steam app ID, or, for games that aren't on Steam, by the reviewed
// igdbId in data/seed.json. Never by name. A game with zero or several matches is left alone
// and reported for review.
import { readFileSync, writeFileSync } from "node:fs";
import { site } from "../src/config/site.ts";
import { catalogueSchema } from "../src/lib/catalogue/schema.ts";
import { igdbWideImage } from "../src/lib/igdb/map.ts";

const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env.local first (see README).");
  process.exit(1);
}

// Server-side OAuth: an app access token from Twitch. The secret is never printed.
const tokenResponse = await fetch(
  `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
  { method: "POST", signal: AbortSignal.timeout(15000) },
);
if (!tokenResponse.ok) {
  console.error(`Twitch token request failed (${tokenResponse.status}). Check the app credentials.`);
  process.exit(1);
}
const { access_token: token } = (await tokenResponse.json()) as { access_token: string };

type IgdbRecord = {
  id: number;
  name: string;
  summary?: string;
  total_rating_count?: number;
  artworks?: { image_id: string }[];
  screenshots?: { image_id: string }[];
};
const GAME_FIELDS = "id, name, summary, total_rating_count, artworks.image_id, screenshots.image_id";

async function igdb<T>(endpoint: string, body: string): Promise<T> {
  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: { "Client-ID": clientId!, Authorization: `Bearer ${token}`, "User-Agent": site.userAgent },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    console.error(`IGDB request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    process.exit(1);
  }
  return (await response.json()) as T;
}

const catalogue = catalogueSchema.parse(JSON.parse(readFileSync("data/catalogue.json", "utf8")));
const seed = JSON.parse(readFileSync("data/seed.json", "utf8")) as { id: string; igdbId?: number }[];
const igdbIds = new Map(seed.filter((s) => s.igdbId).map((s) => [s.id, s.igdbId!]));

// Steam games: one request for every Steam ID (external_game_source 1 is Steam).
const steamIds = catalogue.games.filter((g) => g.steamAppId !== null).map((g) => `"${g.steamAppId}"`);
const steamRows = await igdb<{ uid: string; game?: IgdbRecord }[]>(
  "external_games",
  `fields uid, ${GAME_FIELDS.split(", ").map((f) => `game.${f}`).join(", ")}; where external_game_source = 1 & uid = (${steamIds.join(",")}); limit 500;`,
);
// Other games: by their reviewed IGDB IDs.
const otherRows = igdbIds.size
  ? await igdb<IgdbRecord[]>("games", `fields ${GAME_FIELDS}; where id = (${[...igdbIds.values()].join(",")}); limit 50;`)
  : [];

const today = new Date().toISOString().slice(0, 10);
const issues: string[] = [];
let described = 0;
for (const game of catalogue.games) {
  const matches =
    game.steamAppId !== null
      ? steamRows.filter((row) => row.uid === String(game.steamAppId) && row.game).map((row) => row.game!)
      : otherRows.filter((row) => row.id === igdbIds.get(game.id));
  if (matches.length !== 1) {
    issues.push(`${game.id}: ${matches.length} IGDB records for ${game.steamAppId !== null ? `Steam ID ${game.steamAppId}` : "its igdbId"}`);
    continue;
  }
  const record = matches[0];
  const summary = record.summary?.trim();
  if (summary) {
    game.description = summary.length > 600 ? `${summary.slice(0, 597).trimEnd()}…` : summary;
    described++;
  }
  game.ratingCount = record.total_rating_count ?? 0;
  game.igdbId = record.id;
  // Steam games keep their Steam header; the others get IGDB's wide artwork.
  if (game.image === null) game.image = igdbWideImage(record);
  game.sources = [
    ...game.sources.filter((source) => source.name !== "IGDB"),
    { name: "IGDB", url: `https://www.igdb.com/games/${record.id}`, retrieved: today },
  ];
}

writeFileSync("data/catalogue.json", JSON.stringify(catalogueSchema.parse(catalogue), null, 2) + "\n");
console.log(`Descriptions for ${described} of ${catalogue.games.length} games.`);
console.log(issues.length ? `Needs review:\n- ${issues.join("\n- ")}` : "No issues.");
