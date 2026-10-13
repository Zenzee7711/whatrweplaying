import { describe, expect, it } from "vitest";
import { percentileRanks, trendingRanks } from "./popularity.ts";

describe("popular right now", () => {
  it("ranks raw counts from least to most played", () => {
    expect(percentileRanks({ a: 10, b: 1_000_000, c: 500 })).toEqual({ a: 0, c: 0.5, b: 1 });
  });

  it("uses live Steam players for Steam games and IGDB for the rest", () => {
    const ranks = trendingRanks({ cs2: 1_100_000, overcooked: 8_600 }, { cs2: 0.001, overcooked: 0.002, valorant: 0.003, stardew: 0.0001 });
    expect(ranks.cs2).toBe(1);
    expect(ranks.overcooked).toBe(0);
    expect(ranks.valorant).toBe(1);
    expect(ranks.stardew).toBe(0);
  });

  it("falls back to IGDB when a Steam count couldn't be read", () => {
    expect(trendingRanks({}, { a: 1, b: 2 })).toEqual({ a: 0, b: 1 });
  });
});
