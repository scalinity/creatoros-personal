import { type NextRequest } from "next/server";
import { z } from "zod";

import { redactAuditString } from "@/lib/audit";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { deleteOwnerData } from "@/lib/exports";
import { envelope, errorResponse, getRequestId, readBoundedJsonBody } from "@/lib/http/envelope";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const deleteBodySchema = z.object({
  confirmation: z.literal("DELETE_CREATOROS_PERSONAL_DATA"),
  delete_auth_user: z.boolean().optional().default(false),
});

const deleteLimiter = createFixedWindowRateLimiter({
  limit: 1,
  windowMs: 24 * 60 * 60 * 1_000,
});

export async function DELETE(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const bounded = await readBoundedJsonBody(request, requestId, { limitBytes: 1_000_000 });
  if (!bounded.ok) return bounded.response;
  const body = deleteBodySchema.safeParse(bounded.value);

  if (!body.success) {
    return errorResponse(
      requestId,
      "validation_error",
      "Exact confirmation is required. No data was deleted.",
      400,
    );
  }

  const decision = await deleteLimiter.check({ id: `${guard.admin.userId}:data-delete` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many data delete requests.", 429, headers);
  }

  try {
    const result = await deleteOwnerData(guard.admin, {
      confirmation: body.data.confirmation,
      deleteAuthUser: body.data.delete_auth_user,
    }, { request });

    return envelope(
      requestId,
      {
        ...result,
        live: true,
        message: "Owner data deletion completed. Token material was cleared before row deletion.",
        status: "deleted",
      },
      headers,
    );
  } catch (error) {
    const message = redactAuditString(error instanceof Error ? error.message : "unknown data delete failure").slice(0, 500);
    console.error("Data delete failed", { reason: message });
    return errorResponse(requestId, "internal_error", "Data deletion could not be completed.", 500, headers);
  }
}
