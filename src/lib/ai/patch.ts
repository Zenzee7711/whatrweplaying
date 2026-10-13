import { z } from "zod";
import { defaultFilters, filtersSchema, MODES, PRICING, SORTS, type Filters } from "../search/filters.ts";

// The AI never edits filters directly. It returns a small list of changes ("patch"), which is
// validated and then applied here, in code. The server decides whether a message is a new
// request (fresh filters) or a follow-up like "no horror" (changes only what it mentions).
// It can also name games it recommends ("picks"); the server checks each one exists before
// showing it, and never takes player counts or prices from the AI.

export const CLEARABLE = ["groupSize", "modes", "maxPrice", "pricing", "genres", "themes", "exclude", "like"] as const;

// One shape, two strictness levels: the tag and game fields are either free text (what the
// model is asked for, so the schema sent with every request stays small) or limited to the
// catalogue's own genres, themes and game IDs (what the app accepts).
function patchShape<Tag extends z.ZodType<string>, Like extends z.ZodType<string>>(tag: Tag, like: Like) {
  return z.strictObject({
    action: z.enum(["update", "clarify"]),
    clarification: z.string().max(200).nullable(),
    summary: z.string().max(200).nullable(),
    // A game the user named that isn't in the catalogue ("PUBG"), so the app can say so.
    unknownTitle: z.string().max(60).nullable(),
    set: z.strictObject({
      groupSize: z.number().int().min(1).max(16).nullable(),
      modes: z.array(z.enum(MODES)).max(MODES.length).nullable(),
      maxPrice: z.number().min(0).max(500).nullable(),
      pricing: z.enum(PRICING).nullable(),
      sort: z.enum(SORTS).nullable(),
      like: like.nullable(),
    }),
    clear: z.array(z.enum(CLEARABLE)).max(CLEARABLE.length),
    addPreferred: z.array(tag).max(6),
    removePreferred: z.array(tag).max(6),
    addExcluded: z.array(tag).max(6),
    removeExcluded: z.array(tag).max(6),
    picks: z.array(z.strictObject({ title: z.string().min(1).max(80), why: z.string().max(160) })).max(6),
  });
}

export function makePatchSchema(tags: readonly string[], gameIds: readonly string[]) {
  return patchShape(z.enum(tags as [string, ...string[]]), z.enum(gameIds as [string, ...string[]]));
}

// What the model replies with: tags and the liked game as plain text.
export const wirePatchSchema = patchShape(z.string().max(40), z.string().max(60));

// Keeps only known tags and game IDs from the model's reply (case-insensitive), then checks the
// result against the strict schema. An unknown tag is dropped rather than failing the request.
export function fromWire(wire: z.infer<typeof wirePatchSchema>, tags: readonly string[], gameIds: readonly string[]): Patch {
  const known = (list: string[]) => [...new Set(list.map((t) => t.trim().toLowerCase()).filter((t) => tags.includes(t)))];
  const like = wire.set.like?.trim().toLowerCase() ?? null;
  return makePatchSchema(tags, gameIds).parse({
    ...wire,
    set: { ...wire.set, like: like && gameIds.includes(like) ? like : null },
    addPreferred: known(wire.addPreferred),
    removePreferred: known(wire.removePreferred),
    addExcluded: known(wire.addExcluded),
    removeExcluded: known(wire.removeExcluded),
  });
}
export type Patch = z.infer<ReturnType<typeof makePatchSchema>>;

export const emptyPatch: Patch = {
  action: "update",
  clarification: null,
  summary: null,
  unknownTitle: null,
  set: { groupSize: null, modes: null, maxPrice: null, pricing: null, sort: null, like: null },
  clear: [],
  addPreferred: [],
  removePreferred: [],
  addExcluded: [],
  removeExcluded: [],
  picks: [],
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
  if (patch.set.like !== null) next.like = patch.set.like;

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
