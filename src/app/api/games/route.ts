import { z } from "zod";
import { igdbConfig } from "@/lib/server/env";
import { IgdbUnavailableError, searchIgdb } from "@/lib/server/igdb";
import { createLimiter } from "@/lib/server/rate-limit";

// GET /api/games?q=name: PC games by name from IGDB, for the search suggestions.
// Returns titles, art and store links only; no player counts.

const limiter = createLimiter({ perWindow: 40, windowMs: 60_000, perDay: 5_000 });
const querySchema = z.string().trim().min(2).max(60);

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function GET(request: Request) {
  // Browsers mark cross-site requests; only this site's own pages may call the endpoint.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return json({ error: "Forbidden" }, 403);

  if (!igdbConfig()) return json({ error: "Game search isn't set up on this server." }, 503);

  const query = querySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!query.success) return json({ error: "Type 2 to 60 characters." }, 400);

  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = limiter.check(visitor);
  if (!limit.allowed) return json({ error: "Too many searches. Try again shortly." }, 429, { "Retry-After": String(limit.retryAfterSeconds) });

  try {
    const games = await searchIgdb(query.data);
    return json({ games }, 200, { "Cache-Control": "private, max-age=600" });
  } catch (error) {
    if (!(error instanceof IgdbUnavailableError) && !(error instanceof z.ZodError)) console.error("IGDB search failed", error);
    return json({ error: "Game search is unavailable right now." }, 502);
  }
}
