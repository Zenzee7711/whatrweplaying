import type { Capacity, Connection, Game } from "@/lib/catalogue/schema";
import type { OfferState } from "@/lib/offers/types";
import { kindPlayers, type PriceInfo } from "@/lib/search/search";

export const money = (n: number) => `$${n.toFixed(2)}`;

function rangeText(players: Capacity | null): string | null {
  if (!players || players.max === null) return null;
  if (players.min !== null && players.min !== players.max) return `${players.min}–${players.max}`;
  return players.min === players.max ? `${players.max}` : `up to ${players.max}`;
}

// One short line per way of playing, e.g. "Online co-op · up to 4 together". Counts are always
// how many friends can play together (team, party or private lobby), never a whole match size.
type PlayLine = { label: string; detail: string; together: string | null; verified: boolean; max: number | null };

export function playLines(game: Game): PlayLine[] {
  const lines: PlayLine[] = [];
  const add = (where: "Online" | "Local", connection: Connection) => {
    if (connection.supported !== true) return;
    for (const kind of ["coop", "versus"] as const) {
      if (connection[kind] !== true) continue;
      const players = kindPlayers(connection, kind, where === "Online" ? "online" : "local");
      const range = rangeText(players);
      const name = `${where} ${kind === "coop" ? "co-op" : "versus"}`;
      lines.push({
        label: name,
        detail: range ? `${range} together` : "group size unverified",
        together: range,
        verified: range !== null,
        max: range !== null ? players?.max ?? null : null,
      });
    }
  };
  add("Online", game.online);
  add("Local", game.local);
  return lines;
}

// The one line a card shows: the most friends who can play together in one party or lobby, in
// whichever mode allows the most (e.g. Left 4 Dead 2: 8 in a versus lobby). Modes without a
// checked size only show when nothing is checked.
export function mainPlayLine(game: Game): PlayLine | null {
  const lines = playLines(game);
  const checked = lines.filter((l) => l.max !== null);
  if (checked.length === 0) return lines[0] ?? null;
  return checked.reduce((best, line) => (line.max! > best.max! ? line : best));
}

export function PriceTag({ price, state }: { price: PriceInfo; state: OfferState | undefined }) {
  if (price.kind === "free-to-play") return <span className="font-medium text-verified">Free-to-play</span>;
  if (price.kind === "offer") {
    const { offer } = price;
    return (
      <span>
        <span className="font-semibold">{money(offer.price)}</span>
        <span className="text-muted"> at {offer.storeName}</span>
        {offer.savings > 0 && <span className="ml-1.5 rounded bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent">−{offer.savings}%</span>}
      </span>
    );
  }
  if (price.kind === "no-offer") return <span className="text-muted">No listing at checked stores</span>;
  if (!state) return <span className="text-muted">Checking prices…</span>;
  return <span className="text-muted">Price unavailable</span>;
}

// The "players" icon used next to group sizes.
export function People() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
      <circle cx="9" cy="8" r="3" fill="currentColor" />
      <circle cx="16.5" cy="9" r="2.4" fill="currentColor" opacity="0.6" />
      <path d="M3.5 19c.7-3.3 3-5 5.5-5s4.8 1.7 5.5 5z" fill="currentColor" />
      <path d="M14.2 14.4c2.6-.4 5.1.9 5.9 4.6h-4.4" fill="currentColor" opacity="0.6" />
    </svg>
  );
}
