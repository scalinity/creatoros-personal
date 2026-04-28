import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { redactAuditString } from "@/lib/audit/redaction";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { deleteOwnerData } from "@/lib/exports";
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

  try {
    const result = await deleteOwnerData(guard.admin, {
      confirmation: body.data.confirmation,
      deleteAuthUser: body.data.delete_auth_user,
    }, { request });

    return NextResponse.json(
      {
        data: {
          ...result,
          live: true,
          message: "Owner data deletion completed. Token material was cleared before row deletion.",
          status: "deleted",
        },
        error: null,
        ok: true,
        request_id: randomUUID(),
      },
      { headers },
    );
  } catch (error) {
    const message = redactAuditString(error instanceof Error ? error.message : "unknown data delete failure").slice(0, 500);
    console.error("Data delete failed", { reason: message });
    return errorResponse("internal_error", "Data deletion could not be completed.", 500, headers);
  }
}
