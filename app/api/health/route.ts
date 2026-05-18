import { randomUUID } from "node:crypto";

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
  const status = diagnostics.env.valid ? 200 : 503;

  // L-21: route returns the standard `{ ok, data, error, request_id }` envelope
  // documented in API_CONTRACTS.md so health-check tooling can rely on the same
  // shape as every other admin route. The 503 case maps to ok:false with a
  // structured `env_invalid` code, while the body still includes the full
  // diagnostics blob in `data` for the operator's diagnostics view.
  if (status === 200) {
    return NextResponse.json(
      { data: diagnostics, error: null, ok: true, request_id: randomUUID() },
      { status },
    );
  }

  return NextResponse.json(
    {
      data: diagnostics,
      error: { code: "env_invalid", message: "One or more required environment variables are missing or invalid." },
      ok: false,
      request_id: randomUUID(),
    },
    { status },
  );
}
