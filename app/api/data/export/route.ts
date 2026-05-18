import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit";
import { redactAuditString } from "@/lib/audit";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { buildDataExportCsv, createDataExportArchive } from "@/lib/exports";
import { envelope, errorResponse, getRequestId } from "@/lib/http/envelope";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const exportQuerySchema = z.object({
  format: z.enum(["csv", "json"]).default("json"),
  include_logs: z.enum(["false", "true"]).optional().default("false"),
});

const exportLimiter = createFixedWindowRateLimiter({
  limit: 3,
  windowMs: 24 * 60 * 60 * 1_000,
});

function exportHeaders(headers: Record<string, string>, format: "csv" | "json") {
  const extension = format === "csv" ? "csv" : "json";
  const contentType = format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";

  return {
    ...headers,
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="creatoros-data-export.${extension}"`,
    "Content-Type": contentType,
    // Prevent the browser from MIME-sniffing the export body and rendering it
    // inline as HTML if a malicious imported field happens to start with "<html".
    "X-Content-Type-Options": "nosniff",
  };
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const query = exportQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));

  if (!query.success) {
    return errorResponse(requestId, "validation_error", "Data export query failed validation.", 400);
  }

  const decision = await exportLimiter.check({ id: `${guard.admin.userId}:data-export` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many data export requests.", 429, headers);
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
        request_id: requestId,
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

    return envelope(requestId, archive, exportHeaders(headers, "json"));
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
        request_id: requestId,
      },
      request,
      success: false,
      targetType: "data_export",
      userId: guard.admin.userId,
    });

    console.error("Data export failed", { reason: message });
    return errorResponse(requestId, "internal_error", "Data export could not be generated.", 500, headers);
  }
}
