import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAdminForRoute } from "@/lib/auth/admin";
import { createInspiration, saveInspirationWithExtensionToken } from "@/lib/inspiration";
import { inspirationSaveSchema } from "@/lib/inspiration/validation";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const inAppSaveLimiter = createFixedWindowRateLimiter({
  limit: 60,
  windowMs: 60 * 1_000,
});

function envelope(data: unknown, headers?: Record<string, string>, status = 200) {
  return NextResponse.json({ data, error: null, ok: true, request_id: randomUUID() }, { headers, status });
}

function errorResponse(code: string, message: string, status: number, headers?: Record<string, string>) {
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

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}

function configuredExtensionOrigins() {
  return new Set(
    (process.env.CHROME_EXTENSION_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function chromeExtensionOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin?.startsWith("chrome-extension://") ? origin : null;
}

function isAllowedExtensionOrigin(origin: string) {
  return configuredExtensionOrigins().has(origin);
}

function corsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const appOrigin = appUrl ? new URL(appUrl).origin : null;
  const extensionOrigin = origin?.startsWith("chrome-extension://") && isAllowedExtensionOrigin(origin) ? origin : null;
  const allowOrigin = origin && (origin === appOrigin || extensionOrigin) ? origin : null;

  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin, Vary: "Origin" } : {}),
  };
}

function extensionError(error: Exclude<Awaited<ReturnType<typeof saveInspirationWithExtensionToken>>, { ok: true }>["error"]) {
  if (error === "rate_limited") return { code: "rate_limited", message: "Extension save rate limit reached.", status: 429 };
  if (error === "validation_error") return { code: "validation_error", message: "Extension save payload failed validation.", status: 400 };
  if (error === "missing_scope") return { code: "missing_scope", message: "Personal save token lacks the required scope.", status: 403 };
  if (error === "expired_token" || error === "inactive_token") return { code: "access_denied", message: "Personal save token is not active.", status: 401 };
  if (error === "internal_error") return { code: "internal_error", message: "Extension save could not be completed.", status: 500 };
  return { code: "unauthenticated", message: "A valid personal save token is required.", status: 401 };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { headers: corsHeaders(request), status: 204 });
}

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  const token = bearerToken(request);
  const cors = corsHeaders(request);
  const extensionOrigin = chromeExtensionOrigin(request);

  if (extensionOrigin && !isAllowedExtensionOrigin(extensionOrigin)) {
    return errorResponse("access_denied", "Chrome extension origin is not allowed.", 403, cors);
  }

  // M-13: Bearer (extension) requests must come from an allowlisted
  // chrome-extension:// origin. Without this, a stolen personal save token
  // could be replayed from any web origin (or a curl call with a forged Origin
  // header) — the prior implementation only used CORS allowlisting which is a
  // browser-side check, not a server-side gate.
  const requestOrigin = request.headers.get("origin");
  if (token && requestOrigin && !extensionOrigin) {
    return errorResponse("access_denied", "Personal save tokens may only be used from an allowlisted Chrome extension origin.", 403, cors);
  }

  if (token) {
    try {
      const result = await saveInspirationWithExtensionToken(token, body, { request });
      if (!result.ok) {
        const mapped = extensionError(result.error);
        return errorResponse(mapped.code, mapped.message, mapped.status, cors);
      }

      return envelope(
        {
          duplicate: result.data.duplicate,
          inspiration_id: result.data.inspiration.id,
        },
        cors,
        result.data.duplicate ? 200 : 201,
      );
    } catch (error) {
      console.error("Extension inspiration save route failed", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      return errorResponse("internal_error", "Extension save could not be completed.", 500, cors);
    }
  }

  if (extensionOrigin) {
    return errorResponse("unauthenticated", "Extension saves require a personal save token.", 401, cors);
  }

  const guard = await requireAdminForRoute(request);
  if (!guard.ok) return guard.response;

  const decision = await inAppSaveLimiter.check({ id: `${guard.admin.userId}:inspiration:api-save` });
  const headers = { ...cors, ...rateLimitHeaders(decision) };

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many inspiration save requests.", 429, headers);
  }

  const parsed = inspirationSaveSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("validation_error", "Inspiration save payload failed validation.", 400, headers);
  }

  try {
    const result = await createInspiration(guard.admin, parsed.data, { source: "in_app" });
    return envelope(
      {
        duplicate: result.duplicate,
        inspiration_id: result.inspiration.id,
      },
      headers,
      result.duplicate ? 200 : 201,
    );
  } catch (error) {
    console.error("Inspiration save API failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse("internal_error", "Inspiration could not be saved.", 500, headers);
  }
}
