// Finding games by name, forgiving typos and short forms: "monstr huntr", "monster hunter",
// "cs2", "l4d2" and "dst" all find the right game. Pure functions, tested in titles.test.ts.

const STOP_WORDS = new Set(["the", "of", "a", "an", "and", "to", "game", "games", "for", "with", "us", "me", "we"]);

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Number of single-letter edits between two words (Levenshtein distance).
export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

// How many typos a word of this length may have and still count as the same word.
const allowedTypos = (length: number) => (length >= 8 ? 2 : length >= 4 ? 1 : 0);

export function similarWord(a: string, b: string): boolean {
  return a === b || editDistance(a, b) <= Math.min(allowedTypos(a.length), allowedTypos(b.length));
}

// "Counter-Strike 2" -> "cs2", "Left 4 Dead 2" -> "l4d2", "Don't Starve Together" -> "dst".
function shortForm(title: string): string {
  return words(title)
    .filter((w) => !STOP_WORDS.has(w) && w !== "t")
    .map((w) => (/^\d+$/.test(w) ? w : w[0]))
    .join("");
}

// 0..1: how well a typed name matches a title.
export function titleScore(query: string, title: string): number {
  const q = words(query).filter((w) => !STOP_WORDS.has(w));
  const t = words(title);
  if (q.length === 0) return 0;
  const qJoined = q.join("");
  const tJoined = t.join("");
  if (qJoined.length >= 2 && qJoined === shortForm(title)) return 1;
  if (qJoined === tJoined) return 1;
  // Part of the title typed exactly ("monster hunter"): the more of it, the higher the score.
  if (qJoined.length >= 5 && tJoined.includes(qJoined)) return 0.75 + 0.25 * (qJoined.length / tJoined.length);
  // Every typed word must be close to some word of the title.
  let total = 0;
  for (const word of q) {
    let best = 0;
    for (const titleWord of t) {
      if (word === titleWord) best = 1;
      else if (word.length >= 4 && titleWord.startsWith(word)) best = Math.max(best, 0.9);
      else if (similarWord(word, titleWord)) best = Math.max(best, 0.8);
    }
    if (best === 0) return 0;
    total += best;
  }
  // Mentioning only part of a long title ("monster" for "Monster Hunter: World") scores lower.
  const coverage = Math.min(1, q.length / t.filter((w) => !STOP_WORDS.has(w)).length);
  return (total / q.length) * (0.75 + 0.25 * coverage);
}

export type TitleMatch<T> = { item: T; score: number };

export function findTitles<T extends { title: string }>(query: string, items: readonly T[], minScore = 0.7): TitleMatch<T>[] {
  return items
    .map((item) => ({ item, score: titleScore(query, item.title) }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

// Looks for a game title anywhere inside a longer message ("is monster hunter good for 4?").
// Tries every run of 1-4 consecutive words and keeps the best-scoring title.
export function titleInMessage<T extends { title: string }>(message: string, items: readonly T[]): TitleMatch<T> | null {
  const tokens = words(message);
  let best: TitleMatch<T> | null = null;
  for (let size = 1; size <= 4; size++) {
    for (let start = 0; start + size <= tokens.length; start++) {
      const spanWords = tokens.slice(start, start + size);
      // Skip spans with filler or tiny words ("of us" must not find "Among Us").
      if (spanWords.some((w) => STOP_WORDS.has(w) || (w.length < 3 && !/^\d+$/.test(w)))) continue;
      const span = spanWords.join(" ");
      for (const item of items) {
        const score = titleScore(span, item.title);
        // Single words need an exact title ("raft") so ordinary words don't match by accident;
        // two or more words may carry small typos ("monstr huntr").
        const enough = size > 1 ? score >= 0.7 : score === 1;
        if (enough && (!best || score > best.score)) best = { item, score };
      }
    }
  }
  return best;
}
