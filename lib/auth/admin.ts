import "server-only";

import { randomUUID } from "node:crypto";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

import { logAuditEvent } from "@/lib/audit";
import { getE2eAdminContext, shouldUseE2eAuthBypass } from "@/lib/testing/e2e-fixtures";
import type { Database } from "@/types/database";

import { authorizeAdminIdentity } from "./allowlist";
import { AuthConfigurationError } from "./config";
import { createSupabaseServerClient } from "./supabase";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type AdminContext = {
  email: string;
  supabase: SupabaseServerClient;
  user: User;
  userId: string;
};

type AdminAuthFailureCode = "access_denied" | "auth_unconfigured" | "unauthenticated";

type AdminAuthResult =
  | {
      admin: AdminContext;
      ok: true;
    }
  | {
      code: AdminAuthFailureCode;
      email?: null | string;
      ok: false;
      reason: string;
      status: 401 | 403 | 503;
      userId?: null | string;
    };

function authFailureMessage(code: AdminAuthFailureCode) {
  if (code === "unauthenticated") {
    return "Authentication is required.";
  }

  if (code === "auth_unconfigured") {
    return "Authentication is not configured.";
  }

  return "Admin access is required.";
}

async function auditDeniedAccess(result: Extract<AdminAuthResult, { ok: false }>, request?: NextRequest) {
  if (!result.userId && result.code === "unauthenticated") {
    return;
  }

  await logAuditEvent({
    actorEmail: result.email,
    error: result.reason,
    eventType: "admin_access_denied",
    metadata: {
      code: result.code,
      reason: result.reason,
    },
    request,
    success: false,
    userId: result.userId,
  });
}

export async function getAdminContext(options: { auditDenied?: boolean; request?: NextRequest } = {}) {
  if (await shouldUseE2eAuthBypass(options.request)) {
    return {
      admin: getE2eAdminContext(),
      ok: true,
    } satisfies AdminAuthResult;
  }

  let supabase: SupabaseServerClient;

  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return {
        code: "auth_unconfigured",
        ok: false,
        reason: "supabase_auth_env_missing",
        status: 503,
      } satisfies AdminAuthResult;
    }

    throw error;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      code: "unauthenticated",
      ok: false,
      reason: error?.message ?? "session_missing",
      status: 401,
    } satisfies AdminAuthResult;
  }

  const authorization = authorizeAdminIdentity(user, process.env.ADMIN_EMAILS);

  if (!authorization.ok) {
    const result = {
      code: "access_denied",
      email: authorization.email,
      ok: false,
      reason: authorization.reason,
      status: 403,
      userId: user.id,
    } satisfies AdminAuthResult;

    if (options.auditDenied) {
      await auditDeniedAccess(result, options.request);
    }

    return result;
  }

  return {
    admin: {
      email: authorization.email,
      supabase,
      user,
      userId: user.id,
    },
    ok: true,
  } satisfies AdminAuthResult;
}

export async function requireAdmin() {
  const result = await getAdminContext({ auditDenied: true });

  if (result.ok) {
    return result.admin;
  }

  if (result.code === "unauthenticated") {
    redirect("/login?error=unauthenticated");
  }

  if (result.code === "auth_unconfigured") {
    redirect("/login?error=auth_unconfigured");
  }

  redirect("/login?error=not_allowlisted");
}

export async function requireAdminForRoute(request: NextRequest) {
  const result = await getAdminContext({ auditDenied: true, request });

  if (result.ok) {
    return {
      admin: result.admin,
      ok: true as const,
    };
  }

  return {
    ok: false as const,
    response: NextResponse.json(
      {
        data: null,
        error: {
          code: result.code === "unauthenticated" ? "unauthenticated" : result.code === "access_denied" ? "access_denied" : "internal_error",
          message: authFailureMessage(result.code),
        },
        ok: false,
        request_id: randomUUID(),
      },
      {
        status: result.status,
      },
    ),
  };
}

export type { Database };
