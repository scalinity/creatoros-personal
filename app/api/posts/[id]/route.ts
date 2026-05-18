import { type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { envelope, errorResponse, getRequestId, readJsonBody } from "@/lib/http/envelope";
import { updatePostMetrics } from "@/lib/posts";
import { postMetricUpdateFormSchema } from "@/lib/posts/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const updateLimiter = createFixedWindowRateLimiter({
  limit: 60,
  windowMs: 60 * 1_000,
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await updateLimiter.check({ id: `${guard.admin.userId}:posts-update` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many post update requests.", 429, headers);
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const parsed = postMetricUpdateFormSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "Post metrics payload failed validation.", 400, headers);
  }

  try {
    const post = await updatePostMetrics(guard.admin, parsed.data);
    return envelope(requestId, { post }, headers);
  } catch (error) {
    return errorResponse(requestId, error instanceof Error && error.message.startsWith("Post not found") ? "not_found" : "internal_error", "Post metrics could not be updated.", error instanceof Error && error.message.startsWith("Post not found") ? 404 : 500, headers);
  }
}
