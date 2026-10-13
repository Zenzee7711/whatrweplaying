import { site } from "@/config/site";
import { createLimiter } from "@/lib/server/rate-limit";

// GET /api/cheapshark/games: the browser's price lookups go through here instead of straight to
// CheapShark. CheapShark blocks requests without a descriptive User-Agent (which a browser can't
// set) and browsers that send many requests, so the server asks on everyone's behalf, with our
// User-Agent, and caches each answer so all visitors share it.
// Only the four lookups the app makes are allowed, each with checked values.

const UPSTREAM = "https://www.cheapshark.com/api/1.0/games";
const limiter = createLimiter({ perWindow: 120, windowMs: 60_000, perDay: 20_000 });

// Seconds each kind of answer is reused: prices change often, IDs and names hardly ever.
function allowed(params: URLSearchParams): { query: string; cacheFor: number } | null {
  const keys = [...params.keys()];
  const only = (...names: string[]) => keys.every((k) => names.includes(k));
  const ids = params.get("ids");
  if (ids && only("ids") && /^\d{1,7}(,\d{1,7}){0,24}$/.test(ids)) return { query: `ids=${ids}`, cacheFor: 600 };
  const id = params.get("id");
  if (id && only("id") && /^\d{1,7}$/.test(id)) return { query: `id=${id}`, cacheFor: 600 };
  const steam = params.get("steamAppID");
  if (steam && only("steamAppID") && /^\d{1,9}$/.test(steam)) return { query: `steamAppID=${steam}`, cacheFor: 86_400 };
  const title = params.get("title")?.trim();
  if (title && only("title", "limit") && title.length >= 2 && title.length <= 60 && (params.get("limit") ?? "20") === "20") {
    return { query: `title=${encodeURIComponent(title)}&limit=20`, cacheFor: 3_600 };
  }
  return null;
}

const json = (data: unknown, status: number, headers: HeadersInit = {}) => Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function GET(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return json({ error: "Forbidden" }, 403);

  const lookup = allowed(new URL(request.url).searchParams);
  if (!lookup) return json({ error: "Unsupported lookup." }, 400);

  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = limiter.check(visitor);
  if (!limit.allowed) return json({ error: "Too many price checks." }, 429, { "Retry-After": String(limit.retryAfterSeconds) });

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}?${lookup.query}`, {
      headers: { "User-Agent": site.userAgent },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: lookup.cacheFor },
    });
  } catch {
    return json({ error: "The price service didn't respond." }, 502);
  }
  if (upstream.status === 429) {
    return json({ error: "The price service is busy." }, 429, { "Retry-After": upstream.headers.get("retry-after") ?? "60" });
  }
  if (!upstream.ok) return json({ error: "The price service returned an error." }, 502);
  return new Response(await upstream.text(), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": `private, max-age=${Math.min(lookup.cacheFor, 600)}` },
  });
}
