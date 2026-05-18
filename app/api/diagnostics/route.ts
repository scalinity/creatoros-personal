import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { getOperationalDiagnosticsForAdmin } from "@/lib/server-only/diagnostics";

export const dynamic = "force-dynamic";

const diagnosticsLimiter = createFixedWindowRateLimiter({
  limit: 30,
  windowMs: 60_000,
});

function rateLimitedResponse(headers: Record<string, string>) {
  return NextResponse.json(
    {
      data: null,
      error: {
        code: "rate_limited",
        message: "Too many diagnostics requests.",
      },
      ok: false,
      request_id: randomUUID(),
    },
    { headers, status: 429 },
  );
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await diagnosticsLimiter.check({ id: `${guard.admin.userId}:diagnostics` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return rateLimitedResponse(headers);
  }

  return NextResponse.json(
    {
      data: await getOperationalDiagnosticsForAdmin(guard.admin),
      error: null,
      ok: true,
      request_id: randomUUID(),
    },
    { headers },
  );
}
