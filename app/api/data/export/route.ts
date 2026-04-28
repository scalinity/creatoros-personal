import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const exportQuerySchema = z.object({
  format: z.enum(["json"]).default("json"),
  include_logs: z.enum(["false", "true"]).optional().default("false"),
});

const exportLimiter = createFixedWindowRateLimiter({
  limit: 3,
  store: new MemoryRateLimitStore(),
  windowMs: 24 * 60 * 60 * 1_000,
});

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

  const query = exportQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));

  if (!query.success) {
    return errorResponse("validation_error", "Only JSON export scaffolding is available in this phase.", 400);
  }

  const decision = await exportLimiter.check({ id: `${guard.admin.userId}:data-export` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many data export requests.", 429, headers);
  }

  const exportedAt = new Date().toISOString();

  await logAuditEvent({
    actorEmail: guard.admin.email,
    eventType: "data_export_scaffolded",
    metadata: {
      format: query.data.format,
      include_logs: query.data.include_logs === "true",
      phase: "08-settings-diagnostics-env-security",
      scaffold_only: true,
    },
    request,
    success: true,
    targetType: "data_export",
    userId: guard.admin.userId,
  });

  return NextResponse.json(
    {
      data: {
        export_id: randomUUID(),
        exported_at: exportedAt,
        format: query.data.format,
        included: ["phase_08_status"],
        live: false,
        message: "Phase 08 export is a safe scaffold. Full data archive generation is deferred.",
        records: [],
        redaction: "Secrets, OAuth tokens, personal save tokens, encryption material, and service-role keys are excluded.",
        status: "scaffolded",
      },
      error: null,
      ok: true,
      request_id: randomUUID(),
    },
    { headers },
  );
}
