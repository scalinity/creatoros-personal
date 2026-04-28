import type { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { runXPublishingJob } from "@/lib/publishing";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";
import { xPublishSchema } from "@/lib/x/validation";

import { envelope, errorResponse, readJsonBody } from "../_utils";

const publishLimiter = createFixedWindowRateLimiter({
  limit: 10,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

function xPublishErrorResponse(error: unknown, headers?: Record<string, string>) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("not found")) return errorResponse("not_found", "X publish draft was not found.", 404, headers);
  if (message.includes("scope")) return errorResponse("missing_scope", "X publish scope is missing.", 409, headers);
  if (message.includes("capability")) return errorResponse("capability_disabled", "X publish capability is disabled.", 409, headers);
  if (message.includes("approved") || message.includes("payload hash") || message.includes("route")) return errorResponse("conflict", "X publish request failed safety checks.", 409, headers);
  return errorResponse("internal_error", "X publish request could not be completed.", 500, headers);
}

export async function handleXPublishRoute(request: NextRequest, expectedContentTypes: string[], rateLimitKey: string) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await publishLimiter.check({ id: `${guard.admin.userId}:${rateLimitKey}` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many X publish requests.", 429, headers);
  }

  const parsed = xPublishSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return errorResponse("validation_error", "X publish payload failed validation.", 400, headers);
  }

  try {
    const result = await runXPublishingJob(
      guard.admin,
      {
        confirmation: parsed.data.confirmation,
        id: parsed.data.publishingDraftId,
        payloadHash: parsed.data.payloadHash,
      },
      {
        expectedContentTypes,
        mode: parsed.data.dryRun ? "dry_run" : "live",
        request,
      },
    );

    return envelope({ publish_job: result }, headers);
  } catch (error) {
    console.error("X publish route failed", {
      reason: error instanceof Error ? error.message : "unknown",
      route: rateLimitKey,
    });
    return xPublishErrorResponse(error, headers);
  }
}
