import "server-only";

import { timingSafeEqual } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { logAuditEvent } from "@/lib/audit";
import type { AdminContext } from "@/lib/auth/admin";
import { createSupabaseServiceRoleClient } from "@/lib/db/service-role";
import { createFixedWindowRateLimiter, MemoryRateLimitStore, rateLimitHeaders, rateLimitIdFromRequest } from "@/lib/rate-limit";
import type { ProfileRow } from "@/types/database";

const cronAuthLimiter = createFixedWindowRateLimiter({
  limit: 30,
  store: new MemoryRateLimitStore(),
  windowMs: 60_000,
});

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" ? token ?? null : null;
}

function expectedCronSecret() {
  const secret = process.env.CRON_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

function firstAdminEmail() {
  return process.env.ADMIN_EMAILS?.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)[0] ?? null;
}

// Constant-time comparison so a single byte mismatch does not leak position
// information through response timing (CWE-208).
function constantTimeEqual(left: null | string, right: string) {
  if (!left) {
    return false;
  }

  const leftBuf = Buffer.from(left, "utf8");
  const rightBuf = Buffer.from(right, "utf8");

  if (leftBuf.length !== rightBuf.length) {
    return false;
  }

  return timingSafeEqual(leftBuf, rightBuf);
}

// L-1: assert the profile row has the shape AdminContext expects before
// returning, so future changes to either type break loudly on cron boot
// instead of as a silent runtime mismatch on a downstream call.
function assertProfileShape(row: null | ProfileRow): asserts row is ProfileRow {
  if (!row) {
    throw new Error("No admin profile is available for the cron job.");
  }
  if (typeof row.id !== "string" || row.id.length === 0) {
    throw new Error("Cron admin profile is missing a valid id.");
  }
  if (typeof row.email !== "string" || row.email.length === 0) {
    throw new Error("Cron admin profile is missing a valid email.");
  }
}

export async function loadCronAdminContext(): Promise<AdminContext> {
  const serviceClient = createSupabaseServiceRoleClient();
  const ownerEmail = firstAdminEmail();
  const query = ownerEmail
    ? serviceClient.from("profiles").select("*").eq("email", ownerEmail).limit(1)
    : serviceClient.from("profiles").select("*").eq("is_admin", true).limit(1);
  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load cron admin profile: ${error.message}`);
  }

  const profile = (data?.[0] ?? null) as null | ProfileRow;
  assertProfileShape(profile);

  return {
    email: profile.email,
    supabase: serviceClient,
    user: { id: profile.id, app_metadata: {}, aud: "authenticated", created_at: profile.created_at, user_metadata: {} },
    userId: profile.id,
  } as AdminContext;
}

export type CronAuthFailure = {
  ok: false;
  response: NextResponse;
};

export type CronAuthSuccess = {
  admin: AdminContext;
  ok: true;
};

export async function requireCronAuth(request: NextRequest, options: { route: string; phase?: string }): Promise<CronAuthFailure | CronAuthSuccess> {
  const expected = expectedCronSecret();
  const token = bearerToken(request);

  if (!expected || !constantTimeEqual(token, expected)) {
    const decision = await cronAuthLimiter.check({ id: rateLimitIdFromRequest(request, options.route) });
    const headers = rateLimitHeaders(decision);

    if (!decision.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          { data: null, error: { code: "rate_limited", message: "Too many cron authorization failures." }, ok: false },
          { status: 429, headers },
        ),
      };
    }

    await logAuditEvent({
      eventType: "cron_secret_invalid",
      metadata: {
        phase: options.phase ?? "23-hardening-export-delete-observability",
        route: options.route,
        secret_configured: Boolean(expected),
      },
      request,
      success: false,
      targetType: "cron_route",
    });

    return {
      ok: false,
      response: NextResponse.json(
        { data: null, error: { code: "cron_secret_invalid", message: "Cron authorization failed." }, ok: false },
        { status: 401, headers },
      ),
    };
  }

  try {
    const admin = await loadCronAdminContext();
    return { admin, ok: true };
  } catch (error) {
    console.error("Cron admin context load failed", {
      reason: error instanceof Error ? error.message : "unknown",
      route: options.route,
    });

    return {
      ok: false,
      response: NextResponse.json(
        { data: null, error: { code: "internal_error", message: "Cron admin context unavailable." }, ok: false },
        { status: 500 },
      ),
    };
  }
}
