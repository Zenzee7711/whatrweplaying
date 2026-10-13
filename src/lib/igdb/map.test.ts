import { describe, expect, it } from "vitest";
import { igdbImage, igdbLinks, igdbSteamAppId, toOtherGame, type IgdbGame } from "./map.ts";

const valorant: IgdbGame = {
  id: 126459,
  name: "Valorant",
  first_release_date: 1591056000,
  cover: { image_id: "cocqbp" },
  screenshots: [{ image_id: "sc1abc" }],
  websites: [
    { type: 1, url: "https://playvalorant.com/" },
    { type: 16, url: "https://www.epicgames.com/store/en-US/p/valorant" },
    { type: 9, url: "https://www.youtube.com/@valorant" },
  ],
  external_games: [{ external_game_source: 14, uid: "516575" }],
};

describe("IGDB results outside the catalogue", () => {
  it("keeps store and official links, stores first, and drops social media", () => {
    expect(igdbLinks(valorant)).toEqual([
      { name: "Epic Games Store", url: "https://www.epicgames.com/store/en-US/p/valorant" },
      { name: "Official site", url: "https://playvalorant.com/" },
    ]);
  });

  it("drops a store link that points at the wrong host or isn't https", () => {
    const game = { ...valorant, websites: [{ type: 13, url: "https://evil.example/app/1" }, { type: 1, url: "http://plain.example" }] };
    expect(igdbLinks(game)).toEqual([]);
  });

  it("reads the Steam app ID only from Steam's external record", () => {
    expect(igdbSteamAppId(valorant)).toBeNull();
    expect(igdbSteamAppId({ ...valorant, external_games: [{ external_game_source: 1, uid: "1172470" }] })).toBe(1172470);
  });

  it("builds image URLs only from plain IGDB image IDs", () => {
    expect(igdbImage("sc1abc", "t_screenshot_med")).toBe("https://images.igdb.com/igdb/image/upload/t_screenshot_med/sc1abc.jpg");
    expect(igdbImage("../x", "t_screenshot_med")).toBeNull();
  });

  it("never includes player counts", () => {
    const other = toOtherGame(valorant);
    expect(other).toMatchObject({ key: "igdb-126459", title: "Valorant", year: 2020, steamAppId: null, cheapest: null });
    expect(Object.keys(other)).not.toContain("players");
  });
});
