import { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { approvePublishingDraft } from "@/lib/publishing";
import { publishingDraftApprovalSchema } from "@/lib/publishing/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

import { envelope, errorResponse, getRequestId, publishingErrorResponse, readBoundedJsonBody } from "../../../_utils";

export const dynamic = "force-dynamic";

const approvalLimiter = createFixedWindowRateLimiter({
  limit: 30,
  windowMs: 60_000,
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await approvalLimiter.check({ id: `${guard.admin.userId}:publishing-draft-approve` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many publishing approval requests.", 429, headers);
  }

  const { id } = await context.params;
  const bounded = await readBoundedJsonBody(request, requestId, { headers, limitBytes: 1_000_000 });
  if (!bounded.ok) return bounded.response;
  const body = bounded.value;
  const parsed = publishingDraftApprovalSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "Publishing approval payload failed validation.", 400, headers);
  }

  try {
    const draft = await approvePublishingDraft(guard.admin, parsed.data);
    return envelope(requestId, { draft }, headers);
  } catch (error) {
    console.error("Publishing draft approval API failed", {
      draftId: id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return publishingErrorResponse(requestId, error, "Publishing draft could not be approved.", headers);
  }
}
