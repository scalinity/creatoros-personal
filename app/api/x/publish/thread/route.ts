import type { NextRequest } from "next/server";

import { handleXPublishRoute } from "../_utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleXPublishRoute(request, ["blog_to_x_series", "blog_to_x_thread", "campaign_sequence", "thread"], "x-publish-thread");
}
