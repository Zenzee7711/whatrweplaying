import type { Capacity, Connection, Game } from "../catalogue/schema.ts";
import type { Offer, OfferMap } from "../offers/types.ts";
import { MODE_LABELS, MODES, type Filters, type Mode } from "./filters.ts";

// The one search used by manual filters, shared links and the AI.
// Hard requirements decide WHETHER a game is shown; preferences decide its ORDER.

type Fit = "yes" | "no" | "unverified";

// Does a verified player range include the group? Unknown limits are never treated as a yes.
// Versus ranges are match sizes: a group smaller than the minimum (Apex: 30-60) may only get
// a match through matchmaking with strangers, so that is unverified rather than a yes or no.
function capacityFit(players: Capacity | null, groupSize: number | null, kind: "coop" | "versus"): Fit {
  if (groupSize === null) return "yes";
  if (!players || players.max === null) return "unverified";
  if (groupSize > players.max) return "no";
  if (players.min !== null && groupSize < players.min) return kind === "versus" ? "unverified" : "no";
  return "yes";
}

// How many friends can play this way TOGETHER (a team, a party, or one private lobby).
// - Co-op: the team size. If the source gives one range for co-op and versus together, that
//   is the overall limit, not the team size, so only a reviewed co-op value counts.
// - Online versus: only a reviewed party/lobby size counts. The source's number is the size
//   of a whole match (Apex: 30-60), which says nothing about how many friends can join together.
// - Local versus: everyone is at the same PC, so the local player count is the group.
export function kindPlayers(connection: Connection, kind: "coop" | "versus", where: "local" | "online"): Capacity | null {
  const reviewed = kind === "coop" ? connection.coopPlayers : connection.versusPlayers;
  if (reviewed) return reviewed;
  if (kind === "versus") return where === "local" ? connection.players : null;
  return connection.sharedRange ? null : connection.players;
}

function connectionFit(
  connection: Connection,
  kind: "coop" | "versus",
  where: "local" | "online",
  groupSize: number | null,
): Fit {
  if (connection.supported === false || connection[kind] === false) return "no";
  if (connection.supported !== true || connection[kind] !== true) return "unverified";
  return capacityFit(kindPlayers(connection, kind, where), groupSize, kind);
}

export function modeFit(game: Game, mode: Mode, groupSize: number | null): Fit {
  switch (mode) {
    case "solo":
      if (groupSize !== null && groupSize > 1) return "no";
      return game.singleplayer === true ? "yes" : game.singleplayer === false ? "no" : "unverified";
    case "online-coop":
      return connectionFit(game.online, "coop", "online", groupSize);
    case "local-coop":
      return connectionFit(game.local, "coop", "local", groupSize);
    case "online-versus":
      return connectionFit(game.online, "versus", "online", groupSize);
    case "local-versus":
      return connectionFit(game.local, "versus", "local", groupSize);
  }
}

// The modes a game is checked against. With no mode chosen, any way of playing that fits the group.
function modesToCheck(filters: Filters): readonly Mode[] {
  if (filters.modes.length > 0) return filters.modes;
  if (filters.groupSize === null) return [];
  if (filters.groupSize === 1) return ["solo"];
  return MODES.filter((mode) => mode !== "solo");
}

export function tagsOf(game: Game): string[] {
  return [...game.genres, ...game.themes].map((t) => t.toLowerCase());
}

// "horror" matches the theme "horror" and the genre "survival horror" (whole words only),
// so "no horror" also removes survival horror games.
export function hasTag(tags: string[], wanted: string): boolean {
  return tags.some((tag) => tag === wanted || tag.split(/[\s/-]+/).includes(wanted));
}

// The cheapest known offer that the group can use (at the chosen store, if one is set).
export function bestOffer(offers: Offer[], store: string | null): Offer | null {
  const usable = store ? offers.filter((offer) => offer.storeId === store) : offers;
  return usable.reduce<Offer | null>((best, offer) => (!best || offer.price < best.price ? offer : best), null);
}

export type PriceInfo =
  | { kind: "free-to-play" }
  | { kind: "offer"; offer: Offer }
  | { kind: "no-offer" } // offers were checked and none were found (at the chosen store)
  | { kind: "unknown" }; // not checked yet, or the price service failed

export function priceInfo(game: Game, offers: OfferMap, store: string | null): PriceInfo {
  if (game.monetization === "free-to-play") return { kind: "free-to-play" };
  const state = offers[game.id];
  if (!state || state.status !== "ok") return { kind: "unknown" };
  const offer = bestOffer(state.offers, store);
  return offer ? { kind: "offer", offer } : { kind: "no-offer" };
}

export type Result = {
  game: Game;
  score: number;
  modes: { mode: Mode; fit: Fit }[];
  price: PriceInfo;
  reasons: string[];
};

export type Constraint = "mode" | "exclude" | "pricing" | "budget" | "store";

export type SearchOutcome = {
  matches: Result[];
  unverified: Result[]; // would match, but the group's player count can't be verified
  priceUnconfirmed: Result[]; // would match, but there is no known offer within the budget/store
  blocking: { constraint: Constraint; wouldShow: number }[]; // filled only when nothing matches
};

function formatRange(players: Capacity | null): string {
  if (!players || players.max === null) return "";
  return players.min !== null && players.min !== players.max
    ? `${players.min}–${players.max} players`
    : `up to ${players.max} players`;
}

function modeReason(game: Game, mode: Mode): string {
  const connection = mode.startsWith("online") ? game.online : game.local;
  if (mode === "solo") return "Can be played solo";
  const range = formatRange(
    kindPlayers(connection, mode.endsWith("versus") ? "versus" : "coop", mode.startsWith("online") ? "online" : "local"),
  );
  return `${MODE_LABELS[mode]}${range ? `, ${range} together` : ""}`;
}

const money = (n: number) => `$${n.toFixed(2)}`;

function evaluate(game: Game, filters: Filters, offers: OfferMap, skip: Constraint | null, likeGame: Game | null) {
  const checks = modesToCheck(filters);
  const modes = checks.map((mode) => ({ mode, fit: modeFit(game, mode, filters.groupSize) }));
  const fitting = modes.filter((m) => m.fit === "yes");
  const modeStatus: Fit =
    skip === "mode" || checks.length === 0
      ? "yes"
      : fitting.length > 0
        ? "yes"
        : modes.some((m) => m.fit === "unverified")
          ? "unverified"
          : "no";

  const tags = tagsOf(game);
  const excluded = skip !== "exclude" && filters.exclude.some((t) => hasTag(tags, t));

  const pricingOk =
    skip === "pricing" ||
    filters.pricing === "any" ||
    (filters.pricing === "free" && game.monetization === "free-to-play") ||
    (filters.pricing === "paid" && game.monetization === "paid");

  const store = skip === "store" ? null : filters.store;
  const price = priceInfo(game, offers, store);
  const effectivePrice = price.kind === "free-to-play" ? 0 : price.kind === "offer" ? price.offer.price : null;

  // Budget: a game only "fits" with a known qualifying offer (or if it is free-to-play).
  let budget: Fit = "yes";
  if (skip !== "budget" && filters.maxPrice !== null) {
    if (effectivePrice !== null) budget = effectivePrice <= filters.maxPrice ? "yes" : "no";
    else budget = price.kind === "no-offer" ? "no" : "unverified";
  }
  // Store: the game must be offered at the chosen store (free-to-play games are exempt).
  let storeFit: Fit = "yes";
  if (store !== null && price.kind !== "free-to-play") {
    storeFit = price.kind === "offer" ? "yes" : price.kind === "no-offer" ? "no" : "unverified";
  }

  // Preferences: shared genres and themes, then price as a small tie-breaker.
  const liked = [...filters.genres, ...filters.themes].filter((t) => hasTag(tags, t));
  let score = liked.length * 10 + fitting.length;
  const alike = likeGame ? similarity(likeGame, game) : null;
  if (alike) score += alike.score * 6;
  if (effectivePrice !== null && filters.maxPrice) score += (1 - Math.min(effectivePrice / filters.maxPrice, 1)) * 2;

  const reasons: string[] = [];
  const shown = fitting.length > 0 ? fitting : modes.filter((m) => m.fit === "unverified");
  for (const { mode } of shown.slice(0, 2)) reasons.push(modeReason(game, mode));
  if (alike && alike.shared.length > 0) reasons.push(`Like ${likeGame!.title}: ${alike.shared.slice(0, 3).join(", ")}`);
  if (liked.length > 0) reasons.push(`Matches ${liked.join(", ")}`);
  if (price.kind === "free-to-play") reasons.push("Free-to-play");
  else if (price.kind === "offer" && filters.maxPrice !== null && price.offer.price <= filters.maxPrice) {
    reasons.push(`Within your ${money(filters.maxPrice)} budget`);
  }

  const result: Result = { game, score, modes, price, reasons };
  const hardFail = modeStatus === "no" || excluded || !pricingOk || budget === "no" || storeFit === "no";
  return { result, hardFail, modeStatus, priceStatus: budget === "unverified" || storeFit === "unverified" ? "unverified" : "yes" };
}

// Place names say nothing about what a game is like.
const NOT_SIMILARITY = new Set(["north america", "middle east", "contemporary"]);

// How alike two games are: shared genres and themes, plus playing the same ways.
export function similarity(a: Game, b: Game): { score: number; shared: string[] } {
  const ofA = new Set(tagsOf(a));
  const shared = tagsOf(b).filter((tag) => ofA.has(tag) && !NOT_SIMILARITY.has(tag));
  let score = shared.length;
  if (a.online.coop === true && b.online.coop === true) score += 1;
  if (a.online.versus === true && b.online.versus === true) score += 1;
  if (a.local.coop === true && b.local.coop === true) score += 0.5;
  return { score, shared };
}

function sortResults(results: Result[], sort: Filters["sort"]): Result[] {
  const priceOf = (r: Result) => (r.price.kind === "free-to-play" ? 0 : r.price.kind === "offer" ? r.price.offer.price : Infinity);
  const discountOf = (r: Result) => (r.price.kind === "offer" ? r.price.offer.savings : -1);
  const byTitle = (a: Result, b: Result) => a.game.title.localeCompare(b.game.title);
  return [...results].sort((a, b) => {
    if (sort === "price") return priceOf(a) - priceOf(b) || b.score - a.score || byTitle(a, b);
    if (sort === "discount") return discountOf(b) - discountOf(a) || b.score - a.score || byTitle(a, b);
    // Equal matches: better-known games first, not whichever happens to be free.
    return b.score - a.score || (b.game.ratingCount ?? 0) - (a.game.ratingCount ?? 0) || byTitle(a, b);
  });
}

function run(games: Game[], filters: Filters, offers: OfferMap, skip: Constraint | null) {
  // The named game is shown in its own panel, so it is left out of the lists.
  const likeGame = filters.like ? games.find((g) => g.id === filters.like) ?? null : null;
  const matches: Result[] = [];
  const unverified: Result[] = [];
  const priceUnconfirmed: Result[] = [];
  for (const game of games) {
    if (game.id === likeGame?.id) continue;
    const { result, hardFail, modeStatus, priceStatus } = evaluate(game, filters, offers, skip, likeGame);
    if (hardFail) continue;
    if (modeStatus === "unverified") unverified.push(result);
    else if (priceStatus === "unverified") priceUnconfirmed.push(result);
    else matches.push(result);
  }
  return { matches, unverified, priceUnconfirmed };
}

function activeConstraints(filters: Filters): Constraint[] {
  const active: Constraint[] = [];
  if (filters.modes.length > 0 || filters.groupSize !== null) active.push("mode");
  if (filters.exclude.length > 0) active.push("exclude");
  if (filters.pricing !== "any") active.push("pricing");
  if (filters.maxPrice !== null) active.push("budget");
  if (filters.store !== null) active.push("store");
  return active;
}

export function search(games: Game[], filters: Filters, offers: OfferMap = {}): SearchOutcome {
  const { matches, unverified, priceUnconfirmed } = run(games, filters, offers, null);

  // Nothing matched: work out which single requirement is blocking, without changing the search.
  const blocking: SearchOutcome["blocking"] = [];
  if (matches.length === 0) {
    for (const constraint of activeConstraints(filters)) {
      const wouldShow = run(games, filters, offers, constraint).matches.length;
      if (wouldShow > 0) blocking.push({ constraint, wouldShow });
    }
    blocking.sort((a, b) => b.wouldShow - a.wouldShow);
  }

  return {
    matches: sortResults(matches, filters.sort),
    unverified: sortResults(unverified, filters.sort),
    priceUnconfirmed: sortResults(priceUnconfirmed, filters.sort),
    blocking,
  };
}
