import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

export function envelope(data: unknown, headers?: Record<string, string>, status = 200) {
  return NextResponse.json({ data, error: null, ok: true, request_id: randomUUID() }, { headers, status });
}

export function errorEnvelope(data: unknown, code: string, message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json(
    {
      data,
      error: { code, message },
      ok: false,
      request_id: randomUUID(),
    },
    { headers, status },
  );
}

export function errorResponse(code: string, message: string, status: number, headers?: Record<string, string>) {
  return errorEnvelope(null, code, message, status, headers);
}

export async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
