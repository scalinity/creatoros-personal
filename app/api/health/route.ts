import type { NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { envelope, errorEnvelope, getRequestId } from "@/lib/http/envelope";
import { getFoundationDiagnostics } from "@/lib/server-only/diagnostics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
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
    return envelope(requestId, diagnostics, undefined, status);
  }

  return errorEnvelope(
    requestId,
    diagnostics,
    "env_invalid",
    "One or more required environment variables are missing or invalid.",
    status,
  );
}
