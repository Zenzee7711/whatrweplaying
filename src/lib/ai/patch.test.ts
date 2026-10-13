import { describe, expect, it } from "vitest";
import { defaultFilters } from "../search/filters.ts";
import { basicPatch } from "./basic.ts";
import { applyPatch, emptyPatch, makePatchSchema } from "./patch.ts";

const tags = ["horror", "survival horror", "simulation", "farming", "life sim", "puzzle", "comedy", "party game", "shooter"];
const genres = ["survival horror", "simulation", "farming", "life sim", "puzzle", "party game", "shooter"];
const schema = makePatchSchema(tags, ["monster-hunter-world", "valheim"]);

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

describe("game names in a request", () => {
  const catalogue = [
    { id: "monster-hunter-world", title: "Monster Hunter: World" },
    { id: "apex-legends", title: "Apex Legends" },
  ];
  const withRoyale = [...tags, "battle royale"];

  it("treats a plain game name as 'games like this'", () => {
    const patch = basicPatch("monster hunter", tags, catalogue);
    expect(patch.set.like).toBe("monster-hunter-world");
    expect(patch.addPreferred).toEqual([]);
  });

  it("handles typos in the game name", () => {
    expect(basicPatch("something like monstr huntr for 3 of us", tags, catalogue).set.like).toBe("monster-hunter-world");
  });

  it("says when a named game isn't in the catalogue, and still uses the rest", () => {
    const patch = basicPatch("pubg like battleroyle", withRoyale, catalogue);
    expect(patch.set.like).toBeNull();
    expect(patch.addPreferred).toContain("battle royale");
  });

  it("reports an unknown game named after 'like'", () => {
    const patch = basicPatch("games like PUBG", withRoyale, catalogue);
    expect(patch.unknownTitle).toBe("PUBG");
  });
});

describe("group size phrasing", () => {
  it.each([
    ["something chill for two", 2],
    ["me and 3 friends want co-op", 4],
    ["co-op with 2 friends", 3],
    ["four of us", 4],
  ])("'%s' means %i players", (message, size) => {
    expect(basicPatch(message, tags).set.groupSize).toBe(size);
  });
});

describe("names that look like other words", () => {
  const catalogue = [{ id: "among-us", title: "Among Us" }];

  it("doesn't read 'of us' as Among Us", () => {
    const patch = basicPatch("games like PUBG for 4 of us", tags, catalogue);
    expect(patch.set.like).toBeNull();
    expect(patch.unknownTitle).toBe("PUBG");
  });

  it("doesn't call a misspelled genre an unknown game", () => {
    expect(basicPatch("pubg like battleroyle", [...tags, "battle royale"], catalogue).unknownTitle).toBeNull();
  });
});

describe("basicPatch phrasing", () => {
  it("reads 'on one PC' as playing locally", () => {
    expect(basicPatch("something relaxed for two on one PC", []).set.modes).toContain("local-coop");
  });

  it("sorts by price for cheap, cheaper and cheapest", () => {
    for (const word of ["cheap", "cheaper", "cheapest"]) expect(basicPatch(`${word} co-op games`, []).set.sort).toBe("price");
  });
});
