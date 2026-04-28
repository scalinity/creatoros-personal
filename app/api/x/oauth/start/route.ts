import { NextResponse, type NextRequest } from "next/server";

import { logAuditEvent } from "@/lib/audit";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";
import { buildXAuthorizationUrl, createXCodeChallenge, createXCodeVerifier, createXOAuthState, getOptionalXOAuthConfig } from "@/lib/x/oauth";
import { xOAuthStartQuerySchema } from "@/lib/x/validation";

import { errorResponse } from "../../_utils";

export const dynamic = "force-dynamic";

const oauthStartLimiter = createFixedWindowRateLimiter({
  limit: 5,
  store: new MemoryRateLimitStore(),
  windowMs: 60_000,
});

const cookieOptions = {
  httpOnly: true,
  maxAge: 10 * 60,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export async function GET(request: NextRequest) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await oauthStartLimiter.check({ id: `${guard.admin.userId}:x-oauth-start` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many X OAuth start requests.", 429, headers);
  }

  const parsed = xOAuthStartQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));

  if (!parsed.success) {
    return errorResponse("validation_error", "X OAuth start query failed validation.", 400, headers);
  }

  if (parsed.data.mode === "publishing") {
    return errorResponse("capability_disabled", "Publishing scope escalation is deferred until Phase 17.", 409, headers);
  }

  if (!getOptionalXOAuthConfig()) {
    return errorResponse("provider_unavailable", "X OAuth configuration is incomplete.", 503, headers);
  }

  const state = createXOAuthState();
  const verifier = createXCodeVerifier();
  const challenge = createXCodeChallenge(verifier);
  const { scopes, url } = buildXAuthorizationUrl({
    codeChallenge: challenge,
    mode: parsed.data.mode,
    returnTo: parsed.data.return_to,
    state,
  });

  await logAuditEvent({
    actorEmail: guard.admin.email,
    eventType: "x_connect_started",
    metadata: {
      mode: parsed.data.mode,
      phase: "16-x-oauth-and-read-sync",
      requested_scopes: scopes,
      return_to: parsed.data.return_to,
    },
    request,
    success: true,
    targetType: "x_connection",
    userId: guard.admin.userId,
  });

  const response = NextResponse.redirect(url, { headers });
  response.cookies.set("creatoros_x_oauth_state", state, cookieOptions);
  response.cookies.set("creatoros_x_oauth_verifier", verifier, cookieOptions);
  response.cookies.set("creatoros_x_oauth_return_to", parsed.data.return_to, cookieOptions);
  response.cookies.set("creatoros_x_oauth_scopes", scopes.join(" "), cookieOptions);

  return response;
}
