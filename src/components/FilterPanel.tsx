import { useId } from "react";
import { games } from "@/lib/catalogue";
import { STORES } from "@/lib/offers/cheapshark";
import { defaultFilters, MODE_LABELS, MODES, type Filters, type Sort } from "@/lib/search/filters";

// The most common genres and themes in the catalogue, so the panel stays short.
function topTags(pick: "genres" | "themes", count: number): string[] {
  const tally = new Map<string, number>();
  for (const game of games) for (const tag of game[pick]) tally.set(tag.toLowerCase(), (tally.get(tag.toLowerCase()) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, count).map(([tag]) => tag);
}
const GENRES = topTags("genres", 12);
const THEMES = topTags("themes", 8);

const SORT_LABELS: Record<Sort, string> = { best: "Best match", price: "Lowest price", discount: "Biggest discount" };

type FilterPanelProps = { filters: Filters; onChange: (next: Filters) => void };

export default function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const id = useId();
  const set = (changes: Partial<Filters>) => onChange({ ...filters, ...changes });

  // One tap prefers a tag, a second tap excludes it, a third clears it.
  function cycleTag(tag: string, kind: "genres" | "themes") {
    const preferred = filters[kind].includes(tag);
    const excluded = filters.exclude.includes(tag);
    if (!preferred && !excluded) set({ [kind]: [...filters[kind], tag] });
    else if (preferred) set({ [kind]: filters[kind].filter((t) => t !== tag), exclude: [...filters.exclude, tag] });
    else set({ exclude: filters.exclude.filter((t) => t !== tag) });
  }

  function tagChips(tags: string[], kind: "genres" | "themes") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const state = filters[kind].includes(tag) ? "preferred" : filters.exclude.includes(tag) ? "excluded" : "neutral";
          return (
            <button
              key={tag}
              type="button"
              onClick={() => cycleTag(tag, kind)}
              aria-label={`${tag}: ${state === "neutral" ? "no preference" : state}. Activate to ${state === "neutral" ? "prefer" : state === "preferred" ? "exclude" : "clear"}.`}
              className={`rounded-full border px-3 py-1.5 text-sm capitalize transition ${
                state === "preferred"
                  ? "border-accent bg-accent/15 text-accent"
                  : state === "excluded"
                    ? "border-danger/60 text-danger line-through"
                    : "border-line text-muted hover:border-muted/60 hover:text-foreground"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    );
  }

  const heading = "text-xs font-semibold tracking-wider text-muted uppercase";

  return (
    <div className="space-y-7">
      <fieldset>
        <legend className={heading}>Players</legend>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            aria-label="Fewer players"
            disabled={filters.groupSize === null}
            onClick={() => set({ groupSize: filters.groupSize && filters.groupSize > 1 ? filters.groupSize - 1 : null })}
            className="grid h-10 w-10 place-items-center rounded-xl border border-line text-lg disabled:opacity-40"
          >
            −
          </button>
          <output aria-live="polite" className="min-w-16 text-center font-display text-xl font-semibold tabular-nums">
            {filters.groupSize ?? "Any"}
          </output>
          <button
            type="button"
            aria-label="More players"
            disabled={filters.groupSize === 16}
            onClick={() => set({ groupSize: Math.min((filters.groupSize ?? 0) + 1, 16) })}
            className="grid h-10 w-10 place-items-center rounded-xl border border-line text-lg disabled:opacity-40"
          >
            +
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className={heading}>How you&apos;ll play</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MODES.map((mode) => {
            const on = filters.modes.includes(mode);
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={on}
                onClick={() => set({ modes: on ? filters.modes.filter((m) => m !== mode) : [...filters.modes, mode] })}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  on ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:border-muted/60 hover:text-foreground"
                }`}
              >
                {MODE_LABELS[mode]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className={heading}>Price</legend>
        <div className="mt-2 grid grid-cols-3 rounded-xl border border-line p-1 text-sm">
          {(["any", "free", "paid"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filters.pricing === option}
              onClick={() => set({ pricing: option })}
              className={`rounded-lg py-1.5 capitalize ${filters.pricing === option ? "bg-raised font-medium" : "text-muted"}`}
            >
              {option === "free" ? "Free-to-play" : option}
            </button>
          ))}
        </div>
        <label htmlFor={`${id}-max`} className="mt-3 block text-sm text-muted">
          Max per person (USD)
        </label>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-muted">$</span>
          <input
            id={`${id}-max`}
            type="number"
            inputMode="decimal"
            min={0}
            max={500}
            step={1}
            placeholder="No limit"
            value={filters.maxPrice ?? ""}
            onChange={(event) => {
              const value = event.target.value === "" ? null : Number(event.target.value);
              set({ maxPrice: value !== null && Number.isFinite(value) && value >= 0 && value <= 500 ? value : null });
            }}
            className="w-full rounded-xl border border-line bg-background px-3 py-2"
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className={heading}>Same store for everyone</legend>
        <label htmlFor={`${id}-store`} className="sr-only">
          Store
        </label>
        <select
          id={`${id}-store`}
          value={filters.store ?? ""}
          onChange={(event) => set({ store: event.target.value || null })}
          className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2"
        >
          <option value="">Any store</option>
          {Object.entries(STORES).map(([storeId, name]) => (
            <option key={storeId} value={storeId}>
              {name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted">Copies from different stores can&apos;t always play together.</p>
      </fieldset>

      <fieldset>
        <legend className={heading}>Genres</legend>
        <p className="mt-1 mb-2 text-xs text-muted">Tap once to prefer, twice to exclude.</p>
        {tagChips(GENRES, "genres")}
      </fieldset>

      <fieldset>
        <legend className={heading}>Themes</legend>
        <div className="mt-2">{tagChips(THEMES, "themes")}</div>
      </fieldset>

      <fieldset>
        <legend className={heading}>Sort by</legend>
        <label htmlFor={`${id}-sort`} className="sr-only">
          Sort by
        </label>
        <select
          id={`${id}-sort`}
          value={filters.sort}
          onChange={(event) => set({ sort: event.target.value as Sort })}
          className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2"
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </fieldset>

      <button type="button" onClick={() => onChange(defaultFilters)} className="text-sm text-muted underline underline-offset-4 hover:text-foreground">
        Reset all filters
      </button>
    </div>
  );
}
