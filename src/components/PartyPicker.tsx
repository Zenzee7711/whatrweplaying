// "Who's playing?": a row of seats. Picking the 4th lights up four seats.
// It's the most important filter, so it sits right under the search box.
const SEATS = [1, 2, 3, 4, 5, 6, 7, 8];

function Person({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6">
      <circle cx="12" cy="8" r="3.6" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function PartyPicker({ value, onChange }: { value: number | null; onChange: (size: number | null) => void }) {
  return (
    <div role="radiogroup" aria-labelledby="party-label" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span id="party-label" className="font-display text-lg font-semibold">
        Who&apos;s playing?
      </span>
      <div className="flex items-center">
        {SEATS.map((seat) => {
          const filled = value !== null && seat <= value;
          return (
            <button
              key={seat}
              type="button"
              role="radio"
              aria-checked={value === seat}
              aria-label={seat === 1 ? "Just me" : `${seat} players`}
              onClick={() => onChange(value === seat ? null : seat)}
              className={`grid h-11 w-10 place-items-center rounded-lg transition duration-150 motion-safe:hover:-translate-y-0.5 ${
                filled ? "text-accent" : "text-muted/50 hover:text-foreground"
              }`}
              style={{ transitionDelay: filled ? `${seat * 25}ms` : "0ms" }}
            >
              <Person filled={filled} />
            </button>
          );
        })}
      </div>
      <span aria-live="polite" className="text-sm text-muted tabular-nums">
        {value === null ? "Tap a seat" : value === 1 ? "Just me" : `${value} players`}
        {value !== null && value > 8 && " (set in Refine)"}
      </span>
    </div>
  );
}
