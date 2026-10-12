import { z } from "zod";
import { defaultFilters, filtersSchema, MODES, PRICING, SORTS, type Filters } from "../search/filters.ts";

// The AI never edits filters directly. It returns a small list of changes ("patch"), which is
// validated and then applied here, in code. A follow-up like "no horror" therefore changes only
// what it mentions, and everything else the user set is kept.

export const CLEARABLE = ["groupSize", "modes", "maxPrice", "pricing", "genres", "themes", "exclude"] as const;

// Built from the catalogue's own genres and themes, so only known tags can be used.
export function makePatchSchema(tags: readonly string[]) {
  const tag = z.enum(tags as [string, ...string[]]);
  return z.strictObject({
    action: z.enum(["update", "clarify"]),
    clarification: z.string().max(200).nullable(),
    summary: z.string().max(200).nullable(),
    set: z.strictObject({
      groupSize: z.number().int().min(1).max(16).nullable(),
      modes: z.array(z.enum(MODES)).max(MODES.length).nullable(),
      maxPrice: z.number().min(0).max(500).nullable(),
      pricing: z.enum(PRICING).nullable(),
      sort: z.enum(SORTS).nullable(),
    }),
    clear: z.array(z.enum(CLEARABLE)).max(CLEARABLE.length),
    addPreferred: z.array(tag).max(6),
    removePreferred: z.array(tag).max(6),
    addExcluded: z.array(tag).max(6),
    removeExcluded: z.array(tag).max(6),
  });
}
export type Patch = z.infer<ReturnType<typeof makePatchSchema>>;

export const emptyPatch: Patch = {
  action: "update",
  clarification: null,
  summary: null,
  set: { groupSize: null, modes: null, maxPrice: null, pricing: null, sort: null },
  clear: [],
  addPreferred: [],
  removePreferred: [],
  addExcluded: [],
  removeExcluded: [],
};

const without = (list: string[], remove: string[]) => list.filter((item) => !remove.includes(item));
const withAdded = (list: string[], add: string[]) => [...new Set([...list, ...add])];

// Applies a validated patch to the current filters. Genres and themes are told apart by the
// catalogue's vocabulary. A tag can't be both preferred and excluded: the newest wish wins.
export function applyPatch(current: Filters, patch: Patch, genres: readonly string[]): Filters {
  const next: Filters = { ...current };
  for (const key of patch.clear) (next as Record<string, unknown>)[key] = defaultFilters[key];

  if (patch.set.groupSize !== null) next.groupSize = patch.set.groupSize;
  if (patch.set.modes !== null) next.modes = patch.set.modes;
  if (patch.set.maxPrice !== null) next.maxPrice = patch.set.maxPrice;
  if (patch.set.pricing !== null) next.pricing = patch.set.pricing;
  if (patch.set.sort !== null) next.sort = patch.set.sort;

  const isGenre = (tag: string) => genres.includes(tag);
  const addGenres = patch.addPreferred.filter(isGenre);
  const addThemes = patch.addPreferred.filter((tag) => !isGenre(tag));

  next.exclude = withAdded(without(next.exclude, [...patch.removeExcluded, ...patch.addPreferred]), patch.addExcluded);
  next.genres = withAdded(without(next.genres, [...patch.removePreferred, ...patch.addExcluded]), addGenres);
  next.themes = withAdded(without(next.themes, [...patch.removePreferred, ...patch.addExcluded]), addThemes);

  // The result goes through the same validation as every other filter change.
  return filtersSchema.parse({
    ...next,
    genres: next.genres.slice(0, 10),
    themes: next.themes.slice(0, 10),
    exclude: next.exclude.slice(0, 10),
  });
}
