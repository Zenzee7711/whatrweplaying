import type { Capacity, Connection, Game } from "@/lib/catalogue/schema";
import type { OfferState } from "@/lib/offers/types";
import { kindPlayers, type PriceInfo } from "@/lib/search/search";

export const money = (n: number) => `$${n.toFixed(2)}`;

export function rangeText(players: Capacity | null): string | null {
  if (!players || players.max === null) return null;
  if (players.min !== null && players.min !== players.max) return `${players.min}–${players.max}`;
  return players.min === players.max ? `${players.max}` : `up to ${players.max}`;
}

// One short line per way of playing, e.g. "Online co-op · up to 4 together". Counts are always
// how many friends can play together (team, party or private lobby), never a whole match size.
export type PlayLine = { label: string; detail: string; together: string | null; verified: boolean };

export function playLines(game: Game): PlayLine[] {
  const lines: PlayLine[] = [];
  const add = (where: "Online" | "Local", connection: Connection) => {
    if (connection.supported !== true) return;
    for (const kind of ["coop", "versus"] as const) {
      if (connection[kind] !== true) continue;
      const range = rangeText(kindPlayers(connection, kind, where === "Online" ? "online" : "local"));
      const name = `${where} ${kind === "coop" ? "co-op" : "versus"}`;
      lines.push({
        label: name,
        detail: range ? `${range} together` : "group size unverified",
        together: range,
        verified: range !== null,
      });
    }
  };
  add("Online", game.online);
  add("Local", game.local);
  return lines;
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
