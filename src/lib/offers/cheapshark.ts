import { z } from "zod";
import type { Game } from "../catalogue/schema.ts";
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

export function dealUrl(dealId: string): string {
  return `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(dealId)}`;
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
