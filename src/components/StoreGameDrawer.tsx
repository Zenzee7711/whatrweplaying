import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { fetchStoreGameOffers, RateLimitedError, type StoreGame } from "@/lib/offers/cheapshark";
import type { OfferState } from "@/lib/offers/types";
import OffersTable from "./OffersTable";

// Details for a game found by name that isn't in our catalogue: live prices only, and an honest
// note that we haven't verified how many people can play it together.
export default function StoreGameDrawer({ game, onClose }: { game: StoreGame | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [offers, setOffers] = useState<{ gameId: string; state: OfferState } | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (game && !dialog.open) dialog.showModal();
    if (!game && dialog.open) dialog.close();
  }, [game]);

  useEffect(() => {
    if (!game) return;
    const controller = new AbortController();
    fetchStoreGameOffers(game.gameId, controller.signal)
      .then((state) => setOffers({ gameId: game.gameId, state }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        const reason =
          error instanceof RateLimitedError ? `price checks are paused for ${error.retryAfterSeconds}s` : "the price service didn't respond";
        setOffers({ gameId: game.gameId, state: { status: "unavailable", reason } });
      });
    return () => controller.abort();
  }, [game]);

  // Newer Steam apps don't serve the classic header path; fall back to the store thumbnail.
  const [brokenHeader, setBrokenHeader] = useState<string | null>(null);
  const state = game && offers?.gameId === game.gameId ? offers.state : undefined;
  const header =
    game?.steamAppId && brokenHeader !== game.gameId
      ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.steamAppId}/header.jpg`
      : game?.thumb ?? null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="store-drawer-title"
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-xl overflow-y-auto border-l border-line bg-surface p-0 text-foreground"
    >
      {game && (
        <div className="motion-safe:animate-enter">
          <div className="relative aspect-[460/215] bg-raised">
            {header && (
              <Image
                src={header}
                alt={`${game.title} artwork`}
                fill
                sizes="576px"
                className="object-cover"
                onError={() => setBrokenHeader(game.gameId)}
              />
            )}
          </div>
          <div className="space-y-6 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="store-drawer-title" className="font-display text-2xl font-semibold">
                  {game.title}
                </h2>
                <p className="mt-1 text-sm text-muted">PC · found by name in store data</p>
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
                We haven&apos;t verified how many people can play it together, so it isn&apos;t in group results. Prices
                below are live.
              </span>
            </p>

            <section aria-labelledby="store-offers-heading">
              <h3 id="store-offers-heading" className="text-sm font-semibold tracking-wide text-muted uppercase">
                Offers
              </h3>
              <OffersTable title={game.title} state={state} store={null} edition={`This listing ("${game.title}")`} />
            </section>
          </div>
        </div>
      )}
    </dialog>
  );
}
