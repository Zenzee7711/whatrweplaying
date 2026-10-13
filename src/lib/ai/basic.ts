import type { Mode } from "../search/filters.ts";
import { findTitles, similarWord, titleInMessage, words } from "../search/titles.ts";
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
  story: ["rpg", "adventure", "open world", "exploration"],
};
const MOOD_WORDS: Record<string, keyof typeof MOODS> = {
  relaxed: "relaxed", relaxing: "relaxed", chill: "relaxed", cozy: "relaxed", cosy: "relaxed", casual: "relaxed", calm: "relaxed",
  scary: "scary", spooky: "scary",
  funny: "funny", silly: "funny", chaotic: "funny",
  story: "story", immersive: "story", narrative: "story", "story-driven": "story",
};

// A message that changes the last search ("actually no horror", "cheaper", "make it 3") rather
// than describing a new one. New requests start from fresh filters.
export function looksLikeFollowUp(message: string): boolean {
  const text = message.trim().toLowerCase();
  return (
    /^(actually|also|and|but|plus|instead|now|ok(ay)?|no|not|without|make it|change|only|more|less|cheaper|same|what about|how about|under|below|with|except|remove|add)\b/.test(text) ||
    /^(cheaper|cheapest|free|paid|online|local)( ones?| only)?$/.test(text)
  );
}

function groupSize(text: string): number | null {
  const numberWord = `\\d{1,2}|${Object.keys(WORD_NUMBERS).join("|")}`;
  const asNumber = (value: string) => Number(value) || WORD_NUMBERS[value];
  // Checked first: "me and 3 friends" / "with 2 friends" count the speaker too.
  const plusMe = text.match(new RegExp(`\\b(?:me and|with)\\s+(${numberWord})\\s+(?:friends|mates|others|people)\\b`));
  if (plusMe) return asNumber(plusMe[1]) + 1;
  const digit = text.match(/\b(\d{1,2})\s*(?:of us|people|players|friends|person|ppl)\b/) ?? text.match(/\b(?:we are|we're|there are)\s+(\d{1,2})\b/);
  if (digit) return Number(digit[1]);
  // "for two", "for 3"
  const forN = text.match(new RegExp(`\\bfor\\s+(${numberWord})\\b`));
  if (forN) return asNumber(forN[1]);
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
  const local = /\b(local|couch|split-?screen|same (?:pc|screen|room)|one (?:pc|computer|screen|keyboard))\b/.test(text);
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

// A tag written with a typo or without spaces ("battleroyle", "survivalhorror").
function fuzzyTag(text: string, tag: string): boolean {
  const compactTag = tag.replace(/[\s/-]+/g, "");
  if (compactTag.length < 5) return false;
  const tokens = words(text);
  const size = tag.split(/[\s/-]+/).length;
  for (let n = 1; n <= Math.max(1, size); n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if (similarWord(tokens.slice(i, i + n).join(""), compactTag)) return true;
    }
  }
  return false;
}

// "games like Monster Hunter", "similar to Valheim": the named game, or the unknown name.
function namedGame(
  message: string,
  games: readonly { id: string; title: string }[],
  tags: readonly string[],
): { like: string | null; unknown: string | null } {
  // The name ends where the rest of the request starts ("like PUBG for 4 of us" -> "PUBG").
  const phrase = message
    .match(/\b(?:like|similar to|such as|same as)\s+([a-z0-9][^,.!?;]{1,40})/i)?.[1]
    ?.split(/\s+(?:for|with|and|but|under|below|on|that|which|in|at)\s+/i)[0]
    ?.trim();
  if (phrase) {
    const best = findTitles(phrase, games)[0] ?? titleInMessage(phrase, games);
    if (best) return { like: best.item.id, unknown: null };
    // "like battle royale" (or a typo of it) asks for a genre, not a game.
    if (tags.some((tag) => tag === phrase.toLowerCase() || fuzzyTag(phrase, tag))) return { like: null, unknown: null };
    // Only report a missing game if it looks like a name, not "like scary stuff".
    const firstWord = phrase.split(/\s+/)[0].toLowerCase();
    const looksLikeName = !/^(a|an|the|some|something|scary|chill|horror|co-?op|online|local)$/.test(firstWord);
    return { like: null, unknown: looksLikeName ? phrase.split(/\s+/).slice(0, 4).join(" ") : null };
  }
  const found = titleInMessage(message, games);
  return { like: found?.item.id ?? null, unknown: null };
}

export function basicPatch(message: string, tags: readonly string[], games: readonly { id: string; title: string }[] = []): Patch {
  const text = message.toLowerCase();
  const patch: Patch = structuredClone(emptyPatch);
  const named = namedGame(message, games, tags);
  patch.set.like = named.like;
  patch.unknownTitle = named.unknown;
  const size = groupSize(text);
  patch.set.groupSize = size;
  patch.set.modes = modes(text, size);
  patch.set.maxPrice = price(text);
  if (/\bfree(?:-to-play| to play)?\b/.test(text) && patch.set.maxPrice === null) patch.set.pricing = "free";
  if (/\b(cheap|cheaper|cheapest|lowest price)\b/.test(text)) patch.set.sort = "price";

  // "no horror", "not horror", "without horror", "nothing scary" exclude; plain mentions prefer.
  const negated = (word: string) => new RegExp(`\\b(?:no|not|without|nothing|avoid|skip)\\s+(?:more\\s+|too\\s+)?${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text);
  // Words that are part of the game's name ("Monster Hunter") aren't genre requests.
  const titleWords = new Set(named.like ? words(games.find((g) => g.id === named.like)?.title ?? "") : []);
  for (const tag of tags) {
    if (titleWords.has(tag)) continue;
    const exact = new RegExp(`\\b${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`).test(text);
    if (!exact && !fuzzyTag(text, tag)) continue;
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
