import { type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { createContentIdea } from "@/lib/content";
import { contentIdeaCreateSchema } from "@/lib/content/validation";
import { envelope, errorResponse, getRequestId, readBoundedJsonBody } from "@/lib/http/envelope";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ideasLimiter = createFixedWindowRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await ideasLimiter.check({ id: `${guard.admin.userId}:ideas-create` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many idea requests.", 429, headers);
  }

  const bounded = await readBoundedJsonBody(request, requestId, { headers, limitBytes: 1_000_000 });
  if (!bounded.ok) return bounded.response;
  const body = contentIdeaCreateSchema.safeParse(bounded.value);

  if (!body.success) {
    return errorResponse(requestId, "validation_error", "Idea payload failed validation.", 400, headers);
  }

  try {
    const idea = await createContentIdea(guard.admin, body.data);
    return envelope(requestId, { idea }, headers);
  } catch (error) {
    console.error("Failed to create content idea", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, "internal_error", "Idea could not be created.", 500, headers);
  }
}
