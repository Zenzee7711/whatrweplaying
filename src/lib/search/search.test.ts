import { describe, expect, it } from "vitest";
import type { Connection, Game } from "../catalogue/schema.ts";
import type { Offer, OfferMap } from "../offers/types.ts";
import { defaultFilters, type Filters } from "./filters.ts";
import { search } from "./search.ts";

// Small hand-made games, so each rule is tested on its own.
const none: Connection = {
  supported: false, players: null, coop: false, versus: false, sharedRange: false,
  coopPlayers: null, versusPlayers: null, notes: null,
};
function online(partial: Partial<Connection>): Connection {
  return { ...none, supported: true, coop: true, versus: null, ...partial };
}
function game(id: string, partial: Partial<Game> = {}): Game {
  return {
    id, title: id, steamAppId: 1, cheapsharkGameId: "1", platforms: ["pc"], monetization: "paid",
    singleplayer: true, local: none, lan: none, online: none, crossplayNote: null,
    genres: [], themes: [], description: null, image: "https://example.com/a.jpg", launcher: null, ratingCount: null,
    sources: [{ name: "Test", url: "https://example.com", retrieved: "2026-10-13" }], ...partial,
  };
}
function offer(price: number, partial: Partial<Offer> = {}): Offer {
  return { storeId: "1", storeName: "Steam", price, regularPrice: price, savings: 0, dealId: "d", url: "https://www.cheapshark.com/redirect?dealID=d", ...partial };
}
const ok = (...offers: Offer[]) => ({ status: "ok" as const, offers, retrievedAt: "2026-10-13T10:00:00Z" });
const filters = (partial: Partial<Filters>): Filters => ({ ...defaultFilters, ...partial });
const ids = (results: { game: Game }[]) => results.map((r) => r.game.id);

const fourCoop = game("four-coop", { online: online({ players: { min: 1, max: 4 } }) });
const twoCoop = game("two-coop", { online: online({ players: { min: null, max: 2 } }) });
const unknownCount = game("unknown-count", { online: online({ players: null }) });
const sharedRange = game("shared-range", {
  online: online({ versus: true, sharedRange: true, players: { min: null, max: 8 } }),
});
const reviewed = game("reviewed", {
  online: online({ versus: true, sharedRange: true, players: { min: null, max: 8 }, coopPlayers: { min: null, max: 4 } }),
});

describe("group size", () => {
  const fourOnline = filters({ groupSize: 4, modes: ["online-coop"] });

  it("rejects a two-player-only game for a group of four", () => {
    const result = search([fourCoop, twoCoop], fourOnline);
    expect(ids(result.matches)).toEqual(["four-coop"]);
    expect(ids(result.unverified)).toEqual([]);
  });

  it("does not treat an unknown player count as verified", () => {
    const result = search([unknownCount], fourOnline);
    expect(ids(result.matches)).toEqual([]);
    expect(ids(result.unverified)).toEqual(["unknown-count"]);
  });

  it("does not treat a shared co-op/versus range as the co-op team size", () => {
    expect(ids(search([sharedRange], fourOnline).unverified)).toEqual(["shared-range"]);
  });

  it("uses a reviewed co-op size when there is one", () => {
    expect(ids(search([reviewed], fourOnline).matches)).toEqual(["reviewed"]);
    expect(ids(search([reviewed], filters({ groupSize: 6, modes: ["online-coop"] })).matches)).toEqual([]);
  });

  it("does not promise a 4-person group a full 30-60 player versus match", () => {
    const battleRoyale = game("battle-royale", {
      online: online({ coop: null, versus: true, players: { min: 30, max: 60 } }),
    });
    const result = search([battleRoyale], filters({ groupSize: 4, modes: ["online-versus"] }));
    expect(ids(result.matches)).toEqual([]);
    expect(ids(result.unverified)).toEqual(["battle-royale"]);
  });

  it("uses the party size for online versus, never the whole match size", () => {
    const squads = game("squads", {
      online: online({ coop: null, versus: true, players: { min: 30, max: 60 }, versusPlayers: { min: null, max: 3 } }),
    });
    expect(ids(search([squads], filters({ groupSize: 3, modes: ["online-versus"] })).matches)).toEqual(["squads"]);
    expect(ids(search([squads], filters({ groupSize: 4, modes: ["online-versus"] })).matches)).toEqual([]);
  });

  it("treats an online versus match size without a reviewed party size as unverified", () => {
    const lobby = game("lobby", { online: online({ coop: null, versus: true, players: { min: null, max: 8 } }) });
    expect(ids(search([lobby], filters({ groupSize: 4, modes: ["online-versus"] })).unverified)).toEqual(["lobby"]);
  });

  it("does not offer solo games to a group", () => {
    const solo = game("solo-only");
    expect(ids(search([solo], filters({ groupSize: 3 })).matches)).toEqual([]);
  });
});

describe("prices", () => {
  const budget = filters({ maxPrice: 15 });

  it("never treats a missing price as free", () => {
    const result = search([fourCoop], budget, {});
    expect(ids(result.matches)).toEqual([]);
    expect(ids(result.priceUnconfirmed)).toEqual(["four-coop"]);
  });

  it("keeps a game with no store listing out of a strict budget", () => {
    const result = search([fourCoop], budget, { "four-coop": ok() });
    expect(ids(result.matches)).toEqual([]);
    expect(ids(result.priceUnconfirmed)).toEqual([]);
  });

  it("accepts a known offer within budget and rejects one above it", () => {
    const offers: OfferMap = { "four-coop": ok(offer(9.99)), "two-coop": ok(offer(19.99)) };
    expect(ids(search([fourCoop, twoCoop], budget, offers).matches)).toEqual(["four-coop"]);
  });

  it("counts free-to-play games as within any budget", () => {
    const f2p = game("f2p", { monetization: "free-to-play" });
    expect(ids(search([f2p], filters({ maxPrice: 0 })).matches)).toEqual(["f2p"]);
  });

  it("does not call a paid game free-to-play because it has a $0 offer", () => {
    const promo = game("promo");
    const result = search([promo], filters({ pricing: "free" }), { promo: ok(offer(0)) });
    expect(ids(result.matches)).toEqual([]);
  });

  it("sorts by numeric price, not as text", () => {
    const a = game("a"), b = game("b"), c = game("c");
    const offers: OfferMap = { a: ok(offer(10)), b: ok(offer(9.99)), c: ok(offer(100)) };
    expect(ids(search([a, b, c], filters({ sort: "price" }), offers).matches)).toEqual(["b", "a", "c"]);
  });

  it("only uses offers from the chosen store", () => {
    const offers: OfferMap = { "four-coop": ok(offer(5, { storeId: "25", storeName: "Epic" })) };
    const steamOnly = filters({ store: "1", maxPrice: 15 });
    expect(ids(search([fourCoop], steamOnly, offers).matches)).toEqual([]);
  });

  it("lets a discount reorder results but never add an incompatible game", () => {
    const offers: OfferMap = {
      "four-coop": ok(offer(20)),
      "two-coop": ok(offer(1, { savings: 95 })),
    };
    const result = search([fourCoop, twoCoop], filters({ groupSize: 4, modes: ["online-coop"], sort: "discount" }), offers);
    expect(ids(result.matches)).toEqual(["four-coop"]);
  });
});

describe("preferences and exclusions", () => {
  const horror = game("horror", { online: online({ players: { min: 1, max: 4 } }), themes: ["Horror"] });
  const cosy = game("cosy", { online: online({ players: { min: 1, max: 4 } }), genres: ["Simulation"] });

  it("ranks games with preferred themes first", () => {
    expect(ids(search([cosy, horror], filters({ themes: ["horror"] })).matches)).toEqual(["horror", "cosy"]);
  });

  it("removes excluded themes completely", () => {
    expect(ids(search([cosy, horror], filters({ exclude: ["horror"] })).matches)).toEqual(["cosy"]);
  });

  it("excludes survival horror when horror is excluded", () => {
    const survival = game("survival", { genres: ["Survival horror"] });
    expect(ids(search([survival, cosy], filters({ exclude: ["horror"] })).matches)).toEqual(["cosy"]);
  });

  it("explains a match with facts", () => {
    const [result] = search([horror], filters({ groupSize: 4, modes: ["online-coop"], themes: ["horror"] })).matches;
    expect(result.reasons).toContain("Online co-op, 1–4 players together");
    expect(result.reasons).toContain("Matches horror");
  });
});

describe("when nothing matches", () => {
  it("names the requirement that is blocking results instead of relaxing it", () => {
    const result = search([fourCoop], filters({ groupSize: 4, modes: ["online-coop"], exclude: ["four-coop-tag"], pricing: "free" }));
    expect(result.matches).toEqual([]);
    expect(result.blocking.map((b) => b.constraint)).toEqual(["pricing"]);
  });
});
