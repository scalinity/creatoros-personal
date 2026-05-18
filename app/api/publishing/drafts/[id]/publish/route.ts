import { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { runXPublishingJob } from "@/lib/publishing";
import { publishingDraftPublishSchema } from "@/lib/publishing/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

import { envelope, errorResponse, getRequestId, publishingErrorResponse, readBoundedJsonBody } from "../../../_utils";

export const dynamic = "force-dynamic";

const publishLimiter = createFixedWindowRateLimiter({
  limit: 10,
  windowMs: 60 * 60 * 1_000,
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await publishLimiter.check({ id: `${guard.admin.userId}:publishing-draft-dry-run` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many publishing dry-run requests.", 429, headers);
  }

  const { id } = await context.params;
  const bounded = await readBoundedJsonBody(request, requestId, { headers, limitBytes: 1_000_000 });
  if (!bounded.ok) return bounded.response;
  const body = bounded.value;
  const parsed = publishingDraftPublishSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "Publishing payload failed validation.", 400, headers);
  }

  try {
    const result = await runXPublishingJob(guard.admin, parsed.data, { mode: parsed.data.dryRun ? "dry_run" : "live", request });
    return envelope(requestId, result, headers);
  } catch (error) {
    console.error("Publishing API failed", {
      draftId: id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return publishingErrorResponse(requestId, error, "Publishing could not be completed.", headers);
  }
}
