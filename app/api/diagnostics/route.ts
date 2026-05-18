import { type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { envelope, errorResponse, getRequestId } from "@/lib/http/envelope";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { getOperationalDiagnosticsForAdmin } from "@/lib/server-only/diagnostics";

export const dynamic = "force-dynamic";

const diagnosticsLimiter = createFixedWindowRateLimiter({
  limit: 30,
  windowMs: 60_000,
});

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await diagnosticsLimiter.check({ id: `${guard.admin.userId}:diagnostics` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many diagnostics requests.", 429, headers);
  }

  return envelope(requestId, await getOperationalDiagnosticsForAdmin(guard.admin), headers);
}
