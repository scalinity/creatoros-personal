import { type NextRequest } from "next/server";

import { requireCronAuth } from "@/lib/auth/cron";
import { runScheduledPublishingExecutor } from "@/lib/publishing";

import { envelope, errorResponse, getRequestId } from "../../x/_utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const auth = await requireCronAuth(request, { route: "cron:publish" });

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await runScheduledPublishingExecutor(auth.admin, {
      request,
      serviceClient: auth.admin.supabase,
    });

    return envelope(requestId, { publishing_executor: result });
  } catch (error) {
    console.error("Scheduled publishing executor failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(requestId, "internal_error", "Scheduled publishing executor could not run.", 500);
  }
}
