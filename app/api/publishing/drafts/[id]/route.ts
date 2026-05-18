import { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { updatePublishingDraft } from "@/lib/publishing";
import { publishingDraftUpdateSchema } from "@/lib/publishing/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

import { envelope, errorResponse, getRequestId, publishingErrorResponse, readJsonBody } from "../../_utils";

export const dynamic = "force-dynamic";

const draftUpdateLimiter = createFixedWindowRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await draftUpdateLimiter.check({ id: `${guard.admin.userId}:publishing-draft-update` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many publishing draft update requests.", 429, headers);
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const parsed = publishingDraftUpdateSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "Publishing draft update failed validation.", 400, headers);
  }

  try {
    const draft = await updatePublishingDraft(guard.admin, parsed.data);
    return envelope(requestId, { draft }, headers);
  } catch (error) {
    console.error("Publishing draft update API failed", {
      draftId: id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return publishingErrorResponse(requestId, error, "Publishing draft could not be updated.", headers);
  }
}
