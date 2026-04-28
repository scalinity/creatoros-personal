import { NextResponse, type NextRequest } from "next/server";

import { logAuditEvent } from "@/lib/audit";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders } from "@/lib/rate-limit";
import { createLiveXApiClient } from "@/lib/x/client";
import { exchangeXAuthorizationCode, normalizeXScopes, storeXOAuthConnection } from "@/lib/x/oauth";
import { xOAuthCallbackQuerySchema } from "@/lib/x/validation";

import { errorResponse } from "../../_utils";

export const dynamic = "force-dynamic";

const oauthCallbackLimiter = createFixedWindowRateLimiter({
  limit: 10,
  store: new MemoryRateLimitStore(),
  windowMs: 60_000,
});

const oauthCookieNames = ["creatoros_x_oauth_state", "creatoros_x_oauth_verifier", "creatoros_x_oauth_return_to", "creatoros_x_oauth_scopes"] as const;

function redirectWithNotice(returnTo: string, notice: string, headers?: Record<string, string>) {
  const url = new URL(returnTo, "http://creatoros.local");
  url.searchParams.set("notice", notice);
  const response = NextResponse.redirect(`${url.pathname}${url.search}`, { headers });

  for (const name of oauthCookieNames) {
    response.cookies.set(name, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await oauthCallbackLimiter.check({ id: `${guard.admin.userId}:x-oauth-callback` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse("rate_limited", "Too many X OAuth callback requests.", 429, headers);
  }

  const parsed = xOAuthCallbackQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const returnTo = request.cookies.get("creatoros_x_oauth_return_to")?.value ?? "/settings/x-connection";
  const expectedState = request.cookies.get("creatoros_x_oauth_state")?.value;
  const verifier = request.cookies.get("creatoros_x_oauth_verifier")?.value;
  const requestedScopes = normalizeXScopes(request.cookies.get("creatoros_x_oauth_scopes")?.value);

  if (!parsed.success || parsed.data.error || !parsed.data.code || !parsed.data.state || !expectedState || parsed.data.state !== expectedState || !verifier) {
    await logAuditEvent({
      actorEmail: guard.admin.email,
      error: parsed.success ? parsed.data.error_description ?? parsed.data.error ?? "oauth_state_invalid" : "callback_validation_failed",
      eventType: "x_connect_failed",
      metadata: {
        phase: "16-x-oauth-and-read-sync",
        state_present: Boolean(expectedState),
      },
      request,
      success: false,
      targetType: "x_connection",
      userId: guard.admin.userId,
    });

    return redirectWithNotice(returnTo, "x_connect_failed", headers);
  }

  try {
    const tokenSet = await exchangeXAuthorizationCode({ code: parsed.data.code, codeVerifier: verifier });
    const profile = await createLiveXApiClient(tokenSet.accessToken).getAuthenticatedUser();
    const connection = await storeXOAuthConnection(guard.admin, {
      profile,
      scopes: requestedScopes,
      tokenSet,
    });

    return redirectWithNotice(returnTo, connection.status === "connected" ? "x_connected" : "x_connect_degraded", headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown X OAuth callback failure";
    console.error("X OAuth callback failed", { reason: message });
    await logAuditEvent({
      actorEmail: guard.admin.email,
      error: message.slice(0, 500),
      eventType: "x_connect_failed",
      metadata: {
        phase: "16-x-oauth-and-read-sync",
      },
      request,
      success: false,
      targetType: "x_connection",
      userId: guard.admin.userId,
    });

    return redirectWithNotice(returnTo, "x_connect_failed", headers);
  }
}
