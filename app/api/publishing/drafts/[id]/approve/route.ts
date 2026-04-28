import { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { approvePublishingDraft } from "@/lib/publishing";
import { publishingDraftApprovalSchema } from "@/lib/publishing/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";

import { envelope, errorResponse, publishingErrorResponse, readJsonBody } from "../../../_utils";

export const dynamic = "force-dynamic";

const approvalLimiter = createFixedWindowRateLimiter({
  limit: 30,
  store: new MemoryRateLimitStore(),
  windowMs: 60_000,
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await approvalLimiter.check({ id: `${guard.admin.userId}:publishing-draft-approve` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many publishing approval requests.", 429, headers);
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const parsed = publishingDraftApprovalSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse("validation_error", "Publishing approval payload failed validation.", 400, headers);
  }

  try {
    const draft = await approvePublishingDraft(guard.admin, parsed.data);
    return envelope({ draft }, headers);
  } catch (error) {
    console.error("Publishing draft approval API failed", {
      draftId: id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return publishingErrorResponse(error, "Publishing draft could not be approved.", headers);
  }
}
