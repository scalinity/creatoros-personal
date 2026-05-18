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

  if (text.length > limit) {
    throw new RequestBodyTooLargeError(limit);
  }

  return JSON.parse(text) as T;
}
