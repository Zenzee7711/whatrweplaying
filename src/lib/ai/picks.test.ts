import { describe, expect, it } from "vitest";
import { looksLikeFollowUp } from "./basic.ts";
import { emptyPatch, fromWire } from "./patch.ts";
import { bestTitleMatch, cleanWhy } from "./picks.ts";

describe("AI picks", () => {
  it("keeps a reason about mood or story", () => {
    expect(cleanWhy("Deep narrative,  rich world")).toBe("Deep narrative, rich world");
  });

  it("drops a reason that states player counts or prices, which only verified data may show", () => {
    expect(cleanWhy("Great for 4 players")).toBeNull();
    expect(cleanWhy("Up to four friends in co-op")).toBeNull();
    expect(cleanWhy("Free-to-play and fun")).toBeNull();
    expect(cleanWhy("Cheap at $5")).toBeNull();
    expect(cleanWhy("Zombie survival, local co-op, classic fun")).toBeNull();
  });

  it("matches a recommended title to the same game, preferring earlier candidates on a tie", () => {
    const games = [{ title: "Hades" }, { title: "Hades" }, { title: "Hades II" }];
    expect(bestTitleMatch("Hades", games, 0.8)).toBe(games[0]);
    expect(bestTitleMatch("The Witcher 3", [{ title: "The Witcher 3: Wild Hunt" }], 0.8)).not.toBeNull();
    expect(bestTitleMatch("Stardew Valley", [{ title: "Starfield" }], 0.8)).toBeNull();
  });
});

describe("new request or follow-up", () => {
  it("treats a full description as a new request", () => {
    expect(looksLikeFollowUp("i wanna play solo story immersive game")).toBe(false);
    expect(looksLikeFollowUp("me and 3 friends want something scary")).toBe(false);
    expect(looksLikeFollowUp("witcher-like games")).toBe(false);
  });

  it("treats an adjustment as a follow-up", () => {
    expect(looksLikeFollowUp("actually no horror")).toBe(true);
    expect(looksLikeFollowUp("cheaper")).toBe(true);
    expect(looksLikeFollowUp("make it 3 of us")).toBe(true);
  });
});

describe("fromWire", () => {
  it("keeps known tags and game IDs and drops the rest instead of failing", () => {
    const wire = { ...emptyPatch, addPreferred: ["Horror", "made-up tag"], set: { ...emptyPatch.set, like: "not-a-game" } };
    const patch = fromWire(wire, ["horror", "puzzle"], ["valheim"]);
    expect(patch.addPreferred).toEqual(["horror"]);
    expect(patch.set.like).toBeNull();
  });
});
