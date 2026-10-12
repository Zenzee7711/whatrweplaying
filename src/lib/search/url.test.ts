import { describe, expect, it } from "vitest";
import { defaultFilters, type Filters } from "./filters.ts";
import { filtersFromParams, filtersToParams, shortlistFromParam } from "./url.ts";

const params = (query: string) => Object.fromEntries(new URLSearchParams(query));

describe("shareable filters", () => {
  it("survives a round trip through the URL", () => {
    const filters: Filters = {
      ...defaultFilters,
      groupSize: 4,
      modes: ["online-coop"],
      themes: ["horror"],
      maxPrice: 15,
      sort: "price",
    };
    expect(filtersFromParams(params(filtersToParams(filters).toString()))).toEqual(filters);
  });

  it("keeps default searches out of the URL", () => {
    expect(filtersToParams(defaultFilters).toString()).toBe("");
  });

  it("ignores invalid values one by one instead of failing the whole link", () => {
    const filters = filtersFromParams(params("players=99&modes=online-coop,hacking&max=-5&sort=random&store=<script>"));
    expect(filters.groupSize).toBeNull();
    expect(filters.modes).toEqual(["online-coop"]);
    expect(filters.maxPrice).toBeNull();
    expect(filters.sort).toBe("best");
    expect(filters.store).toBeNull();
  });
});

describe("shared shortlist", () => {
  const known = (id: string) => ["overcooked-2", "valheim"].includes(id);

  it("keeps only known public game IDs", () => {
    expect(shortlistFromParam("overcooked-2,valheim,not-a-game,<img>", known)).toEqual(["overcooked-2", "valheim"]);
  });
});
