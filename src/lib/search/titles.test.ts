import { describe, expect, it } from "vitest";
import { editDistance, findTitles, titleInMessage, titleScore } from "./titles.ts";

const games = [
  { title: "Monster Hunter: World" },
  { title: "Counter-Strike 2" },
  { title: "Left 4 Dead 2" },
  { title: "Don't Starve Together" },
  { title: "Lethal Company" },
  { title: "Raft" },
  { title: "Grounded" },
];
const top = (query: string) => findTitles(query, games)[0]?.item.title;

describe("finding a game by name", () => {
  it.each([
    ["monster hunter", "Monster Hunter: World"],
    ["Monster Hunter World", "Monster Hunter: World"],
    ["monstr huntr", "Monster Hunter: World"],
    ["lethal compny", "Lethal Company"],
    ["cs2", "Counter-Strike 2"],
    ["l4d2", "Left 4 Dead 2"],
    ["dst", "Don't Starve Together"],
    ["dont starve", "Don't Starve Together"],
  ])("'%s' finds %s", (query, title) => {
    expect(top(query)).toBe(title);
  });

  it("finds nothing for a game that isn't in the list", () => {
    expect(findTitles("pubg", games)).toEqual([]);
  });

  it("scores a partial name lower than the full name", () => {
    expect(titleScore("monster", "Monster Hunter: World")).toBeLessThan(titleScore("monster hunter world", "Monster Hunter: World"));
  });
});

describe("spotting a game name in a sentence", () => {
  it("finds the title inside a longer request", () => {
    expect(titleInMessage("is monster hunter good for 4 of us?", games)?.item.title).toBe("Monster Hunter: World");
  });

  it("doesn't match ordinary words to titles by accident", () => {
    expect(titleInMessage("something chill and grounding for two", games)).toBeNull();
  });

  it("still matches an exact one-word title", () => {
    expect(titleInMessage("games like raft", games)?.item.title).toBe("Raft");
  });
});

describe("editDistance", () => {
  it("counts single-letter changes", () => {
    expect(editDistance("battleroyle", "battleroyale")).toBe(1);
    expect(editDistance("same", "same")).toBe(0);
  });
});
