import { type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { disconnectXConnection } from "@/lib/x/oauth";
import { xDisconnectSchema } from "@/lib/x/validation";

import { envelope, errorResponse, getRequestId, readJsonBody } from "../_utils";

export const dynamic = "force-dynamic";

const disconnectLimiter = createFixedWindowRateLimiter({
  limit: 10,
  windowMs: 60_000,
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await disconnectLimiter.check({ id: `${guard.admin.userId}:x-disconnect` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many X disconnect requests.", 429, headers);
  }

  const parsed = xDisconnectSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "X disconnect payload failed validation.", 400, headers);
  }

  try {
    const connection = await disconnectXConnection(guard.admin, {
      deleteImportedPosts: parsed.data.delete_imported_posts,
      deleteSnapshots: parsed.data.delete_snapshots,
    });

    return envelope(requestId, { connection }, headers);
  } catch (error) {
    console.error("X disconnect failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, "internal_error", "X connection could not be disconnected.", 500, headers);
  }
}
