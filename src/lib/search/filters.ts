import { z } from "zod";

// The search filters. Manual controls, shared links and the AI all produce this one shape,
// and it is always validated before use.

export const MODES = ["solo", "online-coop", "local-coop", "online-versus", "local-versus"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABELS: Record<Mode, string> = {
  solo: "Solo",
  "online-coop": "Online co-op",
  "local-coop": "Local co-op",
  "online-versus": "Online versus",
  "local-versus": "Local versus",
};

export const SORTS = ["best", "price", "discount"] as const;
export type Sort = (typeof SORTS)[number];

export const PRICING = ["any", "free", "paid"] as const;

const tag = z.string().trim().toLowerCase().min(1).max(40);

export const filtersSchema = z.object({
  groupSize: z.number().int().min(1).max(16).nullable(),
  // Any of these modes. Empty means "any way of playing that fits the group".
  modes: z.array(z.enum(MODES)).max(MODES.length),
  // Preferred genres and themes: they rank results, they don't remove them.
  genres: z.array(tag).max(10),
  themes: z.array(tag).max(10),
  // Hard exclusions on genres or themes ("no horror").
  exclude: z.array(tag).max(10),
  pricing: z.enum(PRICING),
  // Maximum price per person, in USD. Null means no budget.
  maxPrice: z.number().min(0).max(500).nullable(),
  // A common storefront everyone buys from (CheapShark store ID), so versions match.
  store: z.string().regex(/^\d{1,3}$/).nullable(),
  sort: z.enum(SORTS),
  // A game the user named ("games like Monster Hunter"): ranks similar games higher. Never hides any.
  like: z.string().regex(/^[a-z0-9-]{1,60}$/).nullable(),
});
export type Filters = z.infer<typeof filtersSchema>;

export const defaultFilters: Filters = {
  groupSize: null,
  modes: [],
  genres: [],
  themes: [],
  exclude: [],
  pricing: "any",
  maxPrice: null,
  store: null,
  sort: "best",
  like: null,
};
