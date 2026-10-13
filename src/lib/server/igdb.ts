import "server-only";
import { z } from "zod";
import { site } from "@/config/site";
import { igdbGameSchema, toOtherGame, type OtherGame } from "@/lib/igdb/map";
import { igdbConfig } from "./env";

// IGDB (https://api-docs.igdb.com) on the server: the Twitch credentials and the access token
// never leave this file. Results are cached in memory so repeated searches don't use the quota
// (IGDB allows 4 requests per second).

export class IgdbUnavailableError extends Error {}

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(clientId: string, clientSecret: string): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: "POST", signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw new IgdbUnavailableError(`Twitch token request failed (${response.status})`);
  const data = z.object({ access_token: z.string().min(10), expires_in: z.number() }).parse(await response.json());
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function igdb(endpoint: "games", body: string): Promise<unknown> {
  const config = igdbConfig();
  if (!config) throw new IgdbUnavailableError("IGDB isn't configured");
  const send = async () =>
    fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": config.clientId,
        Authorization: `Bearer ${await accessToken(config.clientId, config.clientSecret)}`,
        "Content-Type": "text/plain",
        "User-Agent": site.userAgent,
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
  let response = await send();
  // A token revoked early: get a fresh one once.
  if (response.status === 401) {
    token = null;
    response = await send();
  }
  if (!response.ok) throw new IgdbUnavailableError(`IGDB responded ${response.status}`);
  return response.json();
}

const cache = new Map<string, { at: number; games: OtherGame[] }>();
const CACHE_MS = 6 * 60 * 60 * 1000;

// PC games only, main games and their standalone versions (not DLC, mods or bundles).
// https://api-docs.igdb.com/#game-type: 0 main, 4 standalone expansion, 8 remake, 9 remaster,
// 10 expanded game, 11 port. Editions (Deluxe, Premium...) have a version_parent and are skipped.
export async function searchIgdb(query: string): Promise<OtherGame[]> {
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.games;

  // Only letters, digits, spaces and common title punctuation reach the query string.
  const safe = query.replace(/[^\p{L}\p{N} :'&!.,-]/gu, " ").trim();
  const body = [
    `search "${safe}";`,
    "fields name, first_release_date, total_rating_count, cover.image_id, artworks.image_id, screenshots.image_id,",
    "websites.type, websites.url, external_games.external_game_source, external_games.uid;",
    "where platforms = (6) & game_type = (0,4,8,9,10,11) & version_parent = null;",
    "limit 15;",
  ].join(" ");
  const rows = z.array(igdbGameSchema).parse(await igdb("games", body));
  const games = rows.map(toOtherGame);

  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), games });
  return games;
}
