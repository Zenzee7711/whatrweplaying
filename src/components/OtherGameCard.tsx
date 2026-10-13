import type { OtherGame } from "@/lib/igdb/map";
import Artwork from "./Artwork";

// A recommended game that isn't in our catalogue: what the AI said about it, where it's sold, and
// (for group searches) a plain note that we haven't checked group sizes. Prices load when the
// details open.
export default function OtherGameCard({ game, note, solo = false, onOpen }: { game: OtherGame; note: string | null; solo?: boolean; onOpen: () => void }) {
  const stores = game.links.filter((l) => l.name !== "Official site").map((l) => l.name);
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

        {!solo && <p className="text-sm text-muted">Not in our catalogue, so group size isn&apos;t checked.</p>}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
          <span className="truncate text-muted">{stores.length ? stores.join(", ") : "Official site"}</span>
          <button type="button" onClick={onOpen} className="shrink-0 font-medium text-accent hover:underline hover:underline-offset-4">
            Details
          </button>
        </div>
      </div>
    </article>
  );
}
