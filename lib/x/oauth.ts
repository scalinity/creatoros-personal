import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logAuditEvent } from "@/lib/audit";
import type { AdminContext } from "@/lib/auth/admin";
import { createSupabaseServiceRoleClient } from "@/lib/db/service-role";
import { decryptToken, encryptToken } from "@/lib/security/encryption";
import type { Database, Json, XConnectionRow } from "@/types/database";

export type XOAuthMode = "publishing" | "read";
export type XConnectionStatus = "connected" | "degraded" | "disconnected" | "pending" | "revoked";

export type XCapabilities = {
  can_delete_posts: boolean;
  can_read_metrics: boolean;
  can_read_private_metrics: boolean;
  can_read_user_posts: boolean;
  can_upload_media: boolean;
  can_write_posts: boolean;
  can_write_quotes: boolean;
  can_write_replies: boolean;
  enterprise_analytics_enabled: boolean;
  enterprise_quote_post_enabled: boolean;
  enterprise_streams_enabled: boolean;
};

export type XOAuthConfig = {
  clientId: string;
  clientSecret: string;
  defaultScopes: string[];
  publishingScopes: string[];
  redirectUri: string;
};

export type XTokenSet = {
  accessToken: string;
  expiresAt: string;
  refreshToken: null | string;
  scope?: null | string;
};

export type XProfile = {
  avatarUrl: null | string;
  displayName: null | string;
  id: string;
  username: string;
};

export type SanitizedXConnection = {
  avatarUrl: null | string;
  capabilities: XCapabilities;
  displayName: null | string;
  id: string;
  lastError: null | string;
  lastSyncedAt: null | string;
  scopes: string[];
  status: XConnectionStatus;
  tokenExpiresAt: null | string;
  username: null | string;
  xUserId: null | string;
};

export type DecryptedXConnection = SanitizedXConnection & {
  accessToken: string;
  encryptedRefreshToken: null | string;
  refreshToken: null | string;
};

type StoreClient = SupabaseClient<Database>;

const X_AUTHORIZE_ENDPOINT = "https://x.com/i/oauth2/authorize";
const X_TOKEN_ENDPOINT = "https://api.x.com/2/oauth2/token";
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1_000;

const fallbackDefaultScopes = ["tweet.read", "users.read", "offline.access", "like.read", "bookmark.read", "follows.read", "list.read"];
const fallbackPublishingScopes = ["tweet.write", "media.write"];

function cleanString(value: null | string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function requireEnvValue(value: null | string | undefined, key: string) {
  const cleaned = cleanString(value);

  if (!cleaned) {
    throw new Error(`${key} is missing or invalid.`);
  }

  return cleaned;
}

function tokenPurpose(kind: "access" | "refresh", userId: string) {
  return `x-${kind}:${userId}`;
}

function encryptedJsonMetadata(input: Record<string, Json | undefined>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Record<string, Json>;
}

function basicAuthHeader(config: XOAuthConfig) {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

function tokenExpiry(expiresInSeconds: unknown) {
  const seconds = typeof expiresInSeconds === "number" && Number.isFinite(expiresInSeconds) ? expiresInSeconds : 7_200;
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

function assertTokenPayload(payload: unknown): XTokenSet {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("X OAuth token response was malformed.");
  }

  const record = payload as Record<string, unknown>;
  const accessToken = typeof record.access_token === "string" ? record.access_token : null;

  if (!accessToken) {
    throw new Error("X OAuth token response did not include an access token.");
  }

  return {
    accessToken,
    expiresAt: tokenExpiry(record.expires_in),
    refreshToken: typeof record.refresh_token === "string" && record.refresh_token.length > 0 ? record.refresh_token : null,
    scope: typeof record.scope === "string" ? record.scope : null,
  };
}

export function normalizeXScopes(scopes: readonly string[] | string | null | undefined) {
  const rawScopes = Array.isArray(scopes) ? scopes : String(scopes ?? "").split(/\s+/);
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const scope of rawScopes) {
    const cleaned = scope.trim();

    if (!cleaned || seen.has(cleaned)) {
      continue;
    }

    seen.add(cleaned);
    normalized.push(cleaned);
  }

  return normalized;
}

export function deriveXCapabilities(scopes: readonly string[], overrides: Partial<Pick<XCapabilities, "enterprise_analytics_enabled" | "enterprise_quote_post_enabled" | "enterprise_streams_enabled">> = {}): XCapabilities {
  const scopeSet = new Set(normalizeXScopes(scopes));
  const hasTweetRead = scopeSet.has("tweet.read");
  const hasUsersRead = scopeSet.has("users.read");
  const hasTweetWrite = scopeSet.has("tweet.write");
  const enterpriseQuote = overrides.enterprise_quote_post_enabled ?? false;

  return {
    can_delete_posts: false,
    can_read_metrics: hasTweetRead,
    can_read_private_metrics: Boolean(overrides.enterprise_analytics_enabled && hasTweetRead && hasUsersRead),
    can_read_user_posts: hasTweetRead && hasUsersRead,
    can_upload_media: scopeSet.has("media.write"),
    can_write_posts: hasTweetWrite,
    can_write_quotes: hasTweetWrite && enterpriseQuote,
    can_write_replies: hasTweetWrite,
    enterprise_analytics_enabled: overrides.enterprise_analytics_enabled ?? false,
    enterprise_quote_post_enabled: enterpriseQuote,
    enterprise_streams_enabled: overrides.enterprise_streams_enabled ?? false,
  };
}

export function getXOAuthConfig(source: NodeJS.ProcessEnv = process.env): XOAuthConfig {
  return {
    clientId: requireEnvValue(source.X_CLIENT_ID, "X_CLIENT_ID"),
    clientSecret: requireEnvValue(source.X_CLIENT_SECRET, "X_CLIENT_SECRET"),
    defaultScopes: normalizeXScopes(source.X_DEFAULT_SCOPES ?? fallbackDefaultScopes),
    publishingScopes: normalizeXScopes(source.X_PUBLISHING_SCOPES ?? fallbackPublishingScopes),
    redirectUri: requireEnvValue(source.X_REDIRECT_URI, "X_REDIRECT_URI"),
  };
}

export function getOptionalXOAuthConfig(source: NodeJS.ProcessEnv = process.env) {
  try {
    return getXOAuthConfig(source);
  } catch {
    return null;
  }
}

export function createXOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function createXCodeVerifier() {
  return randomBytes(48).toString("base64url");
}

export function createXCodeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildXAuthorizationUrl(input: {
  codeChallenge: string;
  mode?: XOAuthMode;
  returnTo?: null | string;
  state: string;
}, source: NodeJS.ProcessEnv = process.env) {
  const config = getXOAuthConfig(source);
  const scopes = input.mode === "publishing" ? normalizeXScopes([...config.defaultScopes, ...config.publishingScopes]) : config.defaultScopes;
  const url = new URL(X_AUTHORIZE_ENDPOINT);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { scopes, url };
}

export async function exchangeXAuthorizationCode(input: { code: string; codeVerifier: string }, options: { fetchImpl?: typeof fetch; source?: NodeJS.ProcessEnv } = {}) {
  const config = getXOAuthConfig(options.source ?? process.env);
  const body = new URLSearchParams({
    client_id: config.clientId,
    code: input.code,
    code_verifier: input.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  const response = await (options.fetchImpl ?? fetch)(X_TOKEN_ENDPOINT, {
    body,
    headers: {
      Authorization: basicAuthHeader(config),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`X OAuth code exchange failed with status ${response.status}.`);
  }

  return assertTokenPayload(await response.json());
}

export async function refreshXOAuthToken(refreshToken: string, options: { fetchImpl?: typeof fetch; source?: NodeJS.ProcessEnv } = {}) {
  const config = getXOAuthConfig(options.source ?? process.env);
  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await (options.fetchImpl ?? fetch)(X_TOKEN_ENDPOINT, {
    body,
    headers: {
      Authorization: basicAuthHeader(config),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`X OAuth refresh failed with status ${response.status}.`);
  }

  return assertTokenPayload(await response.json());
}

export function shouldRefreshXToken(expiresAt: null | string, at = Date.now()) {
  if (!expiresAt) {
    return false;
  }

  const expiryMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiryMs) && expiryMs - at <= TOKEN_REFRESH_WINDOW_MS;
}

export async function storeXOAuthConnection(
  admin: AdminContext,
  input: {
    profile: XProfile;
    scopes: readonly string[];
    tokenSet: XTokenSet;
  },
  options: { client?: StoreClient } = {},
) {
  const client = options.client ?? createSupabaseServiceRoleClient();
  const scopes = normalizeXScopes(input.tokenSet.scope ?? input.scopes);
  const capabilities = deriveXCapabilities(scopes);
  const payload = {
    avatar_url: input.profile.avatarUrl,
    capabilities: capabilities as unknown as Json,
    deleted_at: null,
    display_name: input.profile.displayName,
    encrypted_access_token: encryptToken(input.tokenSet.accessToken, { purpose: tokenPurpose("access", admin.userId) }),
    encrypted_refresh_token: input.tokenSet.refreshToken ? encryptToken(input.tokenSet.refreshToken, { purpose: tokenPurpose("refresh", admin.userId) }) : null,
    last_error: null,
    metadata: encryptedJsonMetadata({
      connected_at: new Date().toISOString(),
      phase: "16-x-oauth-and-read-sync",
      token_key_version: "v1",
      token_storage: "aes-256-gcm",
    }),
    scopes,
    status: "connected",
    token_expires_at: input.tokenSet.expiresAt,
    user_id: admin.userId,
    username: input.profile.username,
    x_user_id: input.profile.id,
  } satisfies Database["public"]["Tables"]["x_connections"]["Insert"];

  const { data, error } = await client.from("x_connections").upsert(payload, { onConflict: "user_id" }).select().single();

  if (error || !data) {
    throw new Error(`Failed to store X connection: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "x_connected",
    metadata: {
      capabilities,
      phase: "16-x-oauth-and-read-sync",
      scopes,
      token_storage: "encrypted",
      username: input.profile.username,
      x_user_id: input.profile.id,
    },
    success: true,
    targetId: data.id,
    targetType: "x_connection",
    userId: admin.userId,
  });

  return sanitizeXConnection(data);
}

export async function refreshStoredXConnection(
  admin: AdminContext,
  connection: DecryptedXConnection,
  options: { client?: StoreClient; fetchImpl?: typeof fetch; source?: NodeJS.ProcessEnv } = {},
) {
  if (!connection.refreshToken) {
    throw new Error("X refresh token is not available. Reconnect X with offline.access.");
  }

  try {
    const refreshed = await refreshXOAuthToken(connection.refreshToken, options);
    const encryptedRefreshToken = refreshed.refreshToken
      ? encryptToken(refreshed.refreshToken, { purpose: tokenPurpose("refresh", admin.userId) })
      : connection.encryptedRefreshToken;
    const refreshedScopes = normalizeXScopes(refreshed.scope ?? connection.scopes);
    const refreshedCapabilities = deriveXCapabilities(refreshedScopes, {
      enterprise_analytics_enabled: connection.capabilities.enterprise_analytics_enabled,
      enterprise_quote_post_enabled: connection.capabilities.enterprise_quote_post_enabled,
      enterprise_streams_enabled: connection.capabilities.enterprise_streams_enabled,
    });
    const { error } = await (options.client ?? createSupabaseServiceRoleClient())
      .from("x_connections")
      .update({
        capabilities: refreshedCapabilities as unknown as Json,
        encrypted_access_token: encryptToken(refreshed.accessToken, { purpose: tokenPurpose("access", admin.userId) }),
        encrypted_refresh_token: encryptedRefreshToken,
        last_error: null,
        scopes: refreshedScopes,
        status: "connected",
        token_expires_at: refreshed.expiresAt,
      })
      .eq("user_id", admin.userId);

    if (error) {
      throw new Error(error.message);
    }

    return {
      ...connection,
      accessToken: refreshed.accessToken,
      encryptedRefreshToken,
      refreshToken: refreshed.refreshToken ?? connection.refreshToken,
      scopes: refreshedScopes,
      status: "connected" as const,
      tokenExpiresAt: refreshed.expiresAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown refresh failure";
    await markXConnectionDegraded(admin, message, options.client);
    await logAuditEvent({
      actorEmail: admin.email,
      error: message,
      eventType: "x_token_refresh_failed",
      metadata: { phase: "16-x-oauth-and-read-sync" },
      success: false,
      targetId: connection.id,
      targetType: "x_connection",
      userId: admin.userId,
    });
    throw error;
  }
}

export async function markXConnectionDegraded(admin: AdminContext, message: string, client: StoreClient = createSupabaseServiceRoleClient()) {
  const sanitized = message.slice(0, 500);
  const { error } = await client
    .from("x_connections")
    .update({
      last_error: sanitized,
      status: "degraded",
    })
    .eq("user_id", admin.userId);

  if (error) {
    throw new Error(`Failed to mark X connection degraded: ${error.message}`);
  }
}

export async function disconnectXConnection(admin: AdminContext, options: { client?: StoreClient; deleteImportedPosts?: boolean; deleteSnapshots?: boolean } = {}) {
  const client = options.client ?? createSupabaseServiceRoleClient();
  const { data, error } = await client
    .from("x_connections")
    .update({
      capabilities: deriveXCapabilities([]) as unknown as Json,
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      last_error: null,
      metadata: encryptedJsonMetadata({
        disconnected_at: new Date().toISOString(),
        phase: "16-x-oauth-and-read-sync",
        preserved_imported_posts: options.deleteImportedPosts ? false : true,
        preserved_snapshots: options.deleteSnapshots ? false : true,
      }),
      scopes: [],
      status: "disconnected",
      token_expires_at: null,
    })
    .eq("user_id", admin.userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to disconnect X: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "x_disconnected",
    metadata: {
      delete_imported_posts: options.deleteImportedPosts ?? false,
      delete_snapshots: options.deleteSnapshots ?? false,
      phase: "16-x-oauth-and-read-sync",
      token_material_deleted: true,
    },
    success: true,
    targetId: data.id,
    targetType: "x_connection",
    userId: admin.userId,
  });

  return sanitizeXConnection(data);
}

export function sanitizeXConnection(row: XConnectionRow): SanitizedXConnection {
  return {
    avatarUrl: row.avatar_url,
    capabilities: parseCapabilities(row.capabilities),
    displayName: row.display_name,
    id: row.id,
    lastError: row.last_error,
    lastSyncedAt: row.last_synced_at,
    scopes: normalizeXScopes(row.scopes),
    status: parseConnectionStatus(row.status),
    tokenExpiresAt: row.token_expires_at,
    username: row.username,
    xUserId: row.x_user_id,
  };
}

export async function loadXConnectionStatus(admin: AdminContext) {
  const { data, error } = await admin.supabase
    .from("x_connections")
    .select("id,user_id,x_user_id,username,display_name,avatar_url,token_expires_at,scopes,status,capabilities,last_synced_at,last_error,metadata,created_at,updated_at,deleted_at")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load X connection: ${error.message}`);
  }

  return data ? sanitizeXConnection(data as XConnectionRow) : null;
}

export async function loadDecryptedXConnection(admin: AdminContext, options: { client?: StoreClient } = {}) {
  const { data, error } = await (options.client ?? createSupabaseServiceRoleClient())
    .from("x_connections")
    .select("*")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load X connection: ${error.message}`);
  }

  if (!data || !["connected", "degraded"].includes(data.status) || !data.encrypted_access_token) {
    throw new Error("X is not connected.");
  }

  return {
    ...sanitizeXConnection(data),
    accessToken: decryptToken(data.encrypted_access_token, { purpose: tokenPurpose("access", admin.userId) }),
    encryptedRefreshToken: data.encrypted_refresh_token,
    refreshToken: data.encrypted_refresh_token ? decryptToken(data.encrypted_refresh_token, { purpose: tokenPurpose("refresh", admin.userId) }) : null,
  } satisfies DecryptedXConnection;
}

function parseConnectionStatus(value: string): XConnectionStatus {
  if (["connected", "degraded", "disconnected", "pending", "revoked"].includes(value)) {
    return value as XConnectionStatus;
  }

  return "degraded";
}

export function parseCapabilities(value: Json): XCapabilities {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const bool = (key: keyof XCapabilities) => record[key] === true;

  return {
    can_delete_posts: bool("can_delete_posts"),
    can_read_metrics: bool("can_read_metrics"),
    can_read_private_metrics: bool("can_read_private_metrics"),
    can_read_user_posts: bool("can_read_user_posts"),
    can_upload_media: bool("can_upload_media"),
    can_write_posts: bool("can_write_posts"),
    can_write_quotes: bool("can_write_quotes"),
    can_write_replies: bool("can_write_replies"),
    enterprise_analytics_enabled: bool("enterprise_analytics_enabled"),
    enterprise_quote_post_enabled: bool("enterprise_quote_post_enabled"),
    enterprise_streams_enabled: bool("enterprise_streams_enabled"),
  };
}
