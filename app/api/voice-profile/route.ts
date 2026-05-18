import { type NextRequest } from "next/server";
import { z } from "zod";

import { loadEmbeddingStatus } from "@/lib/embeddings";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { envelope, errorResponse, getRequestId, readJsonBody } from "@/lib/http/envelope";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { generateVoiceProfile, loadVoiceProfileStatus } from "@/lib/voice";

export const dynamic = "force-dynamic";

const recomputeSchema = z.object({
  recompute: z.boolean().optional().default(true),
});

const readLimiter = createFixedWindowRateLimiter({
  limit: 30,
  windowMs: 60_000,
});

const recomputeLimiter = createFixedWindowRateLimiter({
  limit: 5,
  windowMs: 24 * 60 * 60 * 1_000,
});

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await readLimiter.check({ id: `${guard.admin.userId}:voice-profile:get` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many voice profile status requests.", 429, headers);
  }

  const [voice, embeddings] = await Promise.all([loadVoiceProfileStatus(guard.admin), loadEmbeddingStatus(guard.admin)]);

  return envelope(requestId, { embeddings, voice }, headers);
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const body = recomputeSchema.safeParse(await readJsonBody(request));

  if (!body.success) {
    return errorResponse(requestId, "validation_error", "Invalid voice profile recompute payload.", 400);
  }

  const decision = await recomputeLimiter.check({ id: `${guard.admin.userId}:voice-profile:post` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many voice profile recompute requests.", 429, headers);
  }

  if (!body.data.recompute) {
    return errorResponse(requestId, "validation_error", "Voice profile POST only supports recompute=true.", 400, headers);
  }

  try {
    const profile = await generateVoiceProfile(guard.admin);
    return envelope(requestId, { profile }, headers);
  } catch (error) {
    console.error("Voice profile API recompute failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, "voice_profile_failed", "Voice profile recompute could not be completed safely.", 500, headers);
  }
}
