import { describe, expect, it } from "vitest";
import { createLimiter } from "./rate-limit.ts";

describe("createLimiter", () => {
  it("allows a few requests, then blocks with a retry time", () => {
    const limiter = createLimiter({ perWindow: 2, windowMs: 60_000, perDay: 100 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 1).allowed).toBe(true);
    const blocked = limiter.check("a", 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("counts each visitor separately", () => {
    const limiter = createLimiter({ perWindow: 1, windowMs: 60_000, perDay: 100 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
  });

  it("allows requests again once the window has passed", () => {
    const limiter = createLimiter({ perWindow: 1, windowMs: 60_000, perDay: 100 });
    limiter.check("a", 0);
    expect(limiter.check("a", 60_001).allowed).toBe(true);
  });

  it("stops everyone once the daily cap is used", () => {
    const limiter = createLimiter({ perWindow: 10, windowMs: 60_000, perDay: 2 });
    limiter.check("a", 0);
    limiter.check("b", 0);
    expect(limiter.check("c", 0).allowed).toBe(false);
  });
});
