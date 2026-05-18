import { type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { envelope, errorResponse, getRequestId, readJsonBody } from "@/lib/http/envelope";
import { transformInspiration } from "@/lib/inspiration";
import { inspirationTransformSchema } from "@/lib/inspiration/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const transformLimiter = createFixedWindowRateLimiter({
  limit: 20,
  windowMs: 60 * 60 * 1_000,
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);
  if (!guard.ok) return guard.response;

  const decision = await transformLimiter.check({ id: `${guard.admin.userId}:inspiration:api-transform` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many inspiration transform requests.", 429, headers);
  }

  const parsed = inspirationTransformSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "Inspiration transform payload failed validation.", 400, headers);
  }

  try {
    const result = await transformInspiration(guard.admin, parsed.data);
    return envelope(
      requestId,
      {
        inspiration_id: result.inspiration.id,
        plagiarism_risk: result.transform.plagiarismRisk,
        transform: result.transform,
      },
      headers,
    );
  } catch (error) {
    console.error("Inspiration transform API failed", {
      id: parsed.data.id,
      mode: parsed.data.mode,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, "internal_error", "Inspiration transform could not be completed safely.", 500, headers);
  }
}
