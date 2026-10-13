import { describe, expect, it } from "vitest";
import type { Game } from "../catalogue/schema.ts";
import { dealUrl, toOffers } from "./cheapshark.ts";

const game = { id: "overcooked-2", steamAppId: 728880, cheapsharkGameId: "188278" } as Game;
// Deals as toOffers receives them: after validation has turned CheapShark's price text into numbers.
const deal = (storeID: string, price: string) => ({
  storeID,
  dealID: `deal-${storeID}`,
  price: Number(price),
  retailPrice: 24.99,
  savings: 78.03,
});

describe("toOffers", () => {
  it("uses offers only when the record is the same Steam app as the catalogue game", () => {
    const record = { info: { title: "Overcooked! 2", steamAppID: "728880" }, deals: [deal("1", "5.49")] };
    expect(toOffers(game, record)).toHaveLength(1);
  });

  it("discards a record for a different app, such as DLC or another edition", () => {
    const dlc = { info: { title: "Overcooked! 2 - Night of the Hangry Horde", steamAppID: "1006670" }, deals: [deal("1", "2.99")] };
    expect(toOffers(game, dlc)).toBeNull();
  });

  it("discards a record with no Steam ID instead of trusting the title", () => {
    const untitled = { info: { title: "Overcooked! 2", steamAppID: null }, deals: [deal("1", "1.00")] };
    expect(toOffers(game, untitled)).toBeNull();
  });

  it("ignores stores that are not on the checked list", () => {
    const record = { info: { title: "Overcooked! 2", steamAppID: "728880" }, deals: [deal("1", "5.49"), deal("99", "0.10")] };
    expect(toOffers(game, record)?.map((o) => o.storeId)).toEqual(["1"]);
  });

  it("sorts offers by numeric price and links through CheapShark's redirect", () => {
    const record = { info: { title: "Overcooked! 2", steamAppID: "728880" }, deals: [deal("25", "10.00"), deal("1", "9.99")] };
    const offers = toOffers(game, record)!;
    expect(offers.map((o) => o.price)).toEqual([9.99, 10]);
    expect(offers[0].url).toBe("https://www.cheapshark.com/redirect?dealID=deal-1");
  });
});

describe("dealUrl", () => {
  it("uses CheapShark's already-encoded deal ID as given, without double-encoding", () => {
    expect(dealUrl("hz73JxyUB2xNG3rNqBY7V2XKj9UTE2dWUIZAfmTdvMk%3D")).toBe(
      "https://www.cheapshark.com/redirect?dealID=hz73JxyUB2xNG3rNqBY7V2XKj9UTE2dWUIZAfmTdvMk%3D",
    );
  });

  it("encodes anything outside the safe form so it can't break the link", () => {
    expect(dealUrl("a+b/c=&x=1")).toBe("https://www.cheapshark.com/redirect?dealID=a%2Bb%2Fc%3D%26x%3D1");
  });
});
