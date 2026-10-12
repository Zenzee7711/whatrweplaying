// Builds data/catalogue.json from data/seed.json. Run occasionally, by hand:
//   npm run sync:catalogue
// Multiplayer facts come from PCGamingWiki (CC BY-NC-SA 3.0). The CheapShark game ID is
// looked up by Steam app ID only, never by title. Requests are throttled.
import { readFileSync, writeFileSync } from "node:fs";
import { parsePcgw } from "../src/lib/catalogue/pcgw.ts";
import { catalogueSchema, type Game } from "../src/lib/catalogue/schema.ts";
import { site } from "../src/config/site.ts";

const { userAgent } = site;
const today = new Date().toISOString().slice(0, 10);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { ...init, headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(15000) });
    if (response.status !== 429) return response;
    const wait = Number(response.headers.get("retry-after") ?? "10");
    console.warn(`  rate limited, waiting ${wait}s`);
    await pause(wait * 1000);
  }
  throw new Error(`Still rate limited: ${url}`);
}

// Reads a page's wiki source through the official MediaWiki API, following redirects.
// The seed names the page (a reviewed mapping); the loop below then checks its Steam ID.
// (PCGamingWiki's /api/appid.php shortcut is blocked for scripts by its bot protection.)
async function pcgwPage(page: string): Promise<{ title: string; wikitext: string }> {
  const url = `https://www.pcgamingwiki.com/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&page=${encodeURIComponent(page)}`;
  const data = await (await get(url)).json();
  if (data.error) throw new Error(`PCGamingWiki: ${data.error.info}`);
  return { title: data.parse.title as string, wikitext: data.parse.wikitext as string };
}

async function cheapsharkGameId(steamAppId: number): Promise<{ id: string | null; issue?: string }> {
  const response = await get(`https://www.cheapshark.com/api/1.0/games?steamAppID=${steamAppId}`);
  const list = (await response.json()) as { gameID: string; steamAppID: string | null; external: string }[];
  const exact = list.filter((game) => game.steamAppID === String(steamAppId));
  if (exact.length === 1) return { id: exact[0].gameID };
  if (exact.length === 0) return { id: null, issue: "no CheapShark record for this Steam ID" };
  return { id: null, issue: `ambiguous: ${exact.length} CheapShark records (${exact.map((g) => g.external).join(" / ")})` };
}

const seed = JSON.parse(readFileSync("data/seed.json", "utf8")) as {
  id: string;
  steamAppId: number;
  pcgwPage: string;
}[];
// Hand-reviewed corrections, each with the source it was checked against.
type Override = {
  local?: { coopPlayers?: Game["local"]["coopPlayers"]; versusPlayers?: Game["local"]["versusPlayers"] };
  online?: { coopPlayers?: Game["online"]["coopPlayers"]; versusPlayers?: Game["online"]["versusPlayers"] };
  source: { name: string; url: string; retrieved: string };
  note: string;
};
const overrides = JSON.parse(readFileSync("data/overrides.json", "utf8")) as Record<string, Override>;

const games: Game[] = [];
const issues: string[] = [];

for (const { id, steamAppId, pcgwPage: seedPage } of seed) {
  try {
    const { title: page, wikitext } = await pcgwPage(seedPage);
    await pause(1200);
    const facts = parsePcgw(wikitext);
    if (!facts.steamAppIds.includes(steamAppId)) {
      issues.push(`${id}: page "${page}" lists Steam IDs ${facts.steamAppIds.join(",") || "none"}, not ${steamAppId}; excluded`);
      continue;
    }
    const cheapshark = await cheapsharkGameId(steamAppId);
    await pause(1200);
    if (cheapshark.issue) issues.push(`${id}: ${cheapshark.issue}`);

    const override = overrides[id];
    if (override) {
      Object.assign(facts.local, override.local ?? {});
      Object.assign(facts.online, override.online ?? {});
    }
    if (facts.online.sharedRange && !facts.online.coopPlayers) {
      issues.push(`${id}: one online range for co-op and versus; co-op size unverified until reviewed`);
    }

    const pageUrl = `https://www.pcgamingwiki.com/wiki/${encodeURIComponent(page.replace(/ /g, "_"))}`;
    games.push({
      id,
      title: page.replace(/_/g, " "),
      steamAppId,
      cheapsharkGameId: cheapshark.id,
      platforms: ["pc"],
      monetization: facts.monetization,
      singleplayer: facts.singleplayer,
      local: facts.local,
      lan: facts.lan,
      online: facts.online,
      crossplayNote: facts.crossplayNote,
      genres: facts.genres,
      themes: facts.themes,
      description: null,
      image: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
      sources: [
        { name: "PCGamingWiki", url: pageUrl, retrieved: today },
        ...(override ? [{ ...override.source, name: `${override.source.name} (reviewed: ${override.note})` }] : []),
      ],
    });
    const show = (c: Game["online"]) =>
      c.supported ? `${c.players ? `${c.players.min ?? "?"}-${c.players.max}` : "?"}${c.coop ? " co-op" : ""}${c.versus ? " vs" : ""}` : String(c.supported);
    console.log(`${id.padEnd(34)} local ${show(facts.local).padEnd(16)} online ${show(facts.online).padEnd(16)} ${facts.monetization}`);
  } catch (error) {
    issues.push(`${id}: ${(error as Error).message}`);
  }
}

const catalogue = catalogueSchema.parse({ generated: today, games });
writeFileSync("data/catalogue.json", JSON.stringify(catalogue, null, 2) + "\n");
console.log(`\nWrote ${games.length} games to data/catalogue.json`);
if (issues.length) console.log(`\nNeeds review:\n- ${issues.join("\n- ")}`);
