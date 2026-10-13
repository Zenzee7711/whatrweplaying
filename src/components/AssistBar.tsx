import { useEffect, useState } from "react";

export type AssistStatus = {
  pending: boolean;
  mode?: "ai" | "basic";
  summary?: string | null;
  notice?: string | null;
  clarification?: string | null;
  unknownTitle?: string | null;
  error?: string | null;
};

// Rotating examples show the three things the box understands: a group, a mood, a game name.
const PLACEHOLDERS = [
  "Four of us, online co-op, preferably horror, under $15 each",
  "Monster Hunter",
  "Something relaxed for two on one PC",
  "Games like Valheim",
  "Free games for a big group",
];

const QUICK = ["Four of us, online co-op, under $15 each", "Something relaxed for two", "Games like Lethal Company"];

// Natural-language search. It only changes the filters; results always come from the same
// search as the manual filters. Replies are shown as plain text, never as HTML.
export default function AssistBar({ status, onAsk }: { status: AssistStatus; onAsk: (message: string) => void }) {
  const [text, setText] = useState("");
  const [tick, setTick] = useState(0);

  // Rotate the placeholder every few seconds, but only while the box is empty.
  useEffect(() => {
    if (text) return;
    const timer = setInterval(() => setTick((t) => t + 1), 3500);
    return () => clearInterval(timer);
  }, [text]);

  function submit(message: string) {
    const trimmed = message.trim().slice(0, 300);
    if (!trimmed || status.pending) return;
    onAsk(trimmed);
    setText("");
  }

  const answered = status.summary || status.unknownTitle || status.clarification || status.error || status.mode;

  return (
    <section aria-labelledby="assist-label">
      <label id="assist-label" htmlFor="assist-input" className="mb-2 block text-sm text-muted">
        Describe your group, or type a game you like
      </label>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(text);
        }}
        className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-[0_0_0_1px_transparent] transition focus-within:border-accent/70 focus-within:shadow-[0_0_0_4px_rgb(255_138_61/0.12)]"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="ml-2 h-5 w-5 shrink-0 text-muted">
          <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M13.2 13.2L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          id="assist-input"
          value={text}
          maxLength={300}
          onChange={(event) => setText(event.target.value)}
          placeholder={PLACEHOLDERS[tick % PLACEHOLDERS.length]}
          className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-base placeholder:text-muted/60 focus:outline-none"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={status.pending || !text.trim()}
          className="shrink-0 rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {status.pending ? "Searching…" : "Search"}
        </button>
      </form>

      <div aria-live="polite" className="mt-2 min-h-6 text-sm">
        {status.error ? (
          <p className="text-danger">{status.error}</p>
        ) : answered ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
            {status.mode === "basic" && (
              <span title={status.notice ?? undefined} className="rounded-full border border-line px-2 py-0.5 text-xs">
                Keyword search
              </span>
            )}
            {status.clarification && (
              <span>
                <span className="font-medium text-foreground">Quick question:</span> {status.clarification}
              </span>
            )}
            {status.unknownTitle && (
              <span>
                <span className="text-foreground">&ldquo;{status.unknownTitle}&rdquo;</span> isn&apos;t in our catalogue yet, so
                we used the rest of your request.
              </span>
            )}
            {status.summary && <span className="text-foreground">{status.summary}</span>}
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
