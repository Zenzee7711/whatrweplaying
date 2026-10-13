import type { OfferState } from "@/lib/offers/types";
import type { Result } from "@/lib/search/search";
import Artwork from "./Artwork";
import { playLines, PriceTag } from "./labels";

type GameCardProps = {
  result: Result;
  eager?: boolean; // the first row of cards: load the artwork straight away
  offerState: OfferState | undefined;
  saved: boolean;
  onOpen: () => void;
  onToggleSave: () => void;
  // The AI's one-line reason, when the card is one of its picks.
  note?: string | null;
  // Live player count from Steam, when known.
  playingNow?: number;
};

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function People() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
      <circle cx="9" cy="8" r="3" fill="currentColor" />
      <circle cx="16.5" cy="9" r="2.4" fill="currentColor" opacity="0.6" />
      <path d="M3.5 19c.7-3.3 3-5 5.5-5s4.8 1.7 5.5 5z" fill="currentColor" />
      <path d="M14.2 14.4c2.6-.4 5.1.9 5.9 4.6h-4.4" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

export default function GameCard({ result, eager = false, offerState, saved, onOpen, onToggleSave, note, playingNow }: GameCardProps) {
  const { game, reasons, price } = result;
  // The ways of playing that matched the search come first; otherwise the game's own list.
  const lines = playLines(game).slice(0, 2);

  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-muted/50">
      <button type="button" onClick={onOpen} className="relative block aspect-[460/215] overflow-hidden bg-raised text-left">
        <Artwork
          title={game.title}
          image={game.image}
          eager={eager}
          sizes="(min-width: 1280px) 320px, (min-width: 640px) 45vw, 100vw"
        />
        <span className="sr-only">Show details for {game.title}</span>
      </button>

      <button
        type="button"
        onClick={onToggleSave}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${game.title} from shortlist` : `Add ${game.title} to shortlist`}
        className={`absolute top-2.5 right-2.5 grid h-9 w-9 place-items-center rounded-full border transition-colors ${
          saved ? "border-accent bg-accent text-accent-foreground" : "border-line bg-background text-foreground hover:border-muted"
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
          <path
            d="M5 3h10a1 1 0 0 1 1 1v13l-6-3.5L4 17V4a1 1 0 0 1 1-1z"
            fill={saved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="font-display text-lg leading-snug font-semibold">
          <button type="button" onClick={onOpen} className="text-left hover:text-accent">
            {game.title}
          </button>
          {playingNow !== undefined && playingNow > 0 && (
            <span className="mt-0.5 block text-xs font-normal text-muted">{compact.format(playingNow)} playing on Steam now</span>
          )}
        </h3>

        {note && <p className="text-sm">{note}</p>}

        {lines.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {lines.map((line) => (
              <li key={line.label} className="flex items-center gap-2">
                <span className={line.verified ? "text-verified" : "text-unverified"}>
                  <People />
                </span>
                <span className={line.verified ? "font-medium" : "text-unverified"}>
                  {line.together ? `${line.together} together` : "Group size unverified"}
                </span>
                <span className="text-muted">· {line.label}</span>
              </li>
            ))}
          </ul>
        )}

        {!note && reasons.length > 0 && (
          <p className="line-clamp-2 text-sm text-muted">
            {reasons.filter((r) => !/players together$|^Online |^Local |^Can be played solo/.test(r)).join(" · ")}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
          <PriceTag price={price} state={offerState} />
          <button type="button" onClick={onOpen} className="shrink-0 font-medium text-accent hover:underline hover:underline-offset-4">
            Details
          </button>
        </div>
      </div>
    </article>
  );
}
