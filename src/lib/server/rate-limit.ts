// A small in-memory rate limiter for the public AI endpoint: a sliding window per visitor,
// plus a daily cap for everyone together, to protect the free AI quota.
// Limitation: memory is per server instance, so on serverless hosting each instance keeps
// its own count. That is fine for a demo; a shared store (e.g. Redis) would be needed at scale.

export type Limiter = { check: (key: string, now?: number) => { allowed: boolean; retryAfterSeconds: number } };

export function createLimiter(options: { perWindow: number; windowMs: number; perDay: number }): Limiter {
  const hits = new Map<string, number[]>();
  let day = { start: 0, count: 0 };

  return {
    check(key, now = Date.now()) {
      if (now - day.start >= 86_400_000) day = { start: now, count: 0 };
      if (day.count >= options.perDay) {
        return { allowed: false, retryAfterSeconds: Math.ceil((day.start + 86_400_000 - now) / 1000) };
      }
      const recent = (hits.get(key) ?? []).filter((t) => now - t < options.windowMs);
      if (recent.length >= options.perWindow) {
        hits.set(key, recent);
        return { allowed: false, retryAfterSeconds: Math.ceil((recent[0] + options.windowMs - now) / 1000) };
      }
      recent.push(now);
      hits.set(key, recent);
      day.count++;
      // Forget idle visitors so the map can't grow without limit.
      if (hits.size > 5000) for (const [k, times] of hits) if (now - times[times.length - 1] > options.windowMs) hits.delete(k);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
