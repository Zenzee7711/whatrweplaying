// Adds game descriptions from IGDB (https://api-docs.igdb.com) to data/catalogue.json.
//   node --env-file=.env.local scripts/sync-igdb.mts
// NOT YET TESTED against the live API: it needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.
// Before trusting it, run it once and inspect a few records: IGDB has renamed fields before
// (check the external_games docs for how Steam IDs are filtered).
//
// Games are matched by Steam app ID only. A game whose Steam ID matches zero or several IGDB
// records is left without a description and reported for review.
import { readFileSync, writeFileSync } from "node:fs";
import { site } from "../src/config/site.ts";
import { catalogueSchema } from "../src/lib/catalogue/schema.ts";

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

const catalogue = catalogueSchema.parse(JSON.parse(readFileSync("data/catalogue.json", "utf8")));
const steamIds = catalogue.games.map((game) => `"${game.steamAppId}"`).join(",");

// One request for every game (IGDB allows up to 500 results; the documented limit is 4 req/s).
const response = await fetch("https://api.igdb.com/v4/external_games", {
  method: "POST",
  headers: { "Client-ID": clientId, Authorization: `Bearer ${token}`, "User-Agent": site.userAgent },
  body: `fields uid, game.id, game.name, game.summary; where external_game_source = 1 & uid = (${steamIds}); limit 500;`,
  signal: AbortSignal.timeout(20000),
});
if (!response.ok) {
  console.error(`IGDB request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  process.exit(1);
}
const rows = (await response.json()) as { uid: string; game?: { id: number; name: string; summary?: string } }[];

const today = new Date().toISOString().slice(0, 10);
const issues: string[] = [];
for (const game of catalogue.games) {
  const matches = rows.filter((row) => row.uid === String(game.steamAppId) && row.game);
  if (matches.length !== 1) {
    issues.push(`${game.id}: ${matches.length} IGDB records for Steam ID ${game.steamAppId}`);
    continue;
  }
  const summary = matches[0].game!.summary?.trim();
  if (!summary) continue;
  game.description = summary.length > 600 ? `${summary.slice(0, 597)}…` : summary;
  game.sources = [
    ...game.sources.filter((source) => source.name !== "IGDB"),
    { name: "IGDB", url: `https://www.igdb.com/games/${matches[0].game!.id}`, retrieved: today },
  ];
}

writeFileSync("data/catalogue.json", JSON.stringify(catalogueSchema.parse(catalogue), null, 2) + "\n");
console.log(`Descriptions updated. ${issues.length ? `Needs review:\n- ${issues.join("\n- ")}` : "No issues."}`);
