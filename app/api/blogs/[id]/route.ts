import { type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { updateBlog } from "@/lib/blogs";
import { blogUpdateSchema } from "@/lib/blogs/validation";
import { envelope, errorResponse, getRequestId, readBoundedJsonBody } from "@/lib/http/envelope";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const blogUpdateLimiter = createFixedWindowRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await blogUpdateLimiter.check({ id: `${guard.admin.userId}:blogs-update` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many blog update requests.", 429, headers);
  }

  const { id } = await context.params;
  const bounded = await readBoundedJsonBody(request, requestId, { headers, limitBytes: 2_000_000 });
  if (!bounded.ok) return bounded.response;
  const body = bounded.value;
  const parsed = blogUpdateSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "Blog update payload failed validation.", 400, headers);
  }

  try {
    const blog = await updateBlog(guard.admin, parsed.data);
    return envelope(requestId, { blog }, headers);
  } catch (error) {
    const notFound = error instanceof Error && error.message.includes("not found");
    console.error("Failed to update blog through API", {
      id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, notFound ? "not_found" : "internal_error", "Blog could not be updated.", notFound ? 404 : 500, headers);
  }
}
