import { type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { runXReadSync } from "@/lib/x/sync";
import { xReadSyncSchema } from "@/lib/x/validation";

import { envelope, errorEnvelope, errorResponse, getRequestId, readBoundedJsonBody } from "../_utils";

export const dynamic = "force-dynamic";

const syncLimiter = createFixedWindowRateLimiter({
  limit: 5,
  windowMs: 60 * 60 * 1_000,
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await syncLimiter.check({ id: `${guard.admin.userId}:x-sync` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many X sync requests.", 429, headers);
  }

  const body = await readBoundedJsonBody(request, requestId, { headers, limitBytes: 1_000_000 });
  if (!body.ok) return body.response;
  const parsed = xReadSyncSchema.safeParse(body.value);

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "X sync payload failed validation.", 400, headers);
  }

  try {
    const result = await runXReadSync(
      guard.admin,
      {
        includeMetrics: parsed.data.include_metrics,
        maxPosts: parsed.data.max_posts,
        mode: parsed.data.mode,
      },
      { request },
    );

    if (result.status === "failed") {
      const code = result.error?.toLowerCase().includes("scope") ? "missing_scope" : result.rateLimitResetAt ? "rate_limited" : "x_api_error";
      const status = code === "missing_scope" ? 409 : code === "rate_limited" ? 429 : 502;
      return errorEnvelope(requestId, { sync_job: result }, code, "X sync failed; inspect sync job status.", status, headers);
    }

    return envelope(requestId, { sync_job: result }, headers);
  } catch (error) {
    console.error("X sync route failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, "internal_error", "X sync could not be started.", 500, headers);
  }
}
