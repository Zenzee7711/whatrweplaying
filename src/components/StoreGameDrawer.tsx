import { useEffect, useRef, useState } from "react";
import type { OtherGame } from "@/lib/igdb/map";
import { cheapsharkIdForSteamApp, fetchStoreGameOffers, RateLimitedError } from "@/lib/offers/cheapshark";
import type { OfferState } from "@/lib/offers/types";
import Artwork from "./Artwork";
import OffersTable from "./OffersTable";

// Details for a game found by name that isn't in our catalogue: where to get it, live prices
// when its store record can be matched exactly, and an honest note that we haven't checked how
// many people can play it together.
export default function StoreGameDrawer({ game, onClose }: { game: OtherGame | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [offers, setOffers] = useState<{ key: string; state: OfferState | null } | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (game && !dialog.open) dialog.showModal();
    if (!game && dialog.open) dialog.close();
  }, [game]);

  useEffect(() => {
    if (!game) return;
    const controller = new AbortController();
    (async () => {
      try {
        const id =
          game.cheapsharkGameId ?? (game.steamAppId ? await cheapsharkIdForSteamApp(game.steamAppId, controller.signal) : null);
        // No exact store record: show links only, not a guessed price.
        const state = id ? await fetchStoreGameOffers(id, controller.signal) : null;
        setOffers({ key: game.key, state });
      } catch (error) {
        if (controller.signal.aborted) return;
        const reason =
          error instanceof RateLimitedError ? `price checks are paused for ${error.retryAfterSeconds}s` : "the price service didn't respond";
        setOffers({ key: game.key, state: { status: "unavailable", reason } });
      }
    })();
    return () => controller.abort();
  }, [game]);

  const loaded = game && offers?.key === game.key;
  const state = loaded ? offers.state : undefined;
  const steamHeader = game?.steamAppId
    ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.steamAppId}/header.jpg`
    : null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="store-drawer-title"
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-xl overflow-y-auto border-l border-line bg-surface p-0 text-foreground"
    >
      {game && (
        <div>
          <div className="relative aspect-[460/215] bg-raised">
            <Artwork title={game.title} image={game.image ?? steamHeader} sizes="576px" eager />
          </div>
          <div className="space-y-6 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="store-drawer-title" className="font-display text-2xl font-semibold">
                  {game.title}
                </h2>
                <p className="mt-1 text-sm text-muted">PC{game.year ? ` · ${game.year}` : ""}</p>
              </div>
              <button
                type="button"
                onClick={() => ref.current?.close()}
                aria-label="Close details"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line hover:border-muted"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <p className="rounded-2xl bg-unverified/10 p-4 text-sm">
              <span className="font-medium">Not in our catalogue yet.</span>{" "}
              <span className="text-muted">
                We haven&apos;t checked how many people can play it together, so it doesn&apos;t show up in group results.
              </span>
            </p>

            {game.links.length > 0 && (
              <section aria-labelledby="store-links-heading">
                <h3 id="store-links-heading" className="text-sm font-semibold tracking-wide text-muted uppercase">
                  Get the game
                </h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {game.links.map((link) => (
                    <li key={link.url}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block rounded-full border border-line px-3.5 py-1.5 text-sm hover:border-accent hover:text-accent"
                      >
                        {link.name}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="store-offers-heading">
              <h3 id="store-offers-heading" className="text-sm font-semibold tracking-wide text-muted uppercase">
                Prices
              </h3>
              {loaded && state === null ? (
                <p className="mt-2 text-sm text-muted">
                  None of the stores we check list this game, or it&apos;s free. Use the links above.
                </p>
              ) : (
                <OffersTable title={game.title} state={state ?? undefined} store={null} edition={`This listing ("${game.title}")`} />
              )}
            </section>

            {game.key.startsWith("igdb-") && (
              <p className="text-xs text-muted">
                Game details from{" "}
                <a
                  href={`https://www.igdb.com/search?q=${encodeURIComponent(game.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  IGDB
                </a>
                .
              </p>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
