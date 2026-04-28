import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit";
import { redactAuditString } from "@/lib/audit/redaction";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { buildDataExportCsv, createDataExportArchive } from "@/lib/exports";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const exportQuerySchema = z.object({
  format: z.enum(["csv", "json"]).default("json"),
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

function exportHeaders(headers: Record<string, string>, format: "csv" | "json") {
  const extension = format === "csv" ? "csv" : "json";
  const contentType = format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";

  return {
    ...headers,
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="creatoros-data-export.${extension}"`,
    "Content-Type": contentType,
  };
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const query = exportQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));

  if (!query.success) {
    return errorResponse("validation_error", "Data export query failed validation.", 400);
  }

  const decision = await exportLimiter.check({ id: `${guard.admin.userId}:data-export` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many data export requests.", 429, headers);
  }

  try {
    const archive = await createDataExportArchive(guard.admin, {
      format: query.data.format,
      includeLogs: query.data.include_logs === "true",
    });

    await logAuditEvent({
      actorEmail: guard.admin.email,
      eventType: "data_exported",
      metadata: {
        format: query.data.format,
        include_logs: query.data.include_logs === "true",
        phase: archive.phase,
        tables: Object.keys(archive.tables),
      },
      request,
      success: true,
      targetType: "data_export",
      userId: guard.admin.userId,
    });

    if (query.data.format === "csv") {
      return new NextResponse(buildDataExportCsv(archive), {
        headers: exportHeaders(headers, "csv"),
        status: 200,
      });
    }

    return NextResponse.json(
      {
        data: archive,
        error: null,
        ok: true,
        request_id: randomUUID(),
      },
      { headers: exportHeaders(headers, "json") },
    );
  } catch (error) {
    const message = redactAuditString(error instanceof Error ? error.message : "unknown export failure").slice(0, 500);
    await logAuditEvent({
      actorEmail: guard.admin.email,
      error: message,
      eventType: "data_export_failed",
      metadata: {
        format: query.data.format,
        include_logs: query.data.include_logs === "true",
        phase: "23-hardening-export-delete-observability",
      },
      request,
      success: false,
      targetType: "data_export",
      userId: guard.admin.userId,
    });

    console.error("Data export failed", { reason: message });
    return errorResponse("internal_error", "Data export could not be generated.", 500, headers);
  }
}
