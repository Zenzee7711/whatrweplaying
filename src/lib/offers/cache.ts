import type { OfferState } from "./types.ts";

// A short-lived cache of offers for this browser tab (10 minutes), so repeated searches don't
// re-request the same games. CheapShark updates prices about once an hour.
const KEY = "wrwp:offers";
const TTL_MS = 10 * 60 * 1000;

type Entry = { state: OfferState; savedAt: number };

function read(): Record<string, Entry> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function cachedOffers(ids: string[], now = Date.now()): Record<string, OfferState> {
  const all = read();
  const fresh: Record<string, OfferState> = {};
  for (const id of ids) {
    const entry = all[id];
    if (entry && now - entry.savedAt < TTL_MS && entry.state.status === "ok") fresh[id] = entry.state;
  }
  return fresh;
}

export function saveOffers(states: Record<string, OfferState>, now = Date.now()) {
  const all = read();
  for (const [id, state] of Object.entries(states)) if (state.status === "ok") all[id] = { state, savedAt: now };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: offers still work, just without the cache.
  }
}
