import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { PublishingNotFoundError, XPublishingGuardError } from "@/lib/publishing";

export function envelope(data: unknown, headers?: Record<string, string>) {
  return NextResponse.json({ data, error: null, ok: true, request_id: randomUUID() }, { headers });
}

export function errorResponse(code: string, message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json(
    {
      data: null,
      error: { code, message },
      ok: false,
      request_id: randomUUID(),
    },
    { headers, status },
  );
}

export async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// L-2: classify by structured error type / `code`, not by substring matching
// on `error.message`. The prior approach broke on i18n / message rewording.
const GUARD_CONFLICT_CODES = new Set([
  "approval_required",
  "capability_disabled",
  "confirmation_required",
  "missing_scope",
  "payload_mismatch",
  "status_conflict",
  "x_connection_unavailable",
]);

export function publishingErrorResponse(error: unknown, fallbackMessage: string, headers?: Record<string, string>) {
  if (error instanceof XPublishingGuardError) {
    if (GUARD_CONFLICT_CODES.has(error.code)) {
      return errorResponse(error.code, fallbackMessage, 409, headers);
    }
  }

  // SCA-475 (C-5): typed not-found sentinel — no more substring matching on
  // error.message. Plain Error throws now fall through to 500 as intended.
  if (error instanceof PublishingNotFoundError) {
    return errorResponse("not_found", fallbackMessage, 404, headers);
  }

  return errorResponse("internal_error", fallbackMessage, 500, headers);
}
