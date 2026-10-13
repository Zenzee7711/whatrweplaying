import type { OtherGame } from "../igdb/map.ts";
import { titleScore } from "../search/titles.ts";

// A game the AI recommended, after the server confirmed it exists: either one of ours (with
// verified group sizes) or another PC game found on IGDB (group size not checked).
export type Pick = { why: string | null } & ({ kind: "catalogue"; id: string } | { kind: "other"; game: OtherGame });

// The AI's one-line reason is shown as its opinion, so it must not carry facts we haven't
// checked. A reason that mentions player counts, play modes, prices or free-to-play is dropped.
const FACT_CLAIMS = /\$\s?\d|\d+\s*(?:-|\s)?(?:players?|people|friends|person)\b|\b\d+v\d+\b|\bup to (?:\d+|two|three|four|five|six|eight|ten)\b|free[- ]to[- ]play|\b(?:price|cheap|discount|on sale)\b|\b(?:local|online|split[- ]?screen|couch|lan)\s*(?:co-?op|multiplayer|versus|pvp)\b|\bcrossplay\b/i;

export function cleanWhy(why: string): string | null {
  const text = why.replace(/\s+/g, " ").trim();
  if (!text || FACT_CLAIMS.test(text)) return null;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

// The best title match among candidates, or null when none is close enough to be the same game.
// On a tie, the earlier candidate wins, so callers can order candidates by preference.
export function bestTitleMatch<T extends { title: string }>(title: string, items: readonly T[], minScore: number): T | null {
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const score = Math.max(titleScore(title, item.title), titleScore(item.title, title));
    if (score >= minScore && (!best || score > best.score)) best = { item, score };
  }
  return best?.item ?? null;
}
