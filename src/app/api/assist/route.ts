import { z } from "zod";
import { basicPatch } from "@/lib/ai/basic";
import { applyPatch, type Patch } from "@/lib/ai/patch";
import { games, genreVocabulary, tagVocabulary } from "@/lib/catalogue";
import { filtersSchema } from "@/lib/search/filters";
import { groqConfig } from "@/lib/server/env";
import { AiUnavailableError, groqPatch } from "@/lib/server/groq";
import { createLimiter } from "@/lib/server/rate-limit";

// POST /api/assist: turns a natural-language request into updated filters.
// The response only ever contains validated filters and short text; search and ranking run
// on the client with the same code as the manual filters.

const MAX_BODY_BYTES = 4_000;
const titles = games.map((g) => ({ id: g.id, title: g.title }));
const limiter = createLimiter({ perWindow: 8, windowMs: 60_000, perDay: 300 });

const bodySchema = z.strictObject({
  message: z.string().trim().min(1).max(300),
  filters: filtersSchema,
  history: z
    .array(z.strictObject({ role: z.enum(["user", "assistant"]), text: z.string().max(300) }))
    .max(6),
  // The user's choice in the AI / Keywords toggle.
  mode: z.enum(["ai", "keyword"]).default("ai"),
});

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function POST(request: Request) {
  // Only this site's own pages may call the endpoint.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return json({ error: "Forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "Send JSON." }, 415);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request too large." }, 413);
  let input: z.output<typeof bodySchema>;
  try {
    input = bodySchema.parse(JSON.parse(raw));
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = limiter.check(visitor);
  if (!limit.allowed) {
    return json(
      { error: "Too many requests. Your filters still work; try the AI again shortly." },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  let patch: Patch;
  let mode: "ai" | "basic" = "basic";
  let notice: string | null = null;
  const config = groqConfig();
  if (input.mode === "keyword") {
    patch = basicPatch(input.message, tagVocabulary, titles);
  } else if (!config) {
    patch = basicPatch(input.message, tagVocabulary, titles);
    notice = "AI search isn't set up, so a simple keyword reader was used.";
  } else {
    try {
      patch = await groqPatch({ ...config, ...input, tags: tagVocabulary, games: titles });
      mode = "ai";
      // Safety net: the keyword reader reliably spots "no X". Its exclusions are always kept,
      // so an AI reply that forgets one can't quietly undo "no horror".
      const keyword = basicPatch(input.message, tagVocabulary, titles);
      patch = {
        ...patch,
        addExcluded: [...new Set([...patch.addExcluded, ...keyword.addExcluded])].slice(0, 6),
        removePreferred: [...new Set([...patch.removePreferred, ...keyword.addExcluded])].slice(0, 6),
      };
    } catch (error) {
      patch = basicPatch(input.message, tagVocabulary, titles);
      const reason = error instanceof AiUnavailableError ? error.message : "The AI service failed.";
      notice = `${reason} A simple keyword reader was used instead.`;
    }
  }

  if (patch.action === "clarify" && patch.clarification) {
    return json({ filters: input.filters, mode, notice, summary: null, clarification: patch.clarification, unknownTitle: null });
  }
  const filters = applyPatch(input.filters, patch, genreVocabulary);
  return json({ filters, mode, notice, summary: patch.summary, clarification: null, unknownTitle: patch.unknownTitle });
}
