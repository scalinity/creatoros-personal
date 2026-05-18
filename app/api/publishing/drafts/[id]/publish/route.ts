import { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { runXPublishingJob } from "@/lib/publishing";
import { publishingDraftPublishSchema } from "@/lib/publishing/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

import { envelope, errorResponse, publishingErrorResponse, readJsonBody } from "../../../_utils";

export const dynamic = "force-dynamic";

const publishLimiter = createFixedWindowRateLimiter({
  limit: 10,
  windowMs: 60 * 60 * 1_000,
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await publishLimiter.check({ id: `${guard.admin.userId}:publishing-draft-dry-run` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many publishing dry-run requests.", 429, headers);
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const parsed = publishingDraftPublishSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse("validation_error", "Publishing payload failed validation.", 400, headers);
  }

  try {
    const result = await runXPublishingJob(guard.admin, parsed.data, { mode: parsed.data.dryRun ? "dry_run" : "live", request });
    return envelope(result, headers);
  } catch (error) {
    console.error("Publishing API failed", {
      draftId: id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return publishingErrorResponse(error, "Publishing could not be completed.", headers);
  }
}
