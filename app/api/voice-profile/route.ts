import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { loadEmbeddingStatus } from "@/lib/embeddings";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";
import { generateVoiceProfile, loadVoiceProfileStatus } from "@/lib/voice";

export const dynamic = "force-dynamic";

const recomputeSchema = z.object({
  recompute: z.boolean().optional().default(true),
});

const readLimiter = createFixedWindowRateLimiter({
  limit: 30,
  store: new MemoryRateLimitStore(),
  windowMs: 60_000,
});

const recomputeLimiter = createFixedWindowRateLimiter({
  limit: 5,
  store: new MemoryRateLimitStore(),
  windowMs: 24 * 60 * 60 * 1_000,
});

function envelope(data: unknown, headers?: Record<string, string>) {
  return NextResponse.json(
    {
      data,
      error: null,
      ok: true,
      request_id: randomUUID(),
    },
    { headers },
  );
}

function errorResponse(code: string, message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json(
    {
      data: null,
      error: { code, message },
      ok: false,
      request_id: randomUUID(),
    },
    { headers, status },
  );
}

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await readLimiter.check({ id: `${guard.admin.userId}:voice-profile:get` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many voice profile status requests.", 429, headers);
  }

  const [voice, embeddings] = await Promise.all([loadVoiceProfileStatus(guard.admin), loadEmbeddingStatus(guard.admin)]);

  return envelope({ embeddings, voice }, headers);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const body = recomputeSchema.safeParse(await readJsonBody(request));

  if (!body.success) {
    return errorResponse("validation_error", "Invalid voice profile recompute payload.", 400);
  }

  const decision = await recomputeLimiter.check({ id: `${guard.admin.userId}:voice-profile:post` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many voice profile recompute requests.", 429, headers);
  }

  if (!body.data.recompute) {
    return errorResponse("validation_error", "Voice profile POST only supports recompute=true.", 400, headers);
  }

  try {
    const profile = await generateVoiceProfile(guard.admin);
    return envelope({ profile }, headers);
  } catch (error) {
    console.error("Voice profile API recompute failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse("voice_profile_failed", "Voice profile recompute could not be completed safely.", 500, headers);
  }
}
