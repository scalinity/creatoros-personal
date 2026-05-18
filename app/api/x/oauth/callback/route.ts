import { NextResponse, type NextRequest } from "next/server";

import { logAuditEvent, logSafeError } from "@/lib/audit";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createLiveXApiClient } from "@/lib/x/client";
import { exchangeXAuthorizationCode, storeXOAuthConnection } from "@/lib/x/oauth";
import { consumeOAuthState } from "@/lib/x/oauth-state";
import { xOAuthCallbackQuerySchema } from "@/lib/x/validation";

import { errorResponse, getRequestId } from "../../_utils";

export const dynamic = "force-dynamic";

const oauthCallbackLimiter = createFixedWindowRateLimiter({
  limit: 10,
  windowMs: 60_000,
});

// Only the state cookie remains. Verifier/scopes/mode/return_to are all loaded
// from the server-side x_oauth_states row.
const stateCookieName = "creatoros_x_oauth_state";

function redirectWithNotice(request: NextRequest, returnTo: string, notice: string, headers?: Record<string, string>) {
  let url = new URL(returnTo, request.nextUrl.origin);
  if (url.origin !== request.nextUrl.origin) {
    url = new URL("/settings/x-connection", request.nextUrl.origin);
  }
  url.searchParams.set("notice", notice);
  const response = NextResponse.redirect(url, { headers });

  // Always clear the state cookie after a callback (success or failure).
  response.cookies.set(stateCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) {
    return guard.response;
  }

  const decision = await oauthCallbackLimiter.check({ id: `${guard.admin.userId}:x-oauth-callback` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many X OAuth callback requests.", 429, headers);
  }

  const parsed = xOAuthCallbackQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const cookieState = request.cookies.get(stateCookieName)?.value;

  if (!parsed.success || parsed.data.error || !parsed.data.code || !parsed.data.state || !cookieState || parsed.data.state !== cookieState) {
    await logAuditEvent({
      actorEmail: guard.admin.email,
      error: parsed.success ? parsed.data.error_description ?? parsed.data.error ?? "oauth_state_invalid" : "callback_validation_failed",
      eventType: "x_connect_failed",
      metadata: {
        phase: "16-x-oauth-and-read-sync",
        request_id: requestId,
        state_cookie_present: Boolean(cookieState),
      },
      request,
      success: false,
      targetType: "x_connection",
      userId: guard.admin.userId,
    });

    return redirectWithNotice(request, "/settings/x-connection", "x_connect_failed", headers);
  }

  // H-5: atomically consume the server-side state row. This rejects:
  //   * replays (consumed_at already set);
  //   * expired rows (older than STATE_TTL);
  //   * cross-user replays (user_id != guard.admin.userId).
  let stored;
  try {
    stored = await consumeOAuthState(parsed.data.state, guard.admin.userId);
  } catch (error) {
    // SCA-481 (W-2): scrub before forwarding to platform log stream.
    logSafeError("X OAuth state consume failed", error);
    await logAuditEvent({
      actorEmail: guard.admin.email,
      error: "state_consume_failed",
      eventType: "x_connect_failed",
      metadata: { phase: "16-x-oauth-and-read-sync", request_id: requestId },
      request,
      success: false,
      targetType: "x_connection",
      userId: guard.admin.userId,
    });
    return redirectWithNotice(request, "/settings/x-connection", "x_connect_failed", headers);
  }

  if (!stored) {
    await logAuditEvent({
      actorEmail: guard.admin.email,
      error: "state_not_found_or_replay",
      eventType: "x_connect_failed",
      metadata: { phase: "16-x-oauth-and-read-sync", request_id: requestId },
      request,
      success: false,
      targetType: "x_connection",
      userId: guard.admin.userId,
    });
    return redirectWithNotice(request, "/settings/x-connection", "x_connect_failed", headers);
  }

  const returnTo = stored.returnTo ?? "/settings/x-connection";

  try {
    const tokenSet = await exchangeXAuthorizationCode({ code: parsed.data.code, codeVerifier: stored.codeVerifier });
    const profile = await createLiveXApiClient(tokenSet.accessToken).getAuthenticatedUser();
    const connection = await storeXOAuthConnection(guard.admin, {
      profile,
      // M-6: pass the server-side recorded scopes (NOT a client cookie) so
      // capabilities can never be inferred from an attacker-controlled value.
      scopes: stored.scopes,
      tokenSet,
    });

    if (stored.mode === "publishing") {
      await logAuditEvent({
        actorEmail: guard.admin.email,
        eventType: "x_scope_escalation_completed",
        metadata: {
          capabilities: connection.capabilities,
          phase: "17-x-write-publishing-adapter",
          request_id: requestId,
          scopes: connection.scopes,
        },
        request,
        success: connection.capabilities.can_write_posts,
        targetId: connection.id,
        targetType: "x_connection",
        userId: guard.admin.userId,
      });
    }

    return redirectWithNotice(request, returnTo, connection.status === "connected" ? "x_connected" : "x_connect_degraded", headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown X OAuth callback failure";
    logSafeError("X OAuth callback failed", error);
    await logAuditEvent({
      actorEmail: guard.admin.email,
      error: message.slice(0, 500),
      eventType: "x_connect_failed",
      metadata: {
        phase: "16-x-oauth-and-read-sync",
        request_id: requestId,
      },
      request,
      success: false,
      targetType: "x_connection",
      userId: guard.admin.userId,
    });

    return redirectWithNotice(request, returnTo, "x_connect_failed", headers);
  }
}
