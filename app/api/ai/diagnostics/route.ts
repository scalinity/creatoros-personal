import { type NextRequest } from "next/server";

import { getAiFoundationDiagnostics } from "@/lib/ai/diagnostics";
import { createAiRateLimiter } from "@/lib/ai/rate-limit";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { envelope, errorResponse, getRequestId } from "@/lib/http/envelope";
import { rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const diagnosticsLimiter = createAiRateLimiter("diagnostics");

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await diagnosticsLimiter.check({ id: `${guard.admin.userId}:ai-diagnostics` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many AI diagnostics requests.", 429, headers);
  }

  return envelope(requestId, getAiFoundationDiagnostics(), headers);
}
