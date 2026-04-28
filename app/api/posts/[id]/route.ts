import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { updatePostMetrics } from "@/lib/posts";
import { postMetricUpdateFormSchema } from "@/lib/posts/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const updateLimiter = createFixedWindowRateLimiter({
  limit: 60,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 1_000,
});

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

  const decision = await updateLimiter.check({ id: `${guard.admin.userId}:posts-update` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many post update requests.", 429, headers);
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const parsed = postMetricUpdateFormSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse("validation_error", "Post metrics payload failed validation.", 400, headers);
  }

  try {
    const post = await updatePostMetrics(guard.admin, parsed.data);

    return NextResponse.json(
      {
        data: { post },
        error: null,
        ok: true,
        request_id: randomUUID(),
      },
      { headers },
    );
  } catch (error) {
    return errorResponse(error instanceof Error && error.message.startsWith("Post not found") ? "not_found" : "internal_error", "Post metrics could not be updated.", error instanceof Error && error.message.startsWith("Post not found") ? 404 : 500, headers);
  }
}
