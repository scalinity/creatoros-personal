import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { normalizeEmail } from "@/lib/auth/allowlist";
import { getSupabaseServiceRoleConfig } from "@/lib/auth/config";
import { getE2eSupabaseClient, shouldUseE2eServiceRoleClient } from "@/lib/testing/e2e-fixtures";
import type { Database } from "@/types/database";

import { redactAuditMetadata, redactAuditString } from "./redaction";

type AuditRequest = {
  headers: Headers;
  url?: string;
};

export type AuditEventInput = {
  actorEmail?: null | string;
  error?: null | string;
  eventType: string;
  metadata?: unknown;
  request?: AuditRequest | null;
  success?: boolean;
  targetId?: null | string;
  targetType?: null | string;
  userId?: null | string;
};

let serviceRoleClient: null | SupabaseClient<Database> = null;

function getServiceRoleClient() {
  if (shouldUseE2eServiceRoleClient()) {
    return getE2eSupabaseClient();
  }

  if (serviceRoleClient) {
    return serviceRoleClient;
  }

  const { serviceRoleKey, url } = getSupabaseServiceRoleConfig();

  serviceRoleClient = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return serviceRoleClient;
}

function hashIpAddress(ipAddress: null | string) {
  if (!ipAddress) {
    return null;
  }

  return createHash("sha256").update(ipAddress).digest("hex");
}

function requestMetadata(request?: AuditRequest | null) {
  if (!request) {
    return {
      ipHash: null,
      userAgent: null,
    };
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipAddress = forwardedFor || request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");

  return {
    ipHash: hashIpAddress(ipAddress),
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
  };
}

export async function logAuditEvent(input: AuditEventInput) {
  try {
    const { ipHash, userAgent } = requestMetadata(input.request);
    const metadata = redactAuditMetadata({
      ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {}),
      request_id: randomUUID(),
      request_path: input.request?.url ? new URL(input.request.url).pathname : undefined,
    });

    const { error } = await getServiceRoleClient().from("audit_logs").insert({
      actor_email: normalizeEmail(input.actorEmail),
      error: input.error ? redactAuditString(input.error).slice(0, 500) : null,
      event_type: input.eventType,
      ip_hash: ipHash,
      metadata,
      success: input.success ?? true,
      target_id: input.targetId ?? null,
      target_type: input.targetType ?? null,
      user_agent: userAgent,
      user_id: input.userId ?? null,
    });

    if (error) {
      throw error;
    }

    return { ok: true as const };
  } catch (error) {
    console.error("Failed to write audit event", {
      eventType: input.eventType,
      reason: error instanceof Error ? error.message : "unknown",
    });

    return { ok: false as const };
  }
}

