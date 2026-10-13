import Image from "next/image";
import { useEffect, useRef } from "react";
import type { Game } from "@/lib/catalogue/schema";
import type { OfferState } from "@/lib/offers/types";
import { money, playLines } from "./labels";

type GameDrawerProps = {
  game: Game | null;
  offerState: OfferState | undefined;
  store: string | null;
  onClose: () => void;
};

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// A side drawer built on <dialog>: Esc closes it, focus stays inside while open, and the
// browser returns focus to where it was afterwards.
export default function GameDrawer({ game, offerState, store, onClose }: GameDrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (game && !dialog.open) dialog.showModal();
    if (!game && dialog.open) dialog.close();
  }, [game]);

  const offers = offerState?.status === "ok" ? offerState.offers : [];
  const lines = game ? playLines(game) : [];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="drawer-title"
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-xl overflow-y-auto border-l border-line bg-surface p-0 text-foreground"
    >
      {game && (
        <div className="motion-safe:animate-enter">
          <div className="relative aspect-[460/215] bg-raised">
            <Image src={game.image} alt={`${game.title} artwork`} fill sizes="576px" className="object-cover" />
          </div>
          <div className="space-y-6 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="drawer-title" className="font-display text-2xl font-semibold">
                  {game.title}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  PC ·{" "}
                  {game.monetization === "free-to-play"
                    ? "Free-to-play"
                    : game.monetization === "paid"
                      ? "Paid game"
                      : "Pricing model unknown"}
                  {game.singleplayer === true ? " · Can be played solo" : ""}
                </p>
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

            {game.description && <p className="text-muted">{game.description}</p>}

            <section aria-labelledby="play-heading">
              <h3 id="play-heading" className="text-sm font-semibold tracking-wide text-muted uppercase">
                Playing together
              </h3>
              {lines.length > 0 ? (
                <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                  {lines.map((line) => (
                    <li key={line.label} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                      <span>{line.label}</span>
                      <span className={line.verified ? "text-verified" : "text-unverified"}>{line.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">No verified multiplayer details.</p>
              )}
              {game.crossplayNote && <p className="mt-3 text-sm text-muted">Crossplay: {game.crossplayNote}</p>}
              <p className="mt-3 text-xs text-muted">
                Buying on different stores doesn&apos;t guarantee you can play together. If in doubt, everyone buys from the same store.
              </p>
            </section>

            <section aria-labelledby="offers-heading">
              <h3 id="offers-heading" className="text-sm font-semibold tracking-wide text-muted uppercase">
                Offers
              </h3>
              {game.monetization === "free-to-play" ? (
                <p className="mt-2 text-sm">Free-to-play. Download it from the game&apos;s store page.</p>
              ) : !offerState ? (
                <p className="mt-2 text-sm text-muted">Checking prices…</p>
              ) : offerState.status === "unavailable" ? (
                <p className="mt-2 text-sm text-muted">Price unavailable: {offerState.reason}.</p>
              ) : offers.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No listing found at the stores we check.</p>
              ) : (
                <>
                  <table className="mt-2 w-full text-sm">
                    <caption className="sr-only">Offers for {game.title}, lowest price first</caption>
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th scope="col" className="py-2 font-medium">Store</th>
                        <th scope="col" className="py-2 font-medium">Price</th>
                        <th scope="col" className="hidden py-2 font-medium sm:table-cell">Regular</th>
                        <th scope="col" className="py-2"><span className="sr-only">Link</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {offers.map((offer, i) => (
                        <tr key={offer.dealId} className={store && offer.storeId !== store ? "text-muted" : ""}>
                          <td className="py-2.5">
                            {offer.storeName}
                            {i === 0 && <span className="ml-2 text-xs text-verified">Lowest</span>}
                          </td>
                          <td className="py-2.5 font-semibold">
                            {money(offer.price)}
                            {offer.savings > 0 && <span className="ml-1.5 text-xs text-accent">−{offer.savings}%</span>}
                          </td>
                          <td className="hidden py-2.5 text-muted sm:table-cell">{money(offer.regularPrice)}</td>
                          <td className="py-2.5 text-right">
                            <a
                              href={offer.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-full border border-line px-3 py-1.5 text-xs hover:border-accent hover:text-accent"
                            >
                              Visit store<span className="sr-only"> ({offer.storeName}, opens in a new tab)</span>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted">
                    Base game, prices in USD from CheapShark, checked {time(offerState.retrievedAt)}. Lowest among checked
                    stores; your regional price may differ. A $0 price is a temporary promotion, not free-to-play.
                  </p>
                </>
              )}
            </section>

            {(game.genres.length > 0 || game.themes.length > 0) && (
              <p className="flex flex-wrap gap-1.5 text-xs">
                {[...game.genres, ...game.themes].map((tag) => (
                  <span key={tag} className="rounded-full bg-raised px-2.5 py-1 text-muted">
                    {tag}
                  </span>
                ))}
              </p>
            )}

            <section aria-labelledby="sources-heading" className="border-t border-line pt-4 text-xs text-muted">
              <h3 id="sources-heading" className="font-semibold">Sources</h3>
              <ul className="mt-1 space-y-1">
                {game.sources.map((source) => (
                  <li key={`${source.name}|${source.url}`}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                      {source.name}
                    </a>{" "}
                    · checked {source.retrieved}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </dialog>
  );
}
