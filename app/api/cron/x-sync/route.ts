import { type NextRequest } from "next/server";

import { requireCronAuth } from "@/lib/auth/cron";
import { runXReadSync } from "@/lib/x/sync";

import { envelope, errorResponse, getRequestId } from "../../x/_utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const auth = await requireCronAuth(request, { route: "cron:x-sync" });

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await runXReadSync(
      auth.admin,
      {
        includeMetrics: true,
        maxPosts: 25,
        mode: "live",
      },
      {
        request,
        serviceClient: auth.admin.supabase,
      },
    );

    return envelope(requestId, { sync_job: result });
  } catch (error) {
    console.error("Scheduled X sync failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, "internal_error", "Scheduled X sync could not run.", 500);
  }
}
