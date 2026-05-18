// SCA-486 (W-7): envelope/errorResponse/readJsonBody now live in
// lib/http/envelope.ts. This module keeps only the publishing-specific
// error classifier that maps domain error subclasses to HTTP statuses.

import {
  envelope,
  errorEnvelope,
  errorResponse,
  getRequestId,
  readBoundedJsonBody,
  readJsonBody,
  REQUEST_ID_HEADER,
} from "@/lib/http/envelope";
import { PublishingNotFoundError, XPublishingGuardError } from "@/lib/publishing";

export {
  envelope,
  errorEnvelope,
  errorResponse,
  getRequestId,
  readBoundedJsonBody,
  readJsonBody,
  REQUEST_ID_HEADER,
};

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

export function publishingErrorResponse(
  requestId: string,
  error: unknown,
  fallbackMessage: string,
  headers?: Record<string, string>,
) {
  if (error instanceof XPublishingGuardError) {
    if (GUARD_CONFLICT_CODES.has(error.code)) {
      return errorResponse(requestId, error.code, fallbackMessage, 409, headers);
    }
  }

  // SCA-475 (C-5): typed not-found sentinel — no more substring matching on
  // error.message. Plain Error throws now fall through to 500 as intended.
  if (error instanceof PublishingNotFoundError) {
    return errorResponse(requestId, "not_found", fallbackMessage, 404, headers);
  }

  return errorResponse(requestId, "internal_error", fallbackMessage, 500, headers);
}
