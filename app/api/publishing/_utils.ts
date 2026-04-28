import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

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

export function publishingErrorResponse(error: unknown, fallbackMessage: string, headers?: Record<string, string>) {
  const message = error instanceof Error ? error.message : "";

  if (message.toLowerCase().includes("not found")) {
    return errorResponse("not_found", fallbackMessage, 404, headers);
  }

  if (message.toLowerCase().includes("approved") || message.toLowerCase().includes("payload hash") || message.toLowerCase().includes("transition")) {
    return errorResponse("conflict", fallbackMessage, 409, headers);
  }

  return errorResponse("internal_error", fallbackMessage, 500, headers);
}
