import type { NextRequest } from "next/server";

import { handleXPublishRoute } from "../_utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleXPublishRoute(request, ["quote_post"], "x-publish-quote");
}
