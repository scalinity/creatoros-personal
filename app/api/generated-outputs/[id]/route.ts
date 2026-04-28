import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { updateGeneratedOutputStatus } from "@/lib/content";
import { generatedOutputStatusActionSchema } from "@/lib/content/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const outputActionLimiter = createFixedWindowRateLimiter({
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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await outputActionLimiter.check({ id: `${guard.admin.userId}:generated-outputs-action` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many generated output action requests.", 429, headers);
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const parsed = generatedOutputStatusActionSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse("validation_error", "Generated output action failed validation.", 400, headers);
  }

  try {
    const output = await updateGeneratedOutputStatus(guard.admin, parsed.data);
    return envelope({ output }, headers);
  } catch (error) {
    const notFound = error instanceof Error && error.message.includes("missing row");
    console.error("Failed to update generated output", {
      id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(notFound ? "not_found" : "internal_error", "Generated output could not be updated.", notFound ? 404 : 500, headers);
  }
}
