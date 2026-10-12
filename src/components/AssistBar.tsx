import { useState } from "react";

export type AssistStatus = {
  pending: boolean;
  mode?: "ai" | "basic";
  summary?: string | null;
  notice?: string | null;
  clarification?: string | null;
  error?: string | null;
};

const EXAMPLES = [
  "Four of us, online co-op, horror, under $15 each",
  "Something relaxed for two on one PC",
  "Free games for a big group",
];

// Natural-language search. It only changes the filters below; results always come from
// the same search as the manual filters. Replies are shown as plain text.
export default function AssistBar({ status, onAsk }: { status: AssistStatus; onAsk: (message: string) => void }) {
  const [text, setText] = useState("");

  function submit(message: string) {
    const trimmed = message.trim().slice(0, 300);
    if (!trimmed || status.pending) return;
    onAsk(trimmed);
    setText("");
  }

  return (
    <section aria-labelledby="assist-label">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(text);
        }}
        className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 focus-within:border-accent/70"
      >
        <label id="assist-label" htmlFor="assist-input" className="sr-only">
          Describe what your group wants to play
        </label>
        <input
          id="assist-input"
          value={text}
          maxLength={300}
          onChange={(event) => setText(event.target.value)}
          placeholder="There are four of us on PC. We want online co-op, preferably horror, under $15 each."
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base placeholder:text-muted/70 focus:outline-none"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={status.pending || !text.trim()}
          className="shrink-0 rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {status.pending ? "Thinking…" : "Search"}
        </button>
      </form>

      <div aria-live="polite" className="mt-2 min-h-6 text-sm">
        {status.error ? (
          <p className="text-danger">{status.error}</p>
        ) : status.clarification ? (
          <p>
            <span className="font-medium">Quick question:</span> {status.clarification}
          </p>
        ) : status.summary || status.notice ? (
          <p className="text-muted">
            {status.summary && <span className="text-foreground">{status.summary} </span>}
            {status.notice}
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
            Try:
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => submit(example)}
                className="rounded-full border border-line px-2.5 py-0.5 hover:border-muted/60 hover:text-foreground"
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
