import { type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { archiveContentIdea, updateContentIdea } from "@/lib/content";
import { contentIdeaUpdateSchema } from "@/lib/content/validation";
import { envelope, errorResponse, getRequestId, readBoundedJsonBody } from "@/lib/http/envelope";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ideaUpdateLimiter = createFixedWindowRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await ideaUpdateLimiter.check({ id: `${guard.admin.userId}:ideas-update` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many idea update requests.", 429, headers);
  }

  const { id } = await context.params;
  const bounded = await readBoundedJsonBody(request, requestId, { headers, limitBytes: 1_000_000 });
  if (!bounded.ok) return bounded.response;
  const body = bounded.value;
  const parsed = contentIdeaUpdateSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "Idea update payload failed validation.", 400, headers);
  }

  try {
    const idea = parsed.data.status === "archived" ? await archiveContentIdea(guard.admin, parsed.data.id) : await updateContentIdea(guard.admin, parsed.data);
    return envelope(requestId, { idea }, headers);
  } catch (error) {
    const notFound = error instanceof Error && error.message.includes("missing row");
    console.error("Failed to update content idea", {
      id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, notFound ? "not_found" : "internal_error", "Idea could not be updated.", notFound ? 404 : 500, headers);
  }
}
