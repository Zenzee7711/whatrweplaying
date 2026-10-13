import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { games } from "@/lib/catalogue";
import type { Game } from "@/lib/catalogue/schema";
import type { OtherGame } from "@/lib/igdb/map";
import { searchStoreGames } from "@/lib/offers/cheapshark";
import { findTitles } from "@/lib/search/titles";
import { money, playLines } from "./labels";

export type AssistStatus = {
  pending: boolean;
  mode?: "ai" | "basic";
  summary?: string | null;
  notice?: string | null;
  clarification?: string | null;
  unknownTitle?: string | null;
  error?: string | null;
  // Whether the last search started fresh or adjusted the one before.
  scope?: "new" | "refine";
};

export type SearchMode = "ai" | "keyword";

// Rotating examples show what the box understands: a group, a mood, a game name.
const PLACEHOLDERS = [
  "Four of us, online co-op, preferably horror, under $15 each",
  "Monster Hunter",
  "Something relaxed for two on one PC",
  "Games like Valheim",
  "Free games for a big group",
  "A solo game with a great story",
];
const QUICK = ["Four of us, online co-op, under $15 each", "A solo game with a great story", "Games like Lethal Company"];

type Option = { kind: "catalogue"; game: Game } | { kind: "other"; game: OtherGame };

// Any PC game by name: IGDB through our own server when it's set up, otherwise (or if it fails)
// CheapShark's store data straight from the browser.
async function searchOtherGames(query: string, useIgdb: boolean, signal: AbortSignal): Promise<OtherGame[]> {
  if (useIgdb) {
    const response = await fetch(`/api/games?q=${encodeURIComponent(query)}`, { signal });
    const data = response.ok ? await response.json().catch(() => null) : null;
    if (Array.isArray(data?.games)) return data.games as OtherGame[];
  }
  return searchStoreGames(query, signal);
}

// Results for games we already list are dropped, matched by Steam ID or, for games that
// aren't on Steam, by name.
const normalise = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, "");
const knownSteamIds = new Set(games.map((g) => g.steamAppId).filter((id) => id !== null));
const knownTitles = new Set(games.map((g) => normalise(g.title)));
const isKnown = (g: OtherGame) => (g.steamAppId !== null && knownSteamIds.has(g.steamAppId)) || knownTitles.has(normalise(g.title));

function otherGameDetail(game: OtherGame): string {
  const stores = game.links.filter((l) => l.name !== "Official site").map((l) => l.name);
  return [game.year, game.cheapest !== null ? `From ${money(game.cheapest)}` : stores.join(", ") || null]
    .filter(Boolean)
    .join(" · ");
}

function Sparkle({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className}>
      <path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6zM15.5 13l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" />
    </svg>
  );
}

type AssistBarProps = {
  status: AssistStatus;
  onAsk: (message: string) => void;
  mode: SearchMode;
  aiAvailable: boolean;
  onModeChange: (mode: SearchMode) => void;
  onPickGame: (id: string) => void;
  onPickOtherGame: (game: OtherGame) => void;
  // Whether name search covers every PC game (IGDB) or only CheapShark's store data.
  allGames: boolean;
};

// The search box: plain words, a mood or a game name. Suggestions appear as you type, from our
// catalogue (verified group sizes) and from every other PC game (group size not checked).
export default function AssistBar({ status, onAsk, mode, aiAvailable, onModeChange, onPickGame, onPickOtherGame, allGames }: AssistBarProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [others, setOthers] = useState<{ query: string; games: OtherGame[] }>({ query: "", games: [] });
  const wrapper = useRef<HTMLDivElement>(null);

  // Rotate the placeholder every few seconds while the box is empty.
  useEffect(() => {
    if (text) return;
    const timer = setInterval(() => setTick((t) => t + 1), 3500);
    return () => clearInterval(timer);
  }, [text]);

  const query = text.trim();
  // Long sentences are requests, not names: only look names up when the text is short.
  const looksLikeName = query.length >= 3 && query.split(/\s+/).length <= 4;

  // Other games: after a short pause in typing, one request, cancelled if the text changes.
  useEffect(() => {
    if (!looksLikeName) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchOtherGames(query, allGames, controller.signal)
        .then((found) => setOthers({ query, games: found }))
        .catch(() => {
          // Suggestions are optional: if the search is unavailable, the catalogue still answers.
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, looksLikeName, allGames]);

  const catalogueMatches = query.length >= 2 ? findTitles(query, games, 0.6).slice(0, 5).map((m) => m.item) : [];
  // The search services' own ordering is loose, so rank results with the same title matcher.
  const otherMatches =
    looksLikeName && others.query === query
      ? findTitles(query, others.games.filter((g) => !isKnown(g)).sort((a, b) => b.popularity - a.popularity), 0.6)
          .slice(0, 5)
          .map((m) => m.item)
      : [];
  const options: Option[] = [
    ...catalogueMatches.map((game) => ({ kind: "catalogue" as const, game })),
    ...otherMatches.map((game) => ({ kind: "other" as const, game })),
  ];
  const showList = open && query.length >= 2 && options.length > 0;
  const optionId = (i: number) => `${id}-option-${i}`;

  function pick(option: Option) {
    setOpen(false);
    setActive(-1);
    setText("");
    if (option.kind === "catalogue") onPickGame(option.game.id);
    else onPickOtherGame(option.game);
  }

  function submit(message: string) {
    const trimmed = message.trim().slice(0, 300);
    if (!trimmed || status.pending) return;
    setOpen(false);
    onAsk(trimmed);
    setText("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) return;
    if (event.key === "ArrowDown") setActive((i) => (i + 1) % options.length);
    else if (event.key === "ArrowUp") setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    else if (event.key === "Escape") setOpen(false);
    else if (event.key === "Enter" && active >= 0) pick(options[active]);
    else return;
    event.preventDefault();
  }

  const answered = status.summary || status.unknownTitle || status.clarification || status.error || status.mode;

  return (
    <section aria-labelledby={`${id}-label`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label id={`${id}-label`} htmlFor={`${id}-input`} className="text-sm text-muted">
          Describe your group, or type a game
        </label>
        <div role="radiogroup" aria-label="Search mode" className="flex rounded-full border border-line p-0.5 text-xs">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "ai"}
            disabled={!aiAvailable}
            title={aiAvailable ? "AI understands full sentences and follow-ups" : "AI search isn't set up on this server"}
            onClick={() => onModeChange("ai")}
            className={`flex items-center gap-1 rounded-full px-3 py-1 transition disabled:opacity-40 ${
              mode === "ai" ? "bg-accent font-semibold text-accent-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <Sparkle className="h-3.5 w-3.5" /> AI
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "keyword"}
            onClick={() => onModeChange("keyword")}
            className={`rounded-full px-3 py-1 transition ${
              mode === "keyword" ? "bg-line font-semibold text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Keywords
          </button>
        </div>
      </div>

      <div ref={wrapper} className="relative">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(text);
          }}
          className={`flex items-center gap-2 rounded-2xl border bg-surface p-2 transition focus-within:shadow-[0_0_0_4px_rgb(255_138_61/0.12)] ${
            mode === "ai" ? "border-accent/50 focus-within:border-accent" : "border-line focus-within:border-muted"
          }`}
        >
          <span className={`ml-2 shrink-0 ${mode === "ai" ? "text-accent" : "text-muted"}`}>
            {mode === "ai" ? (
              <Sparkle className="h-5 w-5" />
            ) : (
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5">
                <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M13.2 13.2L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </span>
          <input
            id={`${id}-input`}
            role="combobox"
            aria-expanded={showList}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
            value={text}
            maxLength={300}
            onChange={(event) => {
              setText(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={(event) => {
              if (!wrapper.current?.contains(event.relatedTarget as Node)) setOpen(false);
            }}
            onKeyDown={onKeyDown}
            placeholder={PLACEHOLDERS[tick % PLACEHOLDERS.length]}
            className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-base placeholder:text-muted focus:outline-none"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={status.pending || !text.trim()}
            className="shrink-0 rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {status.pending ? (mode === "ai" ? "Thinking…" : "Searching…") : "Search"}
          </button>
        </form>

        {showList && (
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label="Suggestions"
            className="absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-2xl motion-safe:animate-enter"
          >
            {options.map((option, i) => {
              const first = i === 0 || options[i - 1].kind !== option.kind;
              const line = option.kind === "catalogue" ? playLines(option.game)[0] : null;
              const image = option.game.image;
              return (
                <div key={option.kind === "catalogue" ? option.game.id : option.game.key}>
                  {first && (
                    <p role="presentation" className="px-2 pt-2 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">
                      {option.kind === "catalogue" ? "In our catalogue" : "Other PC games · group size not checked"}
                    </p>
                  )}
                  <div
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(option)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl p-2 ${i === active ? "bg-raised" : ""}`}
                  >
                    <span className="relative grid h-11 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-raised font-display font-bold text-muted">
                      {image ? (
                        <Image src={image} alt="" fill sizes="96px" className="object-cover" />
                      ) : (
                        option.game.title.charAt(0)
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{option.game.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {option.kind === "catalogue"
                          ? line
                            ? `${line.together ? `${line.together} together` : "Group size unverified"} · ${line.label}`
                            : "Solo"
                          : otherGameDetail(option.game)}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
            <p className="px-2 pt-2 pb-1 text-xs text-muted">Press Enter to search for &ldquo;{query}&rdquo;</p>
          </div>
        )}
      </div>

      <div aria-live="polite" className="mt-2 min-h-6 text-sm">
        {status.error ? (
          <p className="text-danger">{status.error}</p>
        ) : answered ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
            {status.mode === "ai" ? (
              <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                <Sparkle className="h-3 w-3" /> AI
              </span>
            ) : (
              <span title={status.notice ?? undefined} className="rounded-full border border-line px-2 py-0.5 text-xs">
                Keywords
              </span>
            )}
            {status.clarification && (
              <span>
                <span className="font-medium text-foreground">Quick question:</span> {status.clarification}
              </span>
            )}
            {status.unknownTitle && (
              <span>
                <span className="text-foreground">&ldquo;{status.unknownTitle}&rdquo;</span> isn&apos;t in our catalogue yet.
                Type its name to see prices, or we used the rest of your request.
              </span>
            )}
            {status.summary && (
              <span className="text-foreground">
                {status.scope === "refine" && <span className="text-muted">Updated your last search: </span>}
                {status.summary}
              </span>
            )}
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-muted">
            Try
            {QUICK.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => submit(example)}
                className="rounded-full border border-line px-2.5 py-0.5 transition hover:border-accent/60 hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </p>
        )}
      </div>
    </section>
  );
}
