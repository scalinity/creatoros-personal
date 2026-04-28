import { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { retryPublishingJob } from "@/lib/publishing";
import { publishingJobRetrySchema } from "@/lib/publishing/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";

import { envelope, errorResponse, publishingErrorResponse, readJsonBody } from "../../../_utils";

export const dynamic = "force-dynamic";

const retryLimiter = createFixedWindowRateLimiter({
  limit: 10,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await retryLimiter.check({ id: `${guard.admin.userId}:publishing-job-retry` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many publishing retry requests.", 429, headers);
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const parsed = publishingJobRetrySchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse("validation_error", "Publishing retry payload failed validation.", 400, headers);
  }

  try {
    const result = await retryPublishingJob(guard.admin, parsed.data);
    return envelope(result, headers);
  } catch (error) {
    console.error("Publishing retry API failed", {
      jobId: id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return publishingErrorResponse(error, "Publishing job could not be retried.", headers);
  }
}
