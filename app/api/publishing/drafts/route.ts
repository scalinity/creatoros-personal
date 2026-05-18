import { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { createPublishingDraft } from "@/lib/publishing";
import { publishingDraftCreateSchema } from "@/lib/publishing/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

import { envelope, errorResponse, publishingErrorResponse, readJsonBody } from "../_utils";

export const dynamic = "force-dynamic";

const draftCreateLimiter = createFixedWindowRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

export async function POST(request: NextRequest) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await draftCreateLimiter.check({ id: `${guard.admin.userId}:publishing-draft-create` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many publishing draft requests.", 429, headers);
  }

  const parsed = publishingDraftCreateSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return errorResponse("validation_error", "Publishing draft payload failed validation.", 400, headers);
  }

  try {
    const draft = await createPublishingDraft(guard.admin, parsed.data);
    return envelope({ draft }, headers);
  } catch (error) {
    console.error("Publishing draft create API failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return publishingErrorResponse(error, "Publishing draft could not be created.", headers);
  }
}
