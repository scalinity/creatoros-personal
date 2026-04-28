import { createHash } from "node:crypto";

export type RateLimitCheck = {
  at?: number;
  id: string;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
};

export type RateLimitStoreEntry = {
  count: number;
  resetAt: number;
};

export interface RateLimitStore {
  increment(id: string, at: number, windowMs: number): Promise<RateLimitStoreEntry>;
}

export type FixedWindowRateLimiterOptions = {
  limit: number;
  store: RateLimitStore;
  windowMs: number;
};

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, RateLimitStoreEntry>();

  async increment(id: string, at: number, windowMs: number) {
    const windowStart = Math.floor(at / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const entryKey = `${id}:${windowStart}`;
    const current = this.entries.get(entryKey);

    if (current && at < current.resetAt) {
      current.count += 1;
      return { ...current };
    }

    const next = { count: 1, resetAt };
    this.entries.set(entryKey, next);
    this.prune(at);

    return { ...next };
  }

  private prune(at: number) {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= at) {
        this.entries.delete(key);
      }
    }
  }
}

export function createFixedWindowRateLimiter(options: FixedWindowRateLimiterOptions) {
  if (options.limit < 1) {
    throw new Error("Rate limit must be at least 1.");
  }

  if (options.windowMs < 1) {
    throw new Error("Rate limit window must be positive.");
  }

  return {
    async check(input: RateLimitCheck): Promise<RateLimitDecision> {
      const at = input.at ?? Date.now();
      const entry = await options.store.increment(input.id, at, options.windowMs);
      const allowed = entry.count <= options.limit;
      const remaining = Math.max(0, options.limit - entry.count);

      return {
        allowed,
        limit: options.limit,
        remaining,
        resetAt: entry.resetAt,
        retryAfterMs: allowed ? 0 : Math.max(0, entry.resetAt - at),
      };
    },
  };
}

export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(Math.ceil(decision.resetAt / 1_000)),
    ...(decision.allowed ? {} : { "Retry-After": String(Math.ceil(decision.retryAfterMs / 1_000)) }),
  };
}

export function rateLimitIdFromRequest(request: { headers: Headers }, scope: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 120) ?? "unknown";
  const hash = createHash("sha256").update(`${ip}:${userAgent}`).digest("hex").slice(0, 32);

  return `${scope}:${hash}`;
}
