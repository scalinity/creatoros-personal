import type { NextRequest } from "next/server";

import { handleXPublishRoute } from "../_utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleXPublishRoute(request, ["reply"], "x-publish-reply");
}
