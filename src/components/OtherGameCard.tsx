import type { OtherGame } from "@/lib/igdb/map";
import type { OfferState } from "@/lib/offers/types";
import Artwork from "./Artwork";
import { money, People } from "./labels";

// How a game outside the catalogue can be played, from IGDB's listing (not checked by us). A
// known co-op group size reads like ours; anything else says plainly that it isn't checked.
export function OtherPlayLines({ game, mainOnly = false }: { game: OtherGame; mainOnly?: boolean }) {
  // Results cached before these fields existed may not have them.
  const all = game.play ?? [];
  // On cards: only the biggest known group, like our own cards.
  const known = all.filter((l) => l.together !== null);
  const play = !mainOnly ? all : known.length ? [known.reduce((a, b) => (b.together! > a.together! ? b : a))] : all.slice(0, 1);
  if (play.length === 0) {
    return game.singleplayer ? <p className="text-sm text-muted">Single-player</p> : null;
  }
  return (
    <ul className="space-y-1.5 text-sm">
      {play.map((line) => (
        <li key={line.label} className="flex items-center gap-2">
          <span className={line.together ? "text-muted" : "text-unverified"}>
            <People />
          </span>
          <span className={line.together ? "font-medium" : "text-unverified"}>
            {line.together ? `up to ${line.together} together` : "Group size not checked"}
          </span>
          <span className="text-muted">· {line.label}</span>
        </li>
      ))}
    </ul>
  );
}

function CardPrice({ game, state }: { game: OtherGame; state: OfferState | undefined }) {
  if (!state) return <span className="text-muted">Checking price…</span>;
  if (state.status === "unavailable") return <span className="text-muted">Price unavailable</span>;
  const best = state.offers[0];
  if (best) {
    return (
      <span>
        <span className="font-semibold">{money(best.price)}</span> <span className="text-muted">at {best.storeName}</span>
        {best.savings > 0 && <span className="ml-1.5 text-xs text-accent">−{best.savings}%</span>}
      </span>
    );
  }
  // Not sold at the stores we check (often free, or only on its own launcher).
  const stores = game.links.filter((l) => l.name !== "Official site").map((l) => l.name);
  return <span className="truncate text-muted">{stores.length ? `On ${stores.join(", ")}` : "Official site"}</span>;
}

// A recommended game that isn't in our hand-checked list: what the AI said about it, how it can be
// played according to IGDB, and its best current price.
export default function OtherGameCard({
  game,
  note,
  offerState,
  onOpen,
}: {
  game: OtherGame;
  note: string | null;
  offerState: OfferState | undefined;
  onOpen: () => void;
}) {
  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-muted/50">
      <button type="button" onClick={onOpen} className="relative block aspect-[460/215] overflow-hidden bg-raised text-left">
        <Artwork title={game.title} image={game.image} sizes="(min-width: 1280px) 320px, (min-width: 640px) 45vw, 100vw" />
        <span className="sr-only">Show details for {game.title}</span>
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="font-display text-lg leading-snug font-semibold">
          <button type="button" onClick={onOpen} className="text-left hover:text-accent">
            {game.title}
          </button>
          {game.year && <span className="ml-2 text-sm font-normal text-muted">{game.year}</span>}
        </h3>

        {note && <p className="text-sm">{note}</p>}

        <OtherPlayLines game={game} mainOnly />

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
          <CardPrice game={game} state={offerState} />
          <button type="button" onClick={onOpen} className="shrink-0 font-medium text-accent hover:underline hover:underline-offset-4">
            Details
          </button>
        </div>
      </div>
    </article>
  );
}
