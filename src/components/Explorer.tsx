"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { site } from "@/config/site";
import { useShortlist } from "@/hooks/useShortlist";
import { catalogueDate, games, getGame } from "@/lib/catalogue";
import type { Game } from "@/lib/catalogue/schema";
import { cachedOffers, saveOffers } from "@/lib/offers/cache";
import type { Pick } from "@/lib/ai/picks";
import type { OtherGame } from "@/lib/igdb/map";
import { BATCH_SIZE, fetchOffers, fetchOtherOffers, RateLimitedError } from "@/lib/offers/cheapshark";
import type { OfferMap, OfferState } from "@/lib/offers/types";
import { defaultFilters, filtersSchema, type Filters, type Sort } from "@/lib/search/filters";
import type { Popularity } from "@/lib/search/popularity";
import { search, type Constraint, type Result } from "@/lib/search/search";
import { filtersToParams } from "@/lib/search/url";
import ActiveFilters from "./ActiveFilters";
import AssistBar, { type AssistStatus, type SearchMode } from "./AssistBar";
import FilterPanel from "./FilterPanel";
import GameCard from "./GameCard";
import GameDrawer from "./GameDrawer";
import OtherGameCard from "./OtherGameCard";
import PartyPicker from "./PartyPicker";
import OtherGameDrawer from "./OtherGameDrawer";

type Turn = { role: "user" | "assistant"; text: string };

const CONSTRAINT_FIXES: Record<Constraint, { label: string; apply: (f: Filters) => Filters }> = {
  mode: { label: "Remove the player count and play mode", apply: (f) => ({ ...f, groupSize: null, modes: [] }) },
  exclude: { label: "Remove your exclusions", apply: (f) => ({ ...f, exclude: [] }) },
  pricing: { label: "Show free and paid games", apply: (f) => ({ ...f, pricing: "any" }) },
  budget: { label: "Remove the budget", apply: (f) => ({ ...f, maxPrice: null }) },
  store: { label: "Allow any store", apply: (f) => ({ ...f, store: null }) },
};

const isKnown = (id: string) => getGame(id) !== undefined;

type ExplorerProps = {
  initialFilters: Filters;
  sharedList: string[];
  aiAvailable: boolean;
  allGames: boolean;
  // What's being played right now, from the server; null if it couldn't be read.
  popularity: Popularity | null;
};

export default function Explorer({ initialFilters, sharedList, aiAvailable, allGames, popularity }: ExplorerProps) {
  const rank = popularity?.rank;
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [offers, setOffers] = useState<OfferMap>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [otherGame, setOtherGame] = useState<OtherGame | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>(aiAvailable ? "ai" : "keyword");
  // Games the AI recommended for the last request, already checked to exist by the server.
  const [picks, setPicks] = useState<{ request: string; items: Pick[] } | null>(null);
  // Prices for the AI's picks outside the catalogue, by OtherGame.key.
  const [otherOffers, setOtherOffers] = useState<Record<string, OfferState>>({});
  const [assist, setAssist] = useState<AssistStatus>({ pending: false });
  const [history, setHistory] = useState<Turn[]>([]);
  const [copied, setCopied] = useState(false);
  const shortlist = useShortlist(isKnown);
  const sheet = useRef<HTMLDialogElement>(null);

  // Keep the URL in step with the filters, so any search can be shared as a link.
  // A shared shortlist stays in the link too, so refreshing doesn't lose it.
  const sharedKey = sharedList.join(",");
  useEffect(() => {
    const params = filtersToParams(filters);
    if (sharedKey) params.set("list", sharedKey);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [filters, sharedKey]);

  // Games whose prices matter: anything that could appear if the price filters were ignored,
  // plus saved and shared games. Free-to-play games need no lookup.
  const candidates = useMemo(() => {
    const loose = search(games, { ...filters, maxPrice: null, store: null }, {});
    const ids = new Set([...loose.matches, ...loose.unverified].map((r) => r.game.id));
    for (const id of [...shortlist.ids, ...sharedList]) ids.add(id);
    for (const pick of picks?.items ?? []) if (pick.kind === "catalogue") ids.add(pick.id);
    return [...ids].map(getGame).filter((g): g is Game => !!g && g.monetization !== "free-to-play");
  }, [filters, shortlist.ids, sharedList, picks]);
  const missingKey = candidates.filter((g) => offers[g.id] === undefined).map((g) => g.id).join(",");

  // Fetch missing offers in batches of 25, using the 10-minute cache first.
  useEffect(() => {
    if (!missingKey) return;
    const controller = new AbortController();
    const missing = missingKey.split(",").map(getGame).filter((g): g is Game => !!g);
    (async () => {
      const cached = cachedOffers(missing.map((g) => g.id));
      const toFetch = missing.filter((g) => !cached[g.id]);
      const batch = toFetch.slice(0, BATCH_SIZE);
      let states: Record<string, OfferState> = { ...cached };
      if (batch.length > 0) {
        try {
          const fetched = await fetchOffers(batch, controller.signal);
          saveOffers(fetched);
          states = { ...states, ...fetched };
        } catch (error) {
          if (controller.signal.aborted) return;
          const reason =
            error instanceof RateLimitedError
              ? `price checks are paused for ${error.retryAfterSeconds}s`
              : "the price service didn't respond";
          for (const game of batch) states[game.id] = { status: "unavailable", reason };
        }
      }
      if (!controller.signal.aborted) setOffers((previous) => ({ ...previous, ...states }));
    })();
    return () => controller.abort();
  }, [missingKey]);

  // Prices for picks outside the catalogue, once per new set of picks.
  const otherPickKey = (picks?.items ?? []).flatMap((p) => (p.kind === "other" ? [p.game.key] : [])).join(",");
  useEffect(() => {
    const others = (picks?.items ?? []).flatMap((p) => (p.kind === "other" ? [p.game] : []));
    if (others.length === 0) return;
    const controller = new AbortController();
    fetchOtherOffers(others, controller.signal)
      .then((states) => setOtherOffers((previous) => ({ ...previous, ...states })))
      .catch(() => {
        if (controller.signal.aborted) return;
        const failed: OfferState = { status: "unavailable", reason: "the price service didn't respond" };
        setOtherOffers((previous) => ({ ...previous, ...Object.fromEntries(others.map((g) => [g.key, failed])) }));
      });
    return () => controller.abort();
    // otherPickKey changes exactly when the set of picks does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherPickKey]);

  const outcome = useMemo(() => search(games, filters, offers, rank), [filters, offers, rank]);
  const checking = candidates.filter((g) => offers[g.id] === undefined).length;
  const unavailable = candidates.filter((g) => offers[g.id]?.status === "unavailable").length;

  const retryPrices = () =>
    setOffers((previous) => Object.fromEntries(Object.entries(previous).filter(([, s]) => s?.status !== "unavailable")));

  const ask = useCallback(
    async (message: string) => {
      setAssist({ pending: true });
      try {
        const response = await fetch("/api/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, filters, history: history.slice(-6), mode: searchMode, answering: Boolean(assist.clarification) }),
        });
        const data = await response.json().catch(() => null);
        const next = filtersSchema.safeParse(data?.filters);
        if (!response.ok || !next.success) {
          setAssist({ pending: false, error: (data?.error as string) ?? "Search didn't work this time. Your filters still do." });
          return;
        }
        setFilters(next.data);
        const reply = (data.clarification ?? data.summary ?? "") as string;
        const turns: Turn[] = [{ role: "user", text: message }, ...(reply ? [{ role: "assistant" as const, text: reply.slice(0, 300) }] : [])];
        // A new request starts a new conversation; a follow-up continues the last one.
        setHistory((h) => (data.scope === "refine" ? [...h, ...turns] : turns).slice(-6));
        if (!data.clarification) {
          const items = Array.isArray(data.picks) ? (data.picks as Pick[]) : [];
          setPicks(items.length ? { request: message, items } : null);
        }
        setAssist({
          pending: false,
          mode: data.mode,
          summary: data.summary,
          notice: data.notice,
          clarification: data.clarification,
          unknownTitle: data.unknownTitle,
          scope: data.scope,
        });
      } catch {
        setAssist({ pending: false, error: "Couldn't reach search. Your filters still work." });
      }
    },
    [filters, history, searchMode, assist.clarification],
  );

  // A game picked from the suggestions: show it, and rank the rest by how similar they are.
  const pickGame = (id: string) => {
    setFilters({ ...filters, like: id });
    setOpenId(id);
  };

  async function copyShortlist() {
    const url = `${window.location.origin}/?list=${shortlist.ids.join(",")}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  const openGame = openId ? getGame(openId) ?? null : null;

  // One game on its own (a named game, an AI pick, a saved game), as a card-ready result.
  // A game that doesn't fit the filters still gets a card, with no match reasons.
  const resultFor = (game: Game, against: Filters = defaultFilters): Result => {
    const one = search([game], { ...against, like: null }, offers);
    return one.matches[0] ?? one.unverified[0] ?? one.priceUnconfirmed[0] ?? { game, score: 0, modes: [], price: { kind: "unknown" }, reasons: [] };
  };

  // The game the user named: shown on its own, with whether it fits the current filters.
  const likeGame = filters.like ? getGame(filters.like) ?? null : null;
  const likeOutcome = likeGame ? search([likeGame], { ...filters, like: null }, offers) : null;
  const likeFit = likeOutcome?.matches.length
    ? "fits"
    : likeOutcome?.unverified.length || likeOutcome?.priceUnconfirmed.length
      ? "unverified"
      : "no";
  const groupLabel = filters.groupSize === null ? " to explore" : filters.groupSize === 1 ? " for one" : ` for ${filters.groupSize} players`;
  const card = (result: Result, index = 99, note?: string | null) => (
    <GameCard
      key={result.game.id}
      result={result}
      eager={index < 3}
      offerState={offers[result.game.id]}
      saved={shortlist.ids.includes(result.game.id)}
      onOpen={() => setOpenId(result.game.id)}
      onToggleSave={() => shortlist.toggle(result.game.id)}
      note={note}
      playingNow={popularity?.playingNow[result.game.id]}
    />
  );
  const grid = (results: Result[]) => <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{results.map((r, i) => card(r, i))}</div>;
  // Picks from our catalogue are checked against the group and play mode with verified data;
  // one that can't fit (e.g. a 2-player game for 4 of you) is left out. Price filters don't
  // apply here, so a pick isn't hidden just because its price hasn't loaded yet.
  const pickFits = (pick: Pick) => {
    if (pick.kind === "other") {
      // Games outside the catalogue only have IGDB's numbers: hide one only when those clearly
      // rule it out (single-player only, or every listed group is smaller than yours).
      const size = filters.groupSize ?? 1;
      if (size <= 1) return true;
      const { play = [], singleplayer = false } = pick.game;
      if (play.length === 0) return !singleplayer;
      return play.some((line) => line.together === null || line.together >= size);
    }
    const game = getGame(pick.id);
    if (!game) return false;
    const fit = search([game], { ...filters, like: null, maxPrice: null, store: null, pricing: "any" }, offers);
    return fit.matches.length + fit.unverified.length + fit.priceUnconfirmed.length > 0;
  };
  const shownPicks = picks ? picks.items.filter(pickFits) : [];

  // Playing alone: group sizes don't matter, so games outside the catalogue need no warning.
  const solo = filters.groupSize === 1 || (filters.modes.length > 0 && filters.modes.every((m) => m === "solo"));

  // An AI pick as a card: ours with verified group sizes, or another game with its store links.
  const pickCard = (pick: Pick, index: number) => {
    if (pick.kind === "other") {
      return <OtherGameCard key={pick.game.key} game={pick.game} note={pick.why} offerState={otherOffers[pick.game.key]} onOpen={() => setOtherGame(pick.game)} />;
    }
    const game = getGame(pick.id);
    return game ? card(resultFor(game), index, pick.why) : null;
  };
  const savedResults = (ids: string[]) => ids.map(getGame).filter((g): g is Game => !!g).map((game) => resultFor(game));

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between gap-4 py-5">
        <Link href="/" className="font-display text-xl font-bold tracking-tight">
          {site.name}
          <span className="text-accent">?</span>
        </Link>
        <a href="#shortlist" className="rounded-full border border-line px-3.5 py-1.5 text-sm hover:border-muted/60">
          Shortlist <span className="text-accent tabular-nums">{shortlist.ids.length}</span>
        </a>
      </header>

      <div className="pt-6 pb-2 sm:pt-10">
        <h1 className="font-display text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
          What are we playing <span className="text-accent">tonight?</span>
        </h1>
        <p className="mt-2 max-w-xl text-muted">Find a PC game that fits your whole group, then compare prices across stores.</p>
      </div>
      <div className="mt-6 space-y-5">
        <AssistBar
          status={assist}
          onAsk={ask}
          mode={searchMode}
          aiAvailable={aiAvailable}
          onModeChange={setSearchMode}
          onPickGame={pickGame}
          onPickOtherGame={setOtherGame}
          allGames={allGames}
        />
        <PartyPicker value={filters.groupSize} onChange={(groupSize) => setFilters({ ...filters, groupSize })} />
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto pr-2">
            <h2 className="mb-5 font-display text-lg font-semibold">Refine</h2>
            <FilterPanel filters={filters} onChange={setFilters} />
          </div>
        </aside>

        <main className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ActiveFilters filters={filters} onChange={setFilters} />
            <button
              type="button"
              onClick={() => sheet.current?.showModal()}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium lg:hidden"
            >
              Refine
            </button>
          </div>

          {picks && shownPicks.length > 0 && (
            <section aria-labelledby="picks-heading" className="mt-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="picks-heading" className="flex items-center gap-2 font-display text-2xl font-semibold">
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 text-accent">
                      <path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6z" fill="currentColor" />
                    </svg>
                    AI picks
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    For &ldquo;{picks.request}&rdquo;. Suggestions, not verified facts: group sizes and prices on each card come from our data.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPicks(null)}
                  className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
                >
                  Hide picks
                </button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{shownPicks.map(pickCard)}</div>
            </section>
          )}

          <div className={`flex flex-wrap items-end justify-between gap-3 ${picks && shownPicks.length > 0 ? "mt-12 border-t border-line pt-8" : "mt-6"}`}>
            <h2 aria-live="polite" className="font-display text-2xl font-semibold">
              {picks && shownPicks.length > 0 && <span className="text-muted">From our checked list: </span>}
              {outcome.matches.length} {outcome.matches.length === 1 ? "game" : "games"}
              <span className="text-muted">{groupLabel}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {outcome.matches.length > 1 && (
                <button
                  type="button"
                  onClick={() => setOpenId(outcome.matches[Math.floor(Math.random() * outcome.matches.length)].game.id)}
                  className="rounded-full border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:border-muted"
                >
                  Can&apos;t decide? Pick one for us
                </button>
              )}
              <label htmlFor="sort" className="sr-only">
                Sort by
              </label>
              <select
                id="sort"
                value={filters.sort}
                onChange={(event) => setFilters({ ...filters, sort: event.target.value as Sort })}
                className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm"
              >
                <option value="best">Best match</option>
                <option value="price">Lowest price</option>
                <option value="discount">Biggest discount</option>
              </select>
            </div>
          </div>

          <p className="mt-1 text-sm text-muted">
            {rank && filters.sort === "best" && "Most played right now first · "}
            Prices in USD, checked live
            {checking > 0 && ` · checking prices for ${checking} games…`}
            {unavailable > 0 && (
              <>
                {` · prices unavailable for ${unavailable} games `}
                <button type="button" onClick={retryPrices} className="underline underline-offset-4 hover:text-foreground">
                  Retry
                </button>
              </>
            )}
          </p>

          {likeGame && (
            <section
              aria-labelledby="searched-heading"
              className="mt-6 grid gap-4 rounded-2xl bg-surface p-4 sm:grid-cols-[minmax(0,300px)_1fr] sm:items-center"
            >
              {card(resultFor(likeGame, filters))}
              <div>
                <h2 id="searched-heading" className="text-xs font-semibold tracking-wider text-muted uppercase">
                  You searched for
                </h2>
                <p className="mt-1 font-display text-2xl font-semibold">{likeGame.title}</p>
                <p className="mt-2 text-sm">
                  {likeFit === "fits"
                    ? "It fits your filters."
                    : likeFit === "unverified"
                      ? "It might fit, but we couldn't confirm it for your group."
                      : "It doesn't fit your current filters."}{" "}
                  <span className="text-muted">The games below are ranked by how similar they are.</span>
                </p>
                <button
                  type="button"
                  onClick={() => setFilters({ ...filters, like: null })}
                  className="mt-3 text-sm text-muted underline underline-offset-4 hover:text-foreground"
                >
                  Clear this search
                </button>
              </div>
            </section>
          )}

          {sharedList.length > 0 && (
            <section aria-labelledby="shared-heading" className="mt-6 rounded-2xl bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="shared-heading" className="font-display text-lg font-semibold">A friend shared this shortlist</h2>
                <button type="button" onClick={() => shortlist.replace([...new Set([...shortlist.ids, ...sharedList])])} className="rounded-full border border-line px-3.5 py-1.5 text-sm hover:border-accent">
                  Save to my shortlist
                </button>
              </div>
              <div className="mt-4">{grid(savedResults(sharedList))}</div>
            </section>
          )}

          <section aria-label="Matching games" className="mt-6">
            {outcome.matches.length > 0 ? (
              grid(outcome.matches)
            ) : checking > 0 && outcome.priceUnconfirmed.length > 0 ? (
              // Prices are still loading: don't claim nothing fits before they arrive.
              <div role="status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-72 rounded-2xl border border-line bg-surface motion-safe:animate-pulse" />
                ))}
                <span className="sr-only">Checking prices…</span>
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-surface p-6">
                <h2 className="font-display text-xl font-semibold">No game fits all of these filters.</h2>
                {outcome.blocking.length > 0 ? (
                  <>
                    <p className="mt-1 text-muted">This is what&apos;s limiting the results. Nothing changes unless you choose it:</p>
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {outcome.blocking.map(({ constraint, wouldShow }) => (
                        <li key={constraint}>
                          <button type="button" onClick={() => setFilters(CONSTRAINT_FIXES[constraint].apply(filters))} className="rounded-full border border-line px-3.5 py-2 text-sm hover:border-accent">
                            {CONSTRAINT_FIXES[constraint].label} <span className="text-muted">({wouldShow} {wouldShow === 1 ? "game" : "games"})</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-1 text-muted">Try fewer filters. We only list games whose group size we could check, {games.length} so far.</p>
                )}
              </div>
            )}
          </section>

          {outcome.priceUnconfirmed.length > 0 && (
            <details className="group mt-10">
              <summary className="font-display text-lg font-semibold">
                Price not confirmed <span className="text-muted">({outcome.priceUnconfirmed.length})</span>
              </summary>
              <p className="mt-1 mb-4 text-sm text-muted">These fit everything else, but no current offer within your budget or store was found yet.</p>
              {grid(outcome.priceUnconfirmed)}
            </details>
          )}

          {outcome.unverified.length > 0 && (
            <details className="group mt-10">
              <summary className="font-display text-lg font-semibold">
                Compatibility unverified <span className="text-muted">({outcome.unverified.length})</span>
              </summary>
              <p className="mt-1 mb-4 text-sm text-muted">
                These might work for your group, but we couldn&apos;t confirm the player count for the way you want to play.
              </p>
              {grid(outcome.unverified)}
            </details>
          )}

          <section id="shortlist" aria-labelledby="shortlist-heading" className="mt-14 scroll-mt-6 border-t border-line pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="shortlist-heading" className="font-display text-xl font-semibold">Your shortlist</h2>
              {shortlist.ids.length > 0 && (
                <button type="button" onClick={copyShortlist} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110">
                  {copied ? "Link copied" : "Copy share link"}
                </button>
              )}
            </div>
            {shortlist.ids.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Save games with the bookmark button to compare them or send them to your friends.</p>
            ) : (
              <div className="mt-4">{grid(savedResults(shortlist.ids))}</div>
            )}
          </section>
        </main>
      </div>

      <footer className="mt-16 border-t border-line pt-6 text-xs leading-relaxed text-muted">
        <p>
          Prices from{" "}
          <a href="https://www.cheapshark.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">CheapShark</a>, in US dollars,
          checked live and not converted to local currency. Multiplayer details from{" "}
          <a href="https://www.pcgamingwiki.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">PCGamingWiki</a>{" "}
          (<a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">CC BY-NC-SA 3.0</a>), catalogue checked {catalogueDate}. Descriptions, name search and some artwork from{" "}
          <a href="https://www.igdb.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">IGDB</a>. Game artwork © its
          publishers, via Steam and IGDB. {site.name} recommends games and links to stores; it doesn&apos;t sell anything.
        </p>
      </footer>

      <dialog ref={sheet} aria-label="Filters" className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-6 text-foreground lg:hidden">
        <FilterPanel filters={filters} onChange={setFilters} />
        <button type="button" onClick={() => sheet.current?.close()} className="sticky bottom-0 mt-8 w-full rounded-xl bg-accent py-3 font-semibold text-accent-foreground">
          Show {outcome.matches.length} {outcome.matches.length === 1 ? "game" : "games"}
        </button>
      </dialog>

      <GameDrawer game={openGame} offerState={openGame ? offers[openGame.id] : undefined} store={filters.store} onClose={() => setOpenId(null)} onRetryPrices={retryPrices} />
      <OtherGameDrawer game={otherGame} solo={solo} onClose={() => setOtherGame(null)} />
    </div>
  );
}
