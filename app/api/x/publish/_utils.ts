import type { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { PublishingNotFoundError, runXPublishingJob, XPublishingGuardError } from "@/lib/publishing";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { xPublishSchema } from "@/lib/x/validation";

import { envelope, errorResponse, getRequestId, readBoundedJsonBody } from "../_utils";

const publishLimiter = createFixedWindowRateLimiter({
  limit: 10,
  windowMs: 60 * 60 * 1_000,
});

// SCA-475 (C-5): typed-error classification mirrors app/api/publishing/_utils.ts
// publishingErrorResponse. No more substring matching on error.message — the
// prior approach would reflect a future i18n / reworded guard message as a
// misleading 500, and matched unrelated supabase errors that happened to
// contain "approved"/"scope"/"capability".
const X_PUBLISH_GUARD_CODE_TO_MESSAGE: Record<string, string> = {
  approval_required: "X publish request requires owner approval.",
  capability_disabled: "X publish capability is disabled.",
  confirmation_required: "X publish request requires explicit confirmation.",
  media_asset_missing: "X publish request references missing media.",
  media_upload_not_configured: "X publish media upload is not configured.",
  missing_scope: "X publish scope is missing.",
  payload_mismatch: "X publish payload hash is stale; re-approve to retry.",
  status_conflict: "X publish draft is not in a publishable state.",
  validation_error: "X publish request failed validation.",
  x_connection_unavailable: "X publish connection is unavailable.",
};

function xPublishErrorResponse(requestId: string, error: unknown, headers?: Record<string, string>) {
  if (error instanceof PublishingNotFoundError) {
    return errorResponse(requestId, "not_found", "X publish draft was not found.", 404, headers);
  }

  if (error instanceof XPublishingGuardError) {
    const message = X_PUBLISH_GUARD_CODE_TO_MESSAGE[error.code] ?? "X publish request failed safety checks.";
    return errorResponse(requestId, error.code, message, 409, headers);
  }

  return errorResponse(requestId, "internal_error", "X publish request could not be completed.", 500, headers);
}

// SCA-488 (W-9): single shared bucket across post/thread/reply/quote so a
// single owner cannot bypass the documented 10/h ceiling by varying content
// type. The rateLimitKey param is preserved for diagnostic logging only.
const X_PUBLISH_LIMIT_BUCKET = "x-publish";

export async function handleXPublishRoute(request: NextRequest, expectedContentTypes: string[], rateLimitKey: string) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await publishLimiter.check({ id: `${guard.admin.userId}:${X_PUBLISH_LIMIT_BUCKET}` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many X publish requests.", 429, headers);
  }

  const body = await readBoundedJsonBody(request, requestId, { headers, limitBytes: 1_000_000 });
  if (!body.ok) return body.response;
  const parsed = xPublishSchema.safeParse(body.value);

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "X publish payload failed validation.", 400, headers);
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

    return envelope(requestId, { publish_job: result }, headers);
  } catch (error) {
    console.error("X publish route failed", {
      reason: error instanceof Error ? error.message : "unknown",
      route: rateLimitKey,
    });
    return xPublishErrorResponse(requestId, error, headers);
  }
}
