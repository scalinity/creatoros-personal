import { NextResponse, type NextRequest } from "next/server";

import { logAuditEvent } from "@/lib/audit";
import { requireAdminForRoute } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { buildXAuthorizationUrl, createXCodeChallenge, createXCodeVerifier, createXOAuthState, getOptionalXOAuthConfig } from "@/lib/x/oauth";
import { xScopeEscalationSchema } from "@/lib/x/validation";

import { errorResponse, getRequestId, readJsonBody } from "../_utils";

export const dynamic = "force-dynamic";

const scopeEscalationLimiter = createFixedWindowRateLimiter({
  limit: 3,
  windowMs: 60 * 60 * 1_000,
});

const cookieOptions = {
  httpOnly: true,
  maxAge: 10 * 60,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const guard = await requireAdminForRoute(request);

  if (!guard.ok) return guard.response;

  const decision = await scopeEscalationLimiter.check({ id: `${guard.admin.userId}:x-scope-escalation` });
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    return errorResponse(requestId, "rate_limited", "Too many X scope escalation requests.", 429, headers);
  }

  const parsed = xScopeEscalationSchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return errorResponse(requestId, "validation_error", "X scope escalation payload failed validation.", 400, headers);
  }

  if (!getOptionalXOAuthConfig()) {
    return errorResponse(requestId, "provider_unavailable", "X OAuth configuration is incomplete.", 503, headers);
  }

  const state = createXOAuthState();
  const verifier = createXCodeVerifier();
  const challenge = createXCodeChallenge(verifier);
  const { scopes, url } = buildXAuthorizationUrl({
    codeChallenge: challenge,
    mode: "publishing",
    publishingScopes: parsed.data.requestedScopes,
    returnTo: parsed.data.returnTo,
    state,
  });

  await logAuditEvent({
    actorEmail: guard.admin.email,
    eventType: "x_scope_escalation_started",
    metadata: {
      phase: "17-x-write-publishing-adapter",
      reason: parsed.data.reason,
      request_id: requestId,
      requested_scopes: parsed.data.requestedScopes,
      scopes,
    },
    request,
    success: true,
    targetType: "x_connection",
    userId: guard.admin.userId,
  });

  const response = NextResponse.redirect(url, { headers, status: 303 });
  response.cookies.set("creatoros_x_oauth_state", state, cookieOptions);
  response.cookies.set("creatoros_x_oauth_verifier", verifier, cookieOptions);
  response.cookies.set("creatoros_x_oauth_return_to", parsed.data.returnTo, cookieOptions);
  response.cookies.set("creatoros_x_oauth_scopes", scopes.join(" "), cookieOptions);
  response.cookies.set("creatoros_x_oauth_mode", "publishing", cookieOptions);

  return response;
}
