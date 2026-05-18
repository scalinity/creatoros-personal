import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";

import { normalizeEmail } from "@/lib/auth/allowlist";
// SCA-507 (S-1): share the cached service-role client with the rest of the
// repo instead of duplicating the singleton + factory inline. The deleted
// local getServiceRoleClient had its own E2E bypass + cache that drifted
// from lib/db/service-role.ts.
import { createSupabaseServiceRoleClient } from "@/lib/db/service-role";

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

function hashIpAddress(ipAddress: null | string) {
  if (!ipAddress) {
    return null;
  }

  // Without a server-side pepper a SHA-256 hash of an IPv4 address is reversible
  // by precomputing the entire 4.3B-key space. Use HMAC with AUDIT_IP_HASH_PEPPER
  // when present so the resulting hash is not rainbow-tableable.
  const pepper = process.env.AUDIT_IP_HASH_PEPPER?.trim();
  if (pepper && pepper.length > 0) {
    return createHmac("sha256", pepper).update(ipAddress).digest("hex");
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

    const { error } = await createSupabaseServiceRoleClient().from("audit_logs").insert({
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
    // SCA-481 (W-2): inline scrub (cannot import logSafeError from the barrel
    // here because lib/audit/log-safe.ts imports redaction which is fine, but
    // logger.ts is itself one of the things the barrel re-exports — keeping
    // this direct to avoid the cycle).
    const safeReason = error instanceof Error ? redactAuditString(error.message).slice(0, 500) : "unknown";
    console.error("Failed to write audit event", { eventType: input.eventType, reason: safeReason });

    return { ok: false as const };
  }
}

