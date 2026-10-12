import { defaultFilters, filtersSchema, MODES, PRICING, SORTS, type Filters } from "./filters.ts";

// Filters live in the URL, so any search can be shared as a link. Reading a link never trusts
// it: each value is validated on its own, and anything invalid falls back to the default.

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const list = (value: string | string[] | undefined) =>
  (first(value) ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);

function pick<K extends keyof Filters>(key: K, value: unknown): Filters[K] {
  const field = filtersSchema.shape[key].safeParse(value);
  return field.success ? (field.data as Filters[K]) : defaultFilters[key];
}

export function filtersFromParams(params: Params): Filters {
  const number = (value: string | undefined) => (value === undefined || value === "" ? null : Number(value));
  return {
    groupSize: pick("groupSize", number(first(params.players))),
    modes: pick("modes", list(params.modes).filter((m) => (MODES as readonly string[]).includes(m))),
    genres: pick("genres", list(params.genres)),
    themes: pick("themes", list(params.themes)),
    exclude: pick("exclude", list(params.exclude)),
    pricing: pick("pricing", (PRICING as readonly string[]).includes(first(params.pricing) ?? "") ? first(params.pricing) : "any"),
    maxPrice: pick("maxPrice", number(first(params.max))),
    store: pick("store", first(params.store) ?? null),
    sort: pick("sort", (SORTS as readonly string[]).includes(first(params.sort) ?? "") ? first(params.sort) : "best"),
  };
}

// Only non-default values are written, so links stay short.
export function filtersToParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.groupSize !== null) params.set("players", String(filters.groupSize));
  if (filters.modes.length) params.set("modes", filters.modes.join(","));
  if (filters.genres.length) params.set("genres", filters.genres.join(","));
  if (filters.themes.length) params.set("themes", filters.themes.join(","));
  if (filters.exclude.length) params.set("exclude", filters.exclude.join(","));
  if (filters.pricing !== "any") params.set("pricing", filters.pricing);
  if (filters.maxPrice !== null) params.set("max", String(filters.maxPrice));
  if (filters.store !== null) params.set("store", filters.store);
  if (filters.sort !== "best") params.set("sort", filters.sort);
  return params;
}

// A shared shortlist is a list of public game IDs, nothing else. Unknown IDs are dropped.
export function shortlistFromParam(value: string | string[] | undefined, knownIds: (id: string) => boolean): string[] {
  return [...new Set(list(value).filter((id) => /^[a-z0-9-]{1,60}$/.test(id) && knownIds(id)))].slice(0, 20);
}
