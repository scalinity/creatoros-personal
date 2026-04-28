import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const deleteBodySchema = z.object({
  confirmation: z.literal("DELETE_CREATOROS_PERSONAL_DATA"),
  delete_auth_user: z.boolean().optional().default(false),
});

const deleteLimiter = createFixedWindowRateLimiter({
  limit: 1,
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

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const body = deleteBodySchema.safeParse(await readJsonBody(request));

  if (!body.success) {
    return errorResponse(
      "validation_error",
      "Exact confirmation is required. No data was deleted.",
      400,
    );
  }

  const decision = await deleteLimiter.check({ id: `${guard.admin.userId}:data-delete` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many data delete requests.", 429, headers);
  }

  await logAuditEvent({
    actorEmail: guard.admin.email,
    eventType: "data_delete_scaffolded",
    metadata: {
      delete_auth_user: body.data.delete_auth_user,
      deleted_rows: 0,
      phase: "08-settings-diagnostics-env-security",
      scaffold_only: true,
    },
    request,
    success: true,
    targetType: "data_delete",
    userId: guard.admin.userId,
  });

  return NextResponse.json(
    {
      data: {
        deleted_rows: 0,
        live: false,
        message: "Phase 08 delete is a guarded no-op scaffold. No database rows or auth users were deleted.",
        status: "scaffolded",
        token_material_deleted: false,
      },
      error: null,
      ok: true,
      request_id: randomUUID(),
    },
    { headers },
  );
}
