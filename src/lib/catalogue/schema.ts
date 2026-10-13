import { z } from "zod";

// The curated catalogue's shape. Everything that can be unknown is nullable:
// null means "not verified", never "no" and never zero.

export const capacitySchema = z.object({
  min: z.number().int().positive().nullable(),
  max: z.number().int().positive().nullable(),
});
export type Capacity = z.infer<typeof capacitySchema>;

// One way of playing together (local, LAN or online).
export const connectionSchema = z.object({
  supported: z.boolean().nullable(),
  players: capacitySchema.nullable(),
  // Which kinds of multiplayer the source lists for this connection.
  coop: z.boolean().nullable(),
  versus: z.boolean().nullable(),
  // True when the source gives one player range for co-op and versus together,
  // so the range is the connection's limit rather than a separate co-op team size.
  sharedRange: z.boolean(),
  // Reviewed per-kind limits (see data/overrides.json). When a range is shared, only these
  // count as verified: e.g. Left 4 Dead 2 is 8 online overall but its co-op campaign is 4.
  coopPlayers: capacitySchema.nullable(),
  versusPlayers: capacitySchema.nullable(),
  notes: z.string().nullable(),
});
export type Connection = z.infer<typeof connectionSchema>;

export const sourceSchema = z.object({
  name: z.string(),
  url: z.url(),
  retrieved: z.iso.date(),
});

export const gameSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  // Null for games that aren't sold on Steam (e.g. Riot's games); those carry a launcher instead.
  steamAppId: z.number().int().positive().nullable(),
  // Reviewed mapping to CheapShark's base-game record, found by Steam app ID (never by title).
  cheapsharkGameId: z.string().regex(/^\d+$/).nullable(),
  platforms: z.array(z.literal("pc")).min(1),
  monetization: z.enum(["free-to-play", "paid", "unknown"]),
  singleplayer: z.boolean().nullable(),
  local: connectionSchema,
  lan: connectionSchema,
  online: connectionSchema,
  crossplayNote: z.string().nullable(),
  genres: z.array(z.string()),
  themes: z.array(z.string()),
  description: z.string().nullable(),
  // How many people rated it on IGDB: a rough "how well known" signal, used only to order
  // otherwise equal matches. Null until sync:igdb runs.
  ratingCount: z.number().int().nonnegative().nullable().default(null),
  image: z.url().nullable(),
  // Reviewed official place to get a game the checked stores don't sell (Riot Client, Epic, ...).
  launcher: z.object({ name: z.string().min(1), url: z.url() }).nullable(),
  sources: z.array(sourceSchema).min(1),
});
export type Game = z.infer<typeof gameSchema>;

export const catalogueSchema = z.object({
  generated: z.iso.date(),
  games: z.array(gameSchema),
});
export type Catalogue = z.infer<typeof catalogueSchema>;
