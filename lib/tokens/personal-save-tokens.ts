import "server-only";

import { randomBytes as nodeRandomBytes } from "node:crypto";

import { logAuditEvent } from "@/lib/audit";
import type { AdminContext } from "@/lib/auth/admin";
import { nowIso } from "@/lib/db/json";
import { createSupabaseServiceRoleClient } from "@/lib/db/service-role";
import {
  getPersonalSaveTokenPrefix,
  hashPersonalSaveToken,
  verifyPersonalSaveToken,
} from "@/lib/security/personal-save-token";
import type { Database, PersonalSaveTokenRow } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

const PHASE = "20-inspiration-library-and-extension-save-token";
const TOKEN_SCOPE = "inspiration:create";
const TOKEN_PREFIX = "cos_live_";
const DEFAULT_RATE_LIMIT_PER_HOUR = 30;
const MAX_RATE_LIMIT_PER_HOUR = 240;

type TokenClient = SupabaseClient<Database>;

type TokenServiceOptions = {
  now?: () => Date;
  pepper?: string;
  randomBytes?: () => Buffer;
  serviceClient?: unknown;
};

export type PersonalSaveTokenRecord = {
  createdAt: string;
  expiresAt: null | string;
  id: string;
  lastUsedAt: null | string;
  name: string;
  rateLimitPerHour: number;
  revokedAt: null | string;
  scopes: string[];
  status: string;
  tokenPrefix: string;
  updatedAt: string;
};

export type PersonalSaveTokenCreateInput = {
  expiresAt?: null | string;
  name: string;
  rateLimitPerHour?: number;
};

export type PersonalSaveTokenRevokeInput = {
  id: string;
  reason?: null | string;
};

export type PersonalSaveTokenRotateInput = {
  id: string;
};

export type VerifiedPersonalSaveToken = {
  rateLimitPerHour: number;
  token: PersonalSaveTokenRecord;
  userId: string;
};

export type TokenVerificationResult =
  | { error: "expired_token" | "inactive_token" | "invalid_token" | "missing_scope" | "missing_token"; ok: false }
  | ({ ok: true } & VerifiedPersonalSaveToken);

function serviceClient(options: TokenServiceOptions = {}) {
  return (options.serviceClient ?? createSupabaseServiceRoleClient()) as TokenClient;
}

function cleanName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Token name is required.");
  return trimmed.slice(0, 120);
}

function cleanReason(reason?: null | string) {
  const trimmed = reason?.trim();
  return trimmed ? trimmed.slice(0, 240) : null;
}

function cleanRateLimit(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_RATE_LIMIT_PER_HOUR;
  return Math.min(MAX_RATE_LIMIT_PER_HOUR, Math.max(1, Math.floor(value)));
}

function cleanExpiresAt(value?: null | string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Token expiry must be a valid date.");
  return date.toISOString();
}

function randomTokenBytes(options: TokenServiceOptions = {}) {
  return options.randomBytes?.() ?? nodeRandomBytes(32);
}

export function generatePersonalSaveToken(options: TokenServiceOptions = {}) {
  return `${TOKEN_PREFIX}${randomTokenBytes(options).toString("base64url")}`;
}

function toTokenRecord(row: Pick<PersonalSaveTokenRow, "created_at" | "expires_at" | "id" | "last_used_at" | "name" | "rate_limit_per_hour" | "revoked_at" | "scopes" | "status" | "token_prefix" | "updated_at">): PersonalSaveTokenRecord {
  return {
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.id,
    lastUsedAt: row.last_used_at,
    name: row.name,
    rateLimitPerHour: row.rate_limit_per_hour,
    revokedAt: row.revoked_at,
    scopes: row.scopes,
    status: row.status,
    tokenPrefix: row.token_prefix,
    updatedAt: row.updated_at,
  };
}

async function auditToken(admin: AdminContext, eventType: string, tokenId: string | null, metadata: Record<string, unknown>, success = true, error?: string) {
  await logAuditEvent({
    actorEmail: admin.email,
    error: error ?? null,
    eventType,
    metadata: { phase: PHASE, ...metadata },
    success,
    targetId: tokenId,
    targetType: "personal_save_token",
    userId: admin.userId,
  });
}

export async function listPersonalSaveTokens(admin: AdminContext) {
  const { data, error } = await admin.supabase
    .from("personal_save_tokens")
    .select("id,name,token_prefix,scopes,status,created_at,updated_at,last_used_at,revoked_at,expires_at,rate_limit_per_hour")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load personal save tokens: ${error.message}`);
  }

  return (data ?? []).map((row) => toTokenRecord(row as PersonalSaveTokenRow));
}

export async function createPersonalSaveToken(
  admin: AdminContext,
  input: PersonalSaveTokenCreateInput,
  options: TokenServiceOptions = {},
) {
  const rawToken = generatePersonalSaveToken(options);
  const tokenHash = hashPersonalSaveToken(rawToken, { pepper: options.pepper });
  const tokenPrefix = getPersonalSaveTokenPrefix(rawToken);
  const insert = {
    expires_at: cleanExpiresAt(input.expiresAt),
    metadata: { phase: PHASE },
    name: cleanName(input.name),
    rate_limit_per_hour: cleanRateLimit(input.rateLimitPerHour),
    scopes: [TOKEN_SCOPE],
    status: "active",
    token_hash: tokenHash,
    token_prefix: tokenPrefix,
    user_id: admin.userId,
  };

  const { data, error } = await serviceClient(options)
    .from("personal_save_tokens")
    .insert(insert)
    .select("id,name,token_prefix,scopes,status,created_at,updated_at,last_used_at,revoked_at,expires_at,rate_limit_per_hour")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create personal save token: ${error?.message ?? "missing row"}`);
  }

  const token = toTokenRecord(data as PersonalSaveTokenRow);
  await auditToken(admin, "personal_save_token_created", token.id, {
    rate_limit_per_hour: token.rateLimitPerHour,
    scopes: token.scopes,
    token_prefix: token.tokenPrefix,
  });

  return { rawToken, token };
}

export async function revokePersonalSaveToken(
  admin: AdminContext,
  input: PersonalSaveTokenRevokeInput,
  options: TokenServiceOptions = {},
) {
  const revokedAt = nowIso(options.now);
  const reason = cleanReason(input.reason);
  const { data, error } = await serviceClient(options)
    .from("personal_save_tokens")
    .update({
      metadata: { phase: PHASE, revocation_reason: reason },
      revoked_at: revokedAt,
      status: "revoked",
    })
    .eq("id", input.id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .select("id,name,token_prefix,scopes,status,created_at,updated_at,last_used_at,revoked_at,expires_at,rate_limit_per_hour")
    .single();

  if (error || !data) {
    throw new Error(`Failed to revoke personal save token: ${error?.message ?? "missing row"}`);
  }

  const token = toTokenRecord(data as PersonalSaveTokenRow);
  await auditToken(admin, "personal_save_token_revoked", token.id, {
    reason,
    token_prefix: token.tokenPrefix,
  });

  return token;
}

async function loadTokenForRotation(admin: AdminContext, tokenId: string, options: TokenServiceOptions) {
  const { data, error } = await serviceClient(options)
    .from("personal_save_tokens")
    .select("*")
    .eq("id", tokenId)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    throw new Error(`Personal save token not found: ${error?.message ?? "missing row"}`);
  }

  return data as PersonalSaveTokenRow;
}

export async function rotatePersonalSaveToken(
  admin: AdminContext,
  input: PersonalSaveTokenRotateInput,
  options: TokenServiceOptions = {},
) {
  const previous = await loadTokenForRotation(admin, input.id, options);

  if (previous.status !== "revoked") {
    await revokePersonalSaveToken(admin, { id: input.id, reason: "rotated" }, options);
  }

  const created = await createPersonalSaveToken(
    admin,
    {
      expiresAt: previous.expires_at,
      name: previous.name,
      rateLimitPerHour: previous.rate_limit_per_hour,
    },
    options,
  );

  await auditToken(admin, "personal_save_token_rotated", created.token.id, {
    previous_token_id: previous.id,
    previous_token_prefix: previous.token_prefix,
    token_prefix: created.token.tokenPrefix,
  });

  return created;
}

function isExpired(row: PersonalSaveTokenRow, at: Date) {
  if (!row.expires_at) return false;
  const expiry = new Date(row.expires_at);
  return Number.isFinite(expiry.getTime()) && expiry.getTime() <= at.getTime();
}

export async function verifyPersonalSaveTokenForScope(
  rawToken: null | string | undefined,
  scope: string = TOKEN_SCOPE,
  options: TokenServiceOptions = {},
): Promise<TokenVerificationResult> {
  const token = rawToken?.trim();
  if (!token) return { error: "missing_token", ok: false };

  const prefix = getPersonalSaveTokenPrefix(token);
  const { data, error } = await serviceClient(options)
    .from("personal_save_tokens")
    .select("*")
    .eq("token_prefix", prefix)
    .is("deleted_at", null)
    .limit(10);

  if (error) {
    console.error("Failed to verify personal save token", { reason: error.message });
    return { error: "invalid_token", ok: false };
  }

  const rows = (data ?? []) as PersonalSaveTokenRow[];
  const matched = rows.find((row) => verifyPersonalSaveToken(token, row.token_hash, { pepper: options.pepper }));

  if (!matched) return { error: "invalid_token", ok: false };
  if (matched.status !== "active" || matched.revoked_at) return { error: "inactive_token", ok: false };
  if (isExpired(matched, options.now?.() ?? new Date())) return { error: "expired_token", ok: false };
  if (!matched.scopes.includes(scope)) return { error: "missing_scope", ok: false };

  return {
    ok: true,
    rateLimitPerHour: matched.rate_limit_per_hour,
    token: toTokenRecord(matched),
    userId: matched.user_id,
  };
}

export async function markPersonalSaveTokenUsed(tokenId: string, userId: string, options: TokenServiceOptions = {}) {
  const { error } = await serviceClient(options)
    .from("personal_save_tokens")
    .update({ last_used_at: nowIso(options.now) })
    .eq("id", tokenId)
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) {
    console.error("Failed to mark personal save token used", {
      reason: error.message,
      tokenId,
    });
  }
}

export const PERSONAL_SAVE_TOKEN_SCOPE = TOKEN_SCOPE;
