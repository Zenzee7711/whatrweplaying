import type { Mode } from "../search/filters.ts";
import { emptyPatch, type Patch } from "./patch.ts";

// A simple keyword reader, used when AI search is unavailable (no key, quota used up, timeout,
// or a response that failed validation). It produces the same kind of patch as the AI, so
// both go through the same merge, search and ranking.

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  pair: 2, couple: 2, duo: 2, trio: 3,
};

// "Relaxed" has no tag of its own, so it nudges the ranking towards calmer genres and themes.
const MOODS: Record<string, string[]> = {
  relaxed: ["farming", "life sim", "simulation", "puzzle", "comedy"],
  scary: ["horror"],
  funny: ["comedy", "party game"],
};
const MOOD_WORDS: Record<string, keyof typeof MOODS> = {
  relaxed: "relaxed", relaxing: "relaxed", chill: "relaxed", cozy: "relaxed", cosy: "relaxed", casual: "relaxed", calm: "relaxed",
  scary: "scary", spooky: "scary",
  funny: "funny", silly: "funny", chaotic: "funny",
};

function groupSize(text: string): number | null {
  const digit = text.match(/\b(\d{1,2})\s*(?:of us|people|players|friends|person|ppl)\b/) ?? text.match(/\b(?:we are|we're|there are)\s+(\d{1,2})\b/);
  if (digit) return Number(digit[1]);
  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b(?:${word})\\s+(?:of us|people|players|friends)\\b|\\b(?:we are|we're|there are)\\s+${word}\\b|\\ba\\s+${word}\\b`).test(text)) return n;
  }
  if (/\b(alone|solo|by myself|just me|single ?player)\b/.test(text)) return 1;
  return null;
}

function modes(text: string, size: number | null): Mode[] | null {
  const coop = /\b(co-?op|cooperative|together|team up)\b/.test(text);
  const versus = /\b(versus|vs|competitive|pvp|against each other)\b/.test(text);
  const online = /\b(online|internet|remote)\b/.test(text);
  const local = /\b(local|couch|split-?screen|same (?:pc|screen|room))\b/.test(text);
  const picked: Mode[] = [];
  const where = online && !local ? ["online"] : local && !online ? ["local"] : ["online", "local"];
  if (coop) where.forEach((w) => picked.push(`${w}-coop` as Mode));
  if (versus) where.forEach((w) => picked.push(`${w}-versus` as Mode));
  if (picked.length === 0 && (online || local) && size !== 1) {
    where.forEach((w) => picked.push(`${w}-coop` as Mode, `${w}-versus` as Mode));
  }
  if (size === 1 && picked.length === 0 && /\b(alone|solo|single ?player)\b/.test(text)) picked.push("solo");
  return picked.length ? picked : null;
}

function price(text: string): number | null {
  const match =
    text.match(/(?:under|below|less than|max(?:imum)?|up to|at most|within|budget(?: of)?)\s*\$?\s*(\d{1,3}(?:\.\d{1,2})?)/) ??
    text.match(/\$\s*(\d{1,3}(?:\.\d{1,2})?)/) ??
    text.match(/(\d{1,3}(?:\.\d{1,2})?)\s*(?:dollars|usd|bucks)/);
  return match ? Number(match[1]) : null;
}

export function basicPatch(message: string, tags: readonly string[]): Patch {
  const text = message.toLowerCase();
  const patch: Patch = structuredClone(emptyPatch);
  const size = groupSize(text);
  patch.set.groupSize = size;
  patch.set.modes = modes(text, size);
  patch.set.maxPrice = price(text);
  if (/\bfree(?:-to-play| to play)?\b/.test(text) && patch.set.maxPrice === null) patch.set.pricing = "free";
  if (/\b(cheapest|lowest price)\b/.test(text)) patch.set.sort = "price";

  // "no horror", "not horror", "without horror", "nothing scary" exclude; plain mentions prefer.
  const negated = (word: string) => new RegExp(`\\b(?:no|not|without|nothing|avoid|skip)\\s+(?:more\\s+|too\\s+)?${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text);
  for (const tag of tags) {
    if (!new RegExp(`\\b${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) continue;
    if (negated(tag)) patch.addExcluded.push(tag);
    else patch.addPreferred.push(tag);
  }
  for (const [word, mood] of Object.entries(MOOD_WORDS)) {
    if (!new RegExp(`\\b${word}\\b`).test(text)) continue;
    const moodTags = MOODS[mood].filter((tag) => tags.includes(tag));
    if (negated(word)) patch.addExcluded.push(...moodTags);
    else patch.addPreferred.push(...moodTags);
  }
  patch.addPreferred = [...new Set(patch.addPreferred)].filter((t) => !patch.addExcluded.includes(t)).slice(0, 6);
  patch.addExcluded = [...new Set(patch.addExcluded)].slice(0, 6);
  patch.removePreferred = [...patch.addExcluded];
  patch.removeExcluded = patch.addPreferred.filter((t) => !patch.addExcluded.includes(t));
  return patch;
}
