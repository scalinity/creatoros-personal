import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

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
  // H-6: now optional. If omitted, the durable Postgres-backed store is used
  // in production and the in-memory store is used in tests / when no Supabase
  // service-role client is configured. Existing call sites that explicitly
  // pass `new MemoryRateLimitStore()` continue to work for tests.
  store?: RateLimitStore;
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

// H-6: durable rate-limit store backed by the rate_limit_buckets Postgres
// table. Counters survive cold starts and reconcile across multiple serverless
// instances. The atomic increment is implemented as the
// `creatoros_rate_limit_increment` SQL function (security-definer, granted to
// service_role only) so the upsert+count happens in a single round-trip.
//
// Usage requires the service-role client; never construct this with an
// authenticated session client because the function is granted only to
// service_role and RLS denies authenticated/anon access to rate_limit_buckets.
//
// On any DB error the store falls back to allowing the request and logs the
// failure — failing closed would deny legitimate traffic on a transient blip.
// The fallback memory store keeps the per-process counter as a safety net.
export class PostgresRateLimitStore implements RateLimitStore {
  private readonly fallback = new MemoryRateLimitStore();

  constructor(private readonly client: SupabaseClient<Database>) {}

  async increment(id: string, at: number, windowMs: number): Promise<RateLimitStoreEntry> {
    const windowStart = Math.floor(at / windowMs) * windowMs;
    const bucketId = `${id}:${windowStart}`;

    try {
      const { data, error } = await this.client.rpc("creatoros_rate_limit_increment", {
        p_bucket_id: id,
        p_id: bucketId,
        p_window_ms: windowMs,
        p_window_start_ms: windowStart,
      });

      if (error || !data || data.length === 0 || !data[0]) {
        // Fall back to the memory store; never deny on infra failure.
        console.error("PostgresRateLimitStore increment failed; falling back to memory store", {
          reason: error?.message ?? "empty_response",
        });
        return this.fallback.increment(id, at, windowMs);
      }

      return {
        count: data[0].count,
        resetAt: new Date(data[0].reset_at).getTime(),
      };
    } catch (error) {
      console.error("PostgresRateLimitStore increment threw; falling back to memory store", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      return this.fallback.increment(id, at, windowMs);
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

  let resolvedStore: null | RateLimitStore = options.store ?? null;

  return {
    async check(input: RateLimitCheck): Promise<RateLimitDecision> {
      const at = input.at ?? Date.now();
      // Lazy-resolve the default durable store on first use so module import
      // does not require the Supabase URL/key to be configured.
      if (!resolvedStore) {
        resolvedStore = createDefaultRateLimitStore();
      }
      const entry = await resolvedStore.increment(input.id, at, options.windowMs);
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

// H-6: factory used by route handlers. Use `createDefaultRateLimitStore` to
// build the durable Postgres-backed store, falling back to the in-memory store
// when no service-role client is available (e.g. tests, local dev without a
// Supabase URL). This keeps the call site readable while making the
// production wiring explicit.
let cachedDefaultStore: null | RateLimitStore = null;
export function createDefaultRateLimitStore(): RateLimitStore {
  if (cachedDefaultStore) return cachedDefaultStore;

  if (process.env.NODE_ENV === "test" || process.env.CREATOROS_E2E_AUTH_BYPASS === "1") {
    cachedDefaultStore = new MemoryRateLimitStore();
    return cachedDefaultStore;
  }

  // Lazy-load the service-role client to keep this module importable from
  // tests without a configured Supabase URL.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSupabaseServiceRoleClient } = require("@/lib/db/service-role") as { createSupabaseServiceRoleClient: () => SupabaseClient<Database> };
    cachedDefaultStore = new PostgresRateLimitStore(createSupabaseServiceRoleClient());
  } catch (error) {
    console.error("createDefaultRateLimitStore: falling back to MemoryRateLimitStore", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    cachedDefaultStore = new MemoryRateLimitStore();
  }

  return cachedDefaultStore;
}

export function rateLimitIdFromRequest(request: { headers: Headers }, scope: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 120) ?? "unknown";
  const hash = createHash("sha256").update(`${ip}:${userAgent}`).digest("hex").slice(0, 32);

  return `${scope}:${hash}`;
}
