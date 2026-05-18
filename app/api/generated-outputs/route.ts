import { type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { createGeneratedOutput } from "@/lib/content";
import { generatedOutputCreateSchema } from "@/lib/content/validation";
import { envelope, errorResponse, getRequestId, readBoundedJsonBody } from "@/lib/http/envelope";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const outputLimiter = createFixedWindowRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await outputLimiter.check({ id: `${guard.admin.userId}:generated-outputs-create` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many generated output requests.", 429, headers);
  }

  const bounded = await readBoundedJsonBody(request, requestId, { headers, limitBytes: 1_000_000 });
  if (!bounded.ok) return bounded.response;
  const body = generatedOutputCreateSchema.safeParse(bounded.value);

  if (!body.success) {
    return errorResponse(requestId, "validation_error", "Generated output payload failed validation.", 400, headers);
  }

  try {
    const output = await createGeneratedOutput(guard.admin, body.data);
    return envelope(requestId, { output }, headers);
  } catch (error) {
    console.error("Failed to save generated output", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, "internal_error", "Generated output could not be saved.", 500, headers);
  }
}
