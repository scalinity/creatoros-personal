import { describe, expect, it } from "vitest";

import { MemoryRateLimitStore, createFixedWindowRateLimiter } from "@/lib/rate-limit";

describe("fixed-window rate limiter", () => {
  it("allows requests until the limit and then returns retry metadata", async () => {
    const store = new MemoryRateLimitStore();
    const limiter = createFixedWindowRateLimiter({ limit: 2, store, windowMs: 1_000 });

    await expect(limiter.check({ at: 1_000, id: "admin:data-export" })).resolves.toMatchObject({
      allowed: true,
      limit: 2,
      remaining: 1,
      resetAt: 2_000,
    });
    await expect(limiter.check({ at: 1_100, id: "admin:data-export" })).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(limiter.check({ at: 1_200, id: "admin:data-export" })).resolves.toMatchObject({
      allowed: false,
      retryAfterMs: 800,
    });
  });

  it("resets counts after the fixed window rolls over", async () => {
    const limiter = createFixedWindowRateLimiter({ limit: 1, store: new MemoryRateLimitStore(), windowMs: 500 });

    await expect(limiter.check({ at: 2_000, id: "admin:diagnostics" })).resolves.toMatchObject({ allowed: true });
    await expect(limiter.check({ at: 2_100, id: "admin:diagnostics" })).resolves.toMatchObject({ allowed: false });
    await expect(limiter.check({ at: 2_500, id: "admin:diagnostics" })).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
      resetAt: 3_000,
    });
  });
});
