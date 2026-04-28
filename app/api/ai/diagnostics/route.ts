import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getAiFoundationDiagnostics } from "@/lib/ai/diagnostics";
import { createAiRateLimiter } from "@/lib/ai/rate-limit";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const diagnosticsLimiter = createAiRateLimiter("diagnostics");

function errorResponse(code: string, message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json(
    {
      data: null,
      error: { code, message },
      ok: false,
      request_id: randomUUID(),
    },
    { headers, status },
  );
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await diagnosticsLimiter.check({ id: `${guard.admin.userId}:ai-diagnostics` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many AI diagnostics requests.", 429, headers);
  }

  return NextResponse.json(
    {
      data: getAiFoundationDiagnostics(),
      error: null,
      ok: true,
      request_id: randomUUID(),
    },
    { headers },
  );
}
