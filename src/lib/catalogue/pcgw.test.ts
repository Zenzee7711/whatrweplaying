import { describe, expect, it } from "vitest";
import { cleanNotes, parseFlag, parsePcgw, parsePlayers } from "./pcgw.ts";

// A real snippet from the Overcooked! 2 page (retrieved 2026-10-13), shortened.
const overcooked2 = `
{{Infobox game/row/taxonomy/monetization      | One-time game purchase, DLC }}
{{Infobox game/row/taxonomy/modes             | Singleplayer, Multiplayer }}
{{Infobox game/row/taxonomy/genres            | Action, Party game, Simulation, Time management }}
{{Infobox game/row/taxonomy/themes            | Fantasy, Zombies }}
|steam appid  = 728880
{{Network/Multiplayer
|local play           = true
|local play players   = 2-4
|local play modes     = Co-op, Versus
|local play notes     =
|lan play             = false
|lan play players     =
|lan play modes       =
|online play          = true
|online play players  = 2-4
|online play modes    = Co-op, Versus
|online play notes    = For Steam players to play with players on GOG and Epic, manual activation of crossplay mode is required.<ref>{{Refurl|url=https://support.team17.com/x|title=Crossplay|date=2023-04-05}}</ref>
|asynchronous         =
}}`;

describe("parsePcgw", () => {
  const facts = parsePcgw(overcooked2);

  it("reads verified local and online player ranges", () => {
    expect(facts.local.players).toEqual({ min: 2, max: 4 });
    expect(facts.online.players).toEqual({ min: 2, max: 4 });
  });

  it("records that one range covers both co-op and versus", () => {
    expect(facts.online.coop).toBe(true);
    expect(facts.online.versus).toBe(true);
    expect(facts.online.sharedRange).toBe(true);
  });

  it("treats an explicit 'false' as not supported, with no player count", () => {
    expect(facts.lan.supported).toBe(false);
    expect(facts.lan.players).toBeNull();
  });

  it("keeps the crossplay note without the reference markup", () => {
    expect(facts.crossplayNote).toBe(
      "For Steam players to play with players on GOG and Epic, manual activation of crossplay mode is required.",
    );
  });

  it("reads paid monetization, single-player support, genres, themes and the Steam ID", () => {
    expect(facts.monetization).toBe("paid");
    expect(facts.singleplayer).toBe(true);
    expect(facts.genres).toContain("Party game");
    expect(facts.themes).toEqual(["Fantasy", "Zombies"]);
    expect(facts.steamAppIds).toEqual([728880]);
  });

  it("treats a mode that isn't listed as unknown, not as unsupported", () => {
    const versusOnly = parsePcgw(`{{Network/Multiplayer
|online play          = true
|online play players  = 16
|online play modes    = Versus
}}`);
    expect(versusOnly.online.versus).toBe(true);
    expect(versusOnly.online.coop).toBeNull();
  });

  it("leaves everything unknown when the page has no multiplayer section", () => {
    const empty = parsePcgw("{{Infobox game/row/taxonomy/modes | Singleplayer }}");
    expect(empty.online.supported).toBeNull();
    expect(empty.online.players).toBeNull();
    expect(empty.monetization).toBe("unknown");
  });

  it("only calls a game free-to-play when the wiki says so", () => {
    const f2p = parsePcgw("{{Infobox game/row/taxonomy/monetization | Free-to-play, Cosmetic microtransactions }}");
    expect(f2p.monetization).toBe("free-to-play");
  });
});

describe("parsePlayers", () => {
  it.each([
    ["2-4", { min: 2, max: 4 }],
    ["1-4", { min: 1, max: 4 }],
    ["8", { min: null, max: 8 }],
  ])("reads %s", (value, expected) => {
    expect(parsePlayers(value)).toEqual(expected);
  });

  it.each([null, "", "unknown", "2+", "4-2", "0"])("treats %s as unknown, not zero", (value) => {
    expect(parsePlayers(value)).toBeNull();
  });
});

describe("parseFlag", () => {
  it.each([
    ["true", true],
    ["false", false],
    ["limited", null],
    ["unknown", null],
    [null, null],
  ])("reads %s as %s", (value, expected) => {
    expect(parseFlag(value)).toBe(expected);
  });
});

describe("cleanNotes", () => {
  it("removes links but keeps their text", () => {
    expect(cleanNotes("Play via [[Steam Remote Play|Remote Play Together]].")).toBe(
      "Play via Remote Play Together.",
    );
  });
});
