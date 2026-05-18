import { createFixedWindowRateLimiter } from "@/lib/rate-limit";

export const aiRateLimitDefaults = {
  "account-research": { limit: 20, windowMs: 24 * 60 * 60 * 1_000 },
  "algo-analysis": { limit: 50, windowMs: 24 * 60 * 60 * 1_000 },
  "blog-writer": { limit: 20, windowMs: 24 * 60 * 60 * 1_000 },
  coach: { limit: 30, windowMs: 24 * 60 * 60 * 1_000 },
  diagnostics: { limit: 30, windowMs: 60_000 },
  embeddings: { limit: 10, windowMs: 24 * 60 * 60 * 1_000 },
  "growth-review": { limit: 10, windowMs: 24 * 60 * 60 * 1_000 },
  "publishing-risk-review": { limit: 100, windowMs: 24 * 60 * 60 * 1_000 },
  "voice-profile": { limit: 5, windowMs: 24 * 60 * 60 * 1_000 },
} as const;

export type AiRateLimitKey = keyof typeof aiRateLimitDefaults;

export function createAiRateLimiter(key: AiRateLimitKey) {
  const defaults = aiRateLimitDefaults[key];

  // SCA-474 (C-4): use the lazy default (PostgresRateLimitStore in prod,
  // MemoryRateLimitStore in tests / E2E bypass). The explicit memory store
  // here used to defeat the durable counter across serverless instances.
  return createFixedWindowRateLimiter({
    limit: defaults.limit,
    windowMs: defaults.windowMs,
  });
}
