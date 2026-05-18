import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { createContentIdea } from "@/lib/content";
import { contentIdeaCreateSchema } from "@/lib/content/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ideasLimiter = createFixedWindowRateLimiter({
  limit: 60,
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

  const decision = await ideasLimiter.check({ id: `${guard.admin.userId}:ideas-create` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many idea requests.", 429, headers);
  }

  const body = contentIdeaCreateSchema.safeParse(await readJsonBody(request));

  if (!body.success) {
    return errorResponse("validation_error", "Idea payload failed validation.", 400, headers);
  }

  try {
    const idea = await createContentIdea(guard.admin, body.data);
    return envelope({ idea }, headers);
  } catch (error) {
    console.error("Failed to create content idea", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse("internal_error", "Idea could not be created.", 500, headers);
  }
}
