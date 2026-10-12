import { STORES } from "@/lib/offers/cheapshark";
import { defaultFilters, MODE_LABELS, type Filters } from "@/lib/search/filters";

// The current filters as removable chips, always visible (also on phones, above the results).
export default function ActiveFilters({ filters, onChange }: { filters: Filters; onChange: (next: Filters) => void }) {
  const chips: { label: string; remove: Partial<Filters> }[] = [];
  if (filters.groupSize !== null) chips.push({ label: `${filters.groupSize} ${filters.groupSize === 1 ? "player" : "players"}`, remove: { groupSize: null } });
  for (const mode of filters.modes) chips.push({ label: MODE_LABELS[mode], remove: { modes: filters.modes.filter((m) => m !== mode) } });
  for (const tag of filters.genres) chips.push({ label: `Prefer ${tag}`, remove: { genres: filters.genres.filter((t) => t !== tag) } });
  for (const tag of filters.themes) chips.push({ label: `Prefer ${tag}`, remove: { themes: filters.themes.filter((t) => t !== tag) } });
  for (const tag of filters.exclude) chips.push({ label: `No ${tag}`, remove: { exclude: filters.exclude.filter((t) => t !== tag) } });
  if (filters.pricing !== "any") chips.push({ label: filters.pricing === "free" ? "Free-to-play" : "Paid games", remove: { pricing: "any" } });
  if (filters.maxPrice !== null) chips.push({ label: `Up to $${filters.maxPrice} each`, remove: { maxPrice: null } });
  if (filters.store !== null) chips.push({ label: `${STORES[filters.store] ?? "One store"} only`, remove: { store: null } });

  if (chips.length === 0) return <p className="text-sm text-muted">No filters yet: showing the whole catalogue.</p>;

  return (
    <ul aria-label="Active filters" className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <li key={chip.label}>
          <button
            type="button"
            onClick={() => onChange({ ...filters, ...chip.remove })}
            aria-label={`Remove filter: ${chip.label}`}
            className="flex items-center gap-1.5 rounded-full bg-raised py-1.5 pr-2.5 pl-3 text-sm transition hover:bg-line"
          >
            {chip.label}
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 text-muted">
              <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </li>
      ))}
      <li>
        <button type="button" onClick={() => onChange({ ...defaultFilters, sort: filters.sort })} className="px-2 text-sm text-muted underline underline-offset-4 hover:text-foreground">
          Clear all
        </button>
      </li>
    </ul>
  );
}
