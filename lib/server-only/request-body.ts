import "server-only";

import type { NextRequest } from "next/server";

// Default upper bound for JSON body parsing. Routes that accept large imports
// (e.g. /api/posts/import) override via the second argument.
export const DEFAULT_JSON_BODY_LIMIT_BYTES = 1_000_000; // 1 MB

export class RequestBodyTooLargeError extends Error {
  override readonly name = "RequestBodyTooLargeError";
  readonly limit: number;

  constructor(limit: number) {
    super(`Request body exceeds the configured limit of ${limit} bytes.`);
    this.limit = limit;
  }
}

// Reads the request body as text up to `limit` bytes, then `JSON.parse`s it.
// Reading as text first lets us reject oversize payloads before allocating a
// nested object structure — `request.json()` does not honour Next.js body-
// parser limits for route handlers.
//
// SCA-493 (W-14): byte count uses `Buffer.byteLength(text, "utf8")` so the
// limit is the wire-size, not the UTF-16 code-unit count. A 1 MB cap was
// previously off by up to 3× for non-ASCII payloads (CJK, emoji).
export async function readJsonBodyWithLimit<T = unknown>(
  request: NextRequest | Request,
  limit: number = DEFAULT_JSON_BODY_LIMIT_BYTES,
): Promise<T> {
  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > limit) {
      throw new RequestBodyTooLargeError(limit);
    }
  }

  const text = await request.text();

  if (Buffer.byteLength(text, "utf8") > limit) {
    throw new RequestBodyTooLargeError(limit);
  }

  return JSON.parse(text) as T;
}
