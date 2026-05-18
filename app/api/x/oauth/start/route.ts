import { NextResponse, type NextRequest } from "next/server";

import { logAuditEvent } from "@/lib/audit";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";
import { buildXAuthorizationUrl, createXCodeChallenge, createXCodeVerifier, createXOAuthState, getOptionalXOAuthConfig } from "@/lib/x/oauth";
import { persistOAuthState } from "@/lib/x/oauth-state";
import { xOAuthStartQuerySchema } from "@/lib/x/validation";

import { errorResponse } from "../../_utils";

export const dynamic = "force-dynamic";

const oauthStartLimiter = createFixedWindowRateLimiter({
  limit: 5,
  store: new MemoryRateLimitStore(),
  windowMs: 60_000,
});

// H-5: only the lookup key (state) goes in a cookie now. The PKCE verifier,
// requested scopes, mode, return_to, and the binding user_id all live in the
// x_oauth_states table and are removed by consumeOAuthState in the callback.
const stateCookieOptions = {
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

  try {
    await persistOAuthState({
      codeVerifier: verifier,
      mode: parsed.data.mode,
      returnTo: parsed.data.return_to,
      scopes,
      state,
      userId: guard.admin.userId,
    });
  } catch (error) {
    console.error("Failed to persist X OAuth state", { reason: error instanceof Error ? error.message : "unknown" });
    return errorResponse("internal_error", "Could not begin X OAuth flow.", 500, headers);
  }

  await logAuditEvent({
    actorEmail: guard.admin.email,
    eventType: parsed.data.mode === "publishing" ? "x_scope_escalation_started" : "x_connect_started",
    metadata: {
      mode: parsed.data.mode,
      phase: parsed.data.mode === "publishing" ? "17-x-write-publishing-adapter" : "16-x-oauth-and-read-sync",
      requested_scopes: scopes,
      return_to: parsed.data.return_to,
    },
    request,
    success: true,
    targetType: "x_connection",
    userId: guard.admin.userId,
  });

  const response = NextResponse.redirect(url, { headers });
  response.cookies.set("creatoros_x_oauth_state", state, stateCookieOptions);
  return response;
}
