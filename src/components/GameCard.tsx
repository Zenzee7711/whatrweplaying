import Image from "next/image";
import type { OfferState } from "@/lib/offers/types";
import type { Result } from "@/lib/search/search";
import { playLines, PriceTag } from "./labels";

type GameCardProps = {
  result: Result;
  offerState: OfferState | undefined;
  saved: boolean;
  onOpen: () => void;
  onToggleSave: () => void;
};

export default function GameCard({ result, offerState, saved, onOpen, onToggleSave }: GameCardProps) {
  const { game, reasons, price } = result;
  const lines = playLines(game).slice(0, 2);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-muted/40 motion-safe:animate-enter">
      <button type="button" onClick={onOpen} className="relative block aspect-[460/215] overflow-hidden bg-raised text-left">
        <Image
          src={game.image}
          alt={`${game.title} artwork`}
          fill
          sizes="(min-width: 1280px) 320px, (min-width: 640px) 45vw, 100vw"
          className="object-cover transition duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
        />
        <span className="sr-only">Show details for {game.title}</span>
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg leading-snug font-semibold">
            <button type="button" onClick={onOpen} className="text-left hover:text-accent">
              {game.title}
            </button>
          </h3>
          <button
            type="button"
            onClick={onToggleSave}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${game.title} from shortlist` : `Add ${game.title} to shortlist`}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${
              saved ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-foreground"
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
        </div>

        {lines.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 text-xs">
            {lines.map((line) => (
              <li key={line.label} className="rounded-full border border-line px-2.5 py-1">
                {line.label} <span className={line.verified ? "text-verified" : "text-unverified"}>· {line.detail}</span>
              </li>
            ))}
          </ul>
        )}

        {reasons.length > 0 && <p className="text-sm text-muted">{reasons.slice(0, 3).join(" · ")}</p>}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
          <PriceTag price={price} state={offerState} />
          <button type="button" onClick={onOpen} className="shrink-0 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
            Details
          </button>
        </div>
      </div>
    </article>
  );
}
