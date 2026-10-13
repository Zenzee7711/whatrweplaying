import raw from "../../../data/catalogue.json";
import { catalogueSchema, type Game } from "./schema.ts";

// The curated catalogue, validated when it is loaded. Everything reads games through these
// functions, so the storage can later move to a database without touching search or ranking.
const catalogue = catalogueSchema.parse(raw);

export const games: readonly Game[] = catalogue.games;
export const catalogueDate = catalogue.generated;

const byId = new Map(games.map((game) => [game.id, game]));
export function getGame(id: string): Game | undefined {
  return byId.get(id);
}

// Every genre and theme in the catalogue, lowercased. Filters and the AI may only use these.
function vocabulary(pick: (game: Game) => string[]): string[] {
  return [...new Set(games.flatMap((game) => pick(game).map((t) => t.toLowerCase())))].sort();
}
export const genreVocabulary = vocabulary((game) => game.genres);
const themeVocabulary = vocabulary((game) => game.themes);
export const tagVocabulary = [...new Set([...genreVocabulary, ...themeVocabulary])].sort();
