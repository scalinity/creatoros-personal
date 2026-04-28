import { type NextRequest } from "next/server";

import type { AdminContext } from "@/lib/auth/admin";
import { createSupabaseServiceRoleClient } from "@/lib/db/service-role";
import { runScheduledPublishingExecutor } from "@/lib/publishing";
import type { ProfileRow } from "@/types/database";

import { envelope, errorResponse } from "../../x/_utils";

export const dynamic = "force-dynamic";

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

async function loadCronAdminContext(): Promise<AdminContext> {
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

  if (!profile) {
    throw new Error("No admin profile is available for scheduled publishing.");
  }

  return {
    email: profile.email,
    supabase: serviceClient,
    user: { id: profile.id, app_metadata: {}, aud: "authenticated", created_at: profile.created_at, user_metadata: {} },
    userId: profile.id,
  } as AdminContext;
}

export async function GET(request: NextRequest) {
  const expected = expectedCronSecret();

  if (!expected || bearerToken(request) !== expected) {
    return errorResponse("cron_secret_invalid", "Cron authorization failed.", 401);
  }

  try {
    const admin = await loadCronAdminContext();
    const result = await runScheduledPublishingExecutor(admin, {
      request,
      serviceClient: admin.supabase,
    });

    return envelope({ publishing_executor: result });
  } catch (error) {
    console.error("Scheduled publishing executor failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse("internal_error", "Scheduled publishing executor could not run.", 500);
  }
}
