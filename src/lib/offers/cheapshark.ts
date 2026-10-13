import { z } from "zod";
import type { Game } from "../catalogue/schema.ts";
import type { OtherGame } from "../igdb/map.ts";
import type { Offer, OfferState } from "./types.ts";

// Live offers from CheapShark (https://apidocs.cheapshark.com). Called from the user's browser,
// as CheapShark recommends, on demand for the games being shown: at most 25 games per request.
// Prices are USD. Deal links must go through CheapShark's redirect page.

const API = "https://www.cheapshark.com/api/1.0";
export const BATCH_SIZE = 25;

// Stores that CheapShark reported as active on 2026-10-13. Deals from any other store are ignored.
export const STORES: Record<string, string> = {
  "1": "Steam",
  "2": "GamersGate",
  "3": "Green Man Gaming",
  "7": "GOG",
  "11": "Humble Store",
  "13": "Ubisoft Store",
  "15": "Fanatical",
  "21": "WinGameStore",
  "23": "GameBillet",
  "25": "Epic Games Store",
  "27": "Gamesplanet",
  "28": "Gamesload",
  "30": "IndieGala",
  "35": "DreamGame",
};

// CheapShark returns deal IDs already URL-encoded (e.g. "...Zg%3D"), so they are used as given.
// Anything outside that safe encoded form is encoded, so it can't break out of the link.
export function dealUrl(dealId: string): string {
  const id = /^[A-Za-z0-9%._-]+$/.test(dealId) ? dealId : encodeURIComponent(dealId);
  return `https://www.cheapshark.com/redirect?dealID=${id}`;
}

const priceText = z.string().regex(/^\d+(\.\d+)?$/).transform(Number);
const gameLookupSchema = z.record(
  z.string(),
  z.object({
    info: z.object({ title: z.string(), steamAppID: z.string().nullable() }),
    deals: z.array(
      z.object({
        storeID: z.string(),
        dealID: z.string().min(1),
        price: priceText,
        retailPrice: priceText,
        savings: priceText,
      }),
    ),
  }),
);

// Turns one CheapShark game record into offers for one catalogue game. The record must be the
// same Steam app as the catalogue entry; anything else (a DLC, another edition) is discarded.
export function toOffers(game: Game, record: z.infer<typeof gameLookupSchema>[string] | undefined): Offer[] | null {
  if (!record || record.info.steamAppID !== String(game.steamAppId)) return null;
  return record.deals
    .filter((deal) => STORES[deal.storeID])
    .map((deal) => ({
      storeId: deal.storeID,
      storeName: STORES[deal.storeID],
      price: deal.price,
      regularPrice: deal.retailPrice,
      savings: Math.round(deal.savings),
      dealId: deal.dealID,
      url: dealUrl(deal.dealID),
    }))
    .sort((a, b) => a.price - b.price);
}

// --- Any PC game by name (for search suggestions outside our catalogue) ---

const titleSearchSchema = z.array(
  z.object({
    gameID: z.string(),
    steamAppID: z.string().nullable(),
    cheapest: priceText,
    external: z.string(),
    thumb: z.string(),
  }),
);

// Thumbnails are only used from Steam's image server, which the page's security policy allows.
export function safeThumb(url: string): string | null {
  return url.startsWith("https://shared.fastly.steamstatic.com/") ? url : null;
}

const steamPage = (id: number) => ({ name: "Steam", url: `https://store.steampowered.com/app/${id}/` });

// Games found by name in CheapShark's data: we know their name and prices, not how many can
// play together. Used when the IGDB search isn't available.
export function toStoreGames(rows: z.infer<typeof titleSearchSchema>): OtherGame[] {
  return rows.map((row) => {
    const steamAppId = row.steamAppID ? Number(row.steamAppID) : null;
    return {
      key: `cheapshark-${row.gameID}`,
      title: row.external,
      year: null,
      image: safeThumb(row.thumb),
      steamAppId,
      cheapsharkGameId: row.gameID,
      cheapest: row.cheapest,
      links: steamAppId ? [steamPage(steamAppId)] : [],
      popularity: 0,
    };
  });
}

export async function searchStoreGames(title: string, signal?: AbortSignal): Promise<OtherGame[]> {
  const response = await fetch(`${API}/games?title=${encodeURIComponent(title)}&limit=20`, {
    signal: signal ?? AbortSignal.timeout(8000),
  });
  if (response.status === 429) throw new RateLimitedError(Number(response.headers.get("retry-after") ?? "60"));
  if (!response.ok) throw new Error(`CheapShark responded ${response.status}`);
  const parsed = titleSearchSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("CheapShark returned data in an unexpected shape");
  return toStoreGames(parsed.data);
}

// CheapShark's record for a Steam game, by exact Steam app ID (never by title). Null when there
// is no single exact match, e.g. only DLC or another edition is listed.
export async function cheapsharkIdForSteamApp(steamAppId: number, signal?: AbortSignal): Promise<string | null> {
  const response = await fetch(`${API}/games?steamAppID=${steamAppId}`, { signal: signal ?? AbortSignal.timeout(8000) });
  if (response.status === 429) throw new RateLimitedError(Number(response.headers.get("retry-after") ?? "60"));
  if (!response.ok) throw new Error(`CheapShark responded ${response.status}`);
  const parsed = z.array(z.object({ gameID: z.string().regex(/^\d+$/), steamAppID: z.string().nullable() })).safeParse(await response.json());
  if (!parsed.success) throw new Error("CheapShark returned data in an unexpected shape");
  const exact = parsed.data.filter((row) => row.steamAppID === String(steamAppId));
  return exact.length === 1 ? exact[0].gameID : null;
}

// Every store's offer for one CheapShark game (one exact listing: base game, edition or DLC).
export async function fetchStoreGameOffers(gameId: string, signal?: AbortSignal): Promise<OfferState> {
  const response = await fetch(`${API}/games?id=${encodeURIComponent(gameId)}`, { signal: signal ?? AbortSignal.timeout(8000) });
  if (response.status === 429) throw new RateLimitedError(Number(response.headers.get("retry-after") ?? "60"));
  if (!response.ok) throw new Error(`CheapShark responded ${response.status}`);
  const parsed = z
    .object({ deals: z.array(z.object({ storeID: z.string(), dealID: z.string().min(1), price: priceText, retailPrice: priceText, savings: priceText })) })
    .safeParse(await response.json());
  if (!parsed.success) throw new Error("CheapShark returned data in an unexpected shape");
  const offers = parsed.data.deals
    .filter((deal) => STORES[deal.storeID])
    .map((deal) => ({
      storeId: deal.storeID,
      storeName: STORES[deal.storeID],
      price: deal.price,
      regularPrice: deal.retailPrice,
      savings: Math.round(deal.savings),
      dealId: deal.dealID,
      url: dealUrl(deal.dealID),
    }))
    .sort((a, b) => a.price - b.price);
  return { status: "ok", offers, retrievedAt: new Date().toISOString() };
}

export class RateLimitedError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Price lookups are paused for ${retryAfterSeconds}s`);
  }
}

// Fetches offers for up to 25 games in one request. Games with no CheapShark mapping
// (usually free-to-play titles stores don't sell) get an empty, successful result.
export async function fetchOffers(batch: Game[], signal?: AbortSignal): Promise<Record<string, OfferState>> {
  const mapped = batch.filter((game) => game.cheapsharkGameId);
  const states: Record<string, OfferState> = {};
  const retrievedAt = new Date().toISOString();
  for (const game of batch) if (!game.cheapsharkGameId) states[game.id] = { status: "ok", offers: [], retrievedAt };
  if (mapped.length === 0) return states;

  const ids = mapped.map((game) => game.cheapsharkGameId).join(",");
  const response = await fetch(`${API}/games?ids=${ids}`, { signal: signal ?? AbortSignal.timeout(10000) });
  if (response.status === 429) throw new RateLimitedError(Number(response.headers.get("retry-after") ?? "60"));
  if (!response.ok) throw new Error(`CheapShark responded ${response.status}`);

  const parsed = gameLookupSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("CheapShark returned data in an unexpected shape");
  for (const game of mapped) {
    const offers = toOffers(game, parsed.data[game.cheapsharkGameId!]);
    states[game.id] = offers
      ? { status: "ok", offers, retrievedAt }
      : { status: "unavailable", reason: "No matching store record" };
  }
  return states;
}
