import { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { cancelPublishingJob } from "@/lib/publishing";
import { publishingCancelSchema } from "@/lib/publishing/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";

import { envelope, errorResponse, publishingErrorResponse, readJsonBody } from "../../../_utils";

export const dynamic = "force-dynamic";

const cancelLimiter = createFixedWindowRateLimiter({
  limit: 30,
  store: new MemoryRateLimitStore(),
  windowMs: 60_000,
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await cancelLimiter.check({ id: `${guard.admin.userId}:publishing-job-cancel` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many publishing cancel requests.", 429, headers);
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const parsed = publishingCancelSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse("validation_error", "Publishing cancel payload failed validation.", 400, headers);
  }

  try {
    const job = await cancelPublishingJob(guard.admin, parsed.data);
    return envelope({ job }, headers);
  } catch (error) {
    console.error("Publishing cancel API failed", {
      jobId: id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return publishingErrorResponse(error, "Publishing job could not be canceled.", headers);
  }
}
