import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { transformInspiration } from "@/lib/inspiration";
import { inspirationTransformSchema } from "@/lib/inspiration/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const transformLimiter = createFixedWindowRateLimiter({
  limit: 20,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

function envelope(data: unknown, headers?: Record<string, string>) {
  return NextResponse.json({ data, error: null, ok: true, request_id: randomUUID() }, { headers });
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

export async function POST(request: NextRequest) {
  const guard = await requireAdminForRoute(request);
  if (!guard.ok) return guard.response;

  const decision = await transformLimiter.check({ id: `${guard.admin.userId}:inspiration:api-transform` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many inspiration transform requests.", 429, headers);
  }

  const parsed = inspirationTransformSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return errorResponse("validation_error", "Inspiration transform payload failed validation.", 400, headers);
  }

  try {
    const result = await transformInspiration(guard.admin, parsed.data);
    return envelope(
      {
        inspiration_id: result.inspiration.id,
        plagiarism_risk: result.transform.plagiarismRisk,
        transform: result.transform,
      },
      headers,
    );
  } catch (error) {
    console.error("Inspiration transform API failed", {
      id: parsed.data.id,
      mode: parsed.data.mode,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse("internal_error", "Inspiration transform could not be completed safely.", 500, headers);
  }
}
