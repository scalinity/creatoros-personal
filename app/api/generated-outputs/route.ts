import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { createGeneratedOutput } from "@/lib/content";
import { generatedOutputCreateSchema } from "@/lib/content/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const outputLimiter = createFixedWindowRateLimiter({
  limit: 60,
  store: new MemoryRateLimitStore(),
  windowMs: 60_000,
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

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await outputLimiter.check({ id: `${guard.admin.userId}:generated-outputs-create` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many generated output requests.", 429, headers);
  }

  const body = generatedOutputCreateSchema.safeParse(await readJsonBody(request));

  if (!body.success) {
    return errorResponse("validation_error", "Generated output payload failed validation.", 400, headers);
  }

  try {
    const output = await createGeneratedOutput(guard.admin, body.data);
    return envelope({ output }, headers);
  } catch (error) {
    console.error("Failed to save generated output", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse("internal_error", "Generated output could not be saved.", 500, headers);
  }
}
