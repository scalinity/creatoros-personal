import { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { createPublishingDraft } from "@/lib/publishing";
import { publishingDraftCreateSchema } from "@/lib/publishing/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

import { envelope, errorResponse, getRequestId, publishingErrorResponse, readBoundedJsonBody } from "../_utils";

export const dynamic = "force-dynamic";

const draftCreateLimiter = createFixedWindowRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await draftCreateLimiter.check({ id: `${guard.admin.userId}:publishing-draft-create` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many publishing draft requests.", 429, headers);
  }

  const bounded = await readBoundedJsonBody(request, requestId, { headers, limitBytes: 1_000_000 });
  if (!bounded.ok) return bounded.response;
  const parsed = publishingDraftCreateSchema.safeParse(bounded.value);

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "Publishing draft payload failed validation.", 400, headers);
  }

  try {
    const draft = await createPublishingDraft(guard.admin, parsed.data);
    return envelope(requestId, { draft }, headers);
  } catch (error) {
    console.error("Publishing draft create API failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return publishingErrorResponse(requestId, error, "Publishing draft could not be created.", headers);
  }
}
