import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { getFoundationDiagnostics } from "@/lib/server-only/diagnostics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const diagnostics = getFoundationDiagnostics();

  return NextResponse.json(diagnostics, {
    status: diagnostics.env.valid ? 200 : 503,
  });
}
