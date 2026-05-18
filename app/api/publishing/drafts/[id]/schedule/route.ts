import { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { scheduleApprovedDraft } from "@/lib/publishing";
import { publishingDraftScheduleSchema } from "@/lib/publishing/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

import { envelope, errorResponse, publishingErrorResponse, readJsonBody } from "../../../_utils";

export const dynamic = "force-dynamic";

const scheduleLimiter = createFixedWindowRateLimiter({
  limit: 30,
  windowMs: 60_000,
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await scheduleLimiter.check({ id: `${guard.admin.userId}:publishing-draft-schedule` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many publishing schedule requests.", 429, headers);
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const parsed = publishingDraftScheduleSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse("validation_error", "Publishing schedule payload failed validation.", 400, headers);
  }

  try {
    const result = await scheduleApprovedDraft(guard.admin, parsed.data);
    return envelope(result, headers);
  } catch (error) {
    console.error("Publishing schedule API failed", {
      draftId: id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return publishingErrorResponse(error, "Publishing draft could not be scheduled.", headers);
  }
}
