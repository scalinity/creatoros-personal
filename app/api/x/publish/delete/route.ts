import type { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { deleteOwnXPost } from "@/lib/publishing";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { xDeleteOwnPostSchema } from "@/lib/x/validation";

import { envelope, errorResponse, getRequestId, readJsonBody } from "../../_utils";

export const dynamic = "force-dynamic";

const deleteLimiter = createFixedWindowRateLimiter({
  limit: 5,
  windowMs: 60 * 60 * 1_000,
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await deleteLimiter.check({ id: `${guard.admin.userId}:x-delete-own-post` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many X delete requests.", 429, headers);
  }

  const parsed = xDeleteOwnPostSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "X delete payload failed validation.", 400, headers);
  }

  try {
    const result = await deleteOwnXPost(guard.admin, parsed.data, { request });
    return envelope(requestId, { deletion: result }, headers);
  } catch (error) {
    console.error("X delete-own-post route failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, "capability_disabled", "X delete-own-post request could not be completed.", 409, headers);
  }
}
