import "server-only";

import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

// SCA-486 (W-7): canonical implementation of the JSON response envelope
// documented in docs/API_CONTRACTS.md:
//
//   { ok: boolean, data: T | null, error: { code, message } | null, request_id: string }
//
// Every route under app/api/** must import from here rather than reimplement.
//
// SCA-484 (W-5): request_id flows end-to-end. The route reads it once via
// `getRequestId(request)` (which honours an inbound `x-request-id` header
// when sane, otherwise mints a UUID) and passes the same value into every
// envelope call AND into `logAuditEvent` via metadata. This collapses what
// used to be N distinct request_ids per HTTP request into a single ID that
// stitches together response body + audit log + downstream services.

const REQUEST_ID_HEADER = "x-request-id";

// We mirror request_id back as a response header for clients that observe it
// out-of-band of the JSON body (curl pipelines, browser devtools network
// pane). Routes that pass custom headers will get this merged on top.
function withRequestIdHeader(headers: Record<string, string> | undefined, requestId: string): Record<string, string> {
  return { ...(headers ?? {}), [REQUEST_ID_HEADER]: requestId };
}

// Cheap sanity check on inbound x-request-id values — reject anything too
// long, with whitespace, or with control characters before echoing it to
// audit logs and response headers (CWE-117 log-injection / header injection).
function isAcceptableRequestId(value: string): boolean {
  if (value.length === 0 || value.length > 128) {
    return false;
  }
  return /^[\w.\-:]+$/.test(value);
}

export function getRequestId(request: null | Pick<NextRequest, "headers"> | Request | undefined): string {
  const inbound = request?.headers.get(REQUEST_ID_HEADER)?.trim();
  if (inbound && isAcceptableRequestId(inbound)) {
    return inbound;
  }
  return randomUUID();
}

export function envelope(
  requestId: string,
  data: unknown,
  headers?: Record<string, string>,
  status = 200,
): NextResponse {
  return NextResponse.json(
    { data, error: null, ok: true, request_id: requestId },
    { headers: withRequestIdHeader(headers, requestId), status },
  );
}

export function errorEnvelope(
  requestId: string,
  data: unknown,
  code: string,
  message: string,
  status: number,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    {
      data,
      error: { code, message },
      ok: false,
      request_id: requestId,
    },
    { headers: withRequestIdHeader(headers, requestId), status },
  );
}

export function errorResponse(
  requestId: string,
  code: string,
  message: string,
  status: number,
  headers?: Record<string, string>,
): NextResponse {
  return errorEnvelope(requestId, null, code, message, status, headers);
}

export async function readJsonBody<T = unknown>(request: NextRequest | Request): Promise<null | T> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

// SCA-493 (W-14): every JSON-accepting route handler MUST go through this
// helper so the request body is bounded before being parsed. CWE-770. The
// public extension save endpoint is reachable via bearer token without an
// admin session — an attacker with a stolen token previously could pin server
// memory by streaming a multi-GB body into bare `request.json()`.
//
// Returns a discriminated union so callers can early-return the response
// without scattering try/catch through every route. Malformed JSON falls
// through as `value: null` to preserve the existing Zod-validation pattern
// (the schema parse surfaces a 400 validation_error). Only an oversize
// payload short-circuits to a 413.
import { readJsonBodyWithLimit, RequestBodyTooLargeError } from "@/lib/server-only/request-body";

export type JsonBodyResult<T> =
  | { ok: false; response: NextResponse }
  | { ok: true; value: null | T };

export async function readBoundedJsonBody<T = unknown>(
  request: NextRequest | Request,
  requestId: string,
  options?: { headers?: Record<string, string>; limitBytes?: number },
): Promise<JsonBodyResult<T>> {
  try {
    const value = await readJsonBodyWithLimit<T>(request, options?.limitBytes);
    return { ok: true, value };
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return {
        ok: false,
        response: errorResponse(
          requestId,
          "request_too_large",
          `Request body exceeds the configured limit of ${error.limit} bytes.`,
          413,
          options?.headers,
        ),
      };
    }
    return { ok: true, value: null };
  }
}

export { REQUEST_ID_HEADER };
