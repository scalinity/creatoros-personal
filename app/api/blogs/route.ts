import { type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { createBlog } from "@/lib/blogs";
import { blogCreateSchema } from "@/lib/blogs/validation";
import { envelope, errorResponse, getRequestId, readJsonBody } from "@/lib/http/envelope";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const blogCreateLimiter = createFixedWindowRateLimiter({
  limit: 30,
  windowMs: 60_000,
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await blogCreateLimiter.check({ id: `${guard.admin.userId}:blogs-create` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many blog create requests.", 429, headers);
  }

  const parsed = blogCreateSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "Blog payload failed validation.", 400, headers);
  }

  try {
    const blog = await createBlog(guard.admin, parsed.data);
    return envelope(requestId, { blog }, headers);
  } catch (error) {
    console.error("Failed to create blog through API", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, "internal_error", "Blog could not be created.", 500, headers);
  }
}
