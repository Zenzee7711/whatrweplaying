import { describe, expect, it } from "vitest";
import { defaultFilters } from "../search/filters.ts";
import { basicPatch } from "./basic.ts";
import { applyPatch, emptyPatch, makePatchSchema } from "./patch.ts";

const tags = ["horror", "survival horror", "simulation", "farming", "life sim", "puzzle", "comedy", "party game", "shooter"];
const genres = ["survival horror", "simulation", "farming", "life sim", "puzzle", "party game", "shooter"];
const schema = makePatchSchema(tags);

describe("basicPatch (no-AI fallback)", () => {
  it("reads the example request into filters", () => {
    const patch = basicPatch("There are four of us on PC. We want online co-op, preferably horror, under $15 each.", tags);
    const filters = applyPatch(defaultFilters, patch, genres);
    expect(filters.groupSize).toBe(4);
    expect(filters.modes).toEqual(["online-coop"]);
    expect(filters.themes).toContain("horror");
    expect(filters.maxPrice).toBe(15);
  });
});

describe("follow-up requests", () => {
  const first = applyPatch(
    defaultFilters,
    basicPatch("There are four of us. We want online co-op, preferably horror, under $15 each.", tags),
    genres,
  );

  it("keeps everything the follow-up doesn't mention", () => {
    const next = applyPatch(first, basicPatch("Actually, no horror. Something more relaxed.", tags), genres);
    expect(next.groupSize).toBe(4);
    expect(next.modes).toEqual(["online-coop"]);
    expect(next.maxPrice).toBe(15);
  });

  it("swaps horror from preferred to excluded and adds calmer preferences", () => {
    const next = applyPatch(first, basicPatch("Actually, no horror. Something more relaxed.", tags), genres);
    expect(next.themes).not.toContain("horror");
    expect(next.exclude).toContain("horror");
    expect(next.genres).toEqual(expect.arrayContaining(["simulation", "farming"]));
  });

  it("can clear a single filter without touching the others", () => {
    const next = applyPatch(first, { ...emptyPatch, clear: ["maxPrice"] }, genres);
    expect(next.maxPrice).toBeNull();
    expect(next.groupSize).toBe(4);
  });
});

describe("validating model output", () => {
  const valid = { ...emptyPatch, set: { ...emptyPatch.set, groupSize: 4 }, addPreferred: ["horror"] };

  it("accepts a well-formed patch", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["an unknown genre", { ...valid, addPreferred: ["invented-genre"] }],
    ["an invented field such as a price for a game", { ...valid, prices: { "overcooked-2": 0 } }],
    ["an out-of-range group size", { ...valid, set: { ...valid.set, groupSize: 500 } }],
    ["an unknown mode", { ...valid, set: { ...valid.set, modes: ["mmo-raid"] } }],
    ["a missing field", { action: "update" }],
    ["a string where a number belongs", { ...valid, set: { ...valid.set, maxPrice: "free" } }],
  ])("rejects %s", (_name, patch) => {
    expect(schema.safeParse(patch).success).toBe(false);
  });

  it("refuses a negative budget even if a patch slipped through", () => {
    expect(() => applyPatch(defaultFilters, { ...emptyPatch, set: { ...emptyPatch.set, maxPrice: -1 } }, genres)).toThrow();
  });
});
