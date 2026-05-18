import { type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { updateGeneratedOutputStatus } from "@/lib/content";
import { generatedOutputStatusActionSchema } from "@/lib/content/validation";
import { envelope, errorResponse, getRequestId, readJsonBody } from "@/lib/http/envelope";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const outputActionLimiter = createFixedWindowRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await outputActionLimiter.check({ id: `${guard.admin.userId}:generated-outputs-action` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many generated output action requests.", 429, headers);
  }

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const parsed = generatedOutputStatusActionSchema.safeParse({
    ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
    id,
  });

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "Generated output action failed validation.", 400, headers);
  }

  try {
    const output = await updateGeneratedOutputStatus(guard.admin, parsed.data);
    return envelope(requestId, { output }, headers);
  } catch (error) {
    const notFound = error instanceof Error && error.message.includes("missing row");
    console.error("Failed to update generated output", {
      id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, notFound ? "not_found" : "internal_error", "Generated output could not be updated.", notFound ? 404 : 500, headers);
  }
}
