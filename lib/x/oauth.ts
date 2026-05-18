import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logAuditEvent, logSafeError } from "@/lib/audit";
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

// =============================================================================
// SCA-509 (S-3): lib/x/oauth.ts is the X OAuth entry point. The file is large
// because it bundles several cooperating concerns:
//
//   1. Types & capabilities derivation (scopes -> capability flags + overrides).
//   2. OAuth start (PKCE verifier/challenge, state, authorization URL builder).
//   3. OAuth callback (token exchange, payload validation, expiry parsing).
//   4. Token refresh (refreshStoredXConnection, transient vs invalid_grant
//      classification, AAD re-encryption on success).
//   5. Token storage / decrypt / sanitization (AAD versioning, legacy purposes,
//      sanitizeXConnection for browser-safe rows).
//   6. Connection state transitions (markXConnectionDegraded /
//      markXConnectionRevoked, message scrubbing).
//   7. Disconnect + revoke (X /oauth2/revoke for access + refresh, then wipe).
//
// Per SCA-526 (S-20): no line numbers in the section names — they drift on
// every edit. Section names alone navigate the file via grep.
// =============================================================================

const X_AUTHORIZE_ENDPOINT = "https://x.com/i/oauth2/authorize";
const X_TOKEN_ENDPOINT = "https://api.x.com/2/oauth2/token";
const X_REVOKE_ENDPOINT = "https://api.x.com/2/oauth2/revoke";
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1_000;
const X_OAUTH_FETCH_TIMEOUT_MS = 30_000;
// SCA-523 (S-17): X's OAuth2 token response usually includes expires_in.
// When it's absent or unparsable we fall back to 2h — that matches the
// access-token lifetime X documents in the public OAuth2 docs and is the
// conservative choice (we'll attempt refresh earlier than necessary
// rather than later).
const OAUTH_EXPIRES_IN_FALLBACK_S = 7_200;
const SANITIZED_OAUTH_ERROR_LIMIT = 500;

// Defend the request handler against a hung X token endpoint. Without an
// explicit timeout the fetch will pin a Vercel function for the platform max,
// burning invocation budget and leaving publishing_jobs in `running` forever.
function fetchWithOauthTimeout(fetchImpl: typeof fetch, input: string, init: RequestInit) {
  return fetchImpl(input, { ...init, signal: AbortSignal.timeout(X_OAUTH_FETCH_TIMEOUT_MS) });
}

const fallbackDefaultScopes = ["tweet.read", "users.read", "offline.access", "like.read", "bookmark.read", "follows.read", "list.read"];
const fallbackPublishingScopes = ["tweet.write", "media.write"];
const allowedPublishingScopes = new Set(fallbackPublishingScopes);

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

// M-8: AAD format is `x-${kind}:${userId}:k1`. The trailing `k1` is the key
// version slot; bumping it forces a new AAD so a rotated ENCRYPTION_KEY can
// decrypt only fresh rows. `tokenLegacyPurposes` returns prior AAD shapes so
// existing pre-k1 rows continue to decrypt without a backfill — the next write
// rolls them onto the current AAD naturally.
const TOKEN_KEY_VERSION = "k1";

function tokenPurpose(kind: "access" | "refresh", userId: string) {
  return `x-${kind}:${userId}:${TOKEN_KEY_VERSION}`;
}

function tokenLegacyPurposes(kind: "access" | "refresh", userId: string) {
  return [`x-${kind}:${userId}`];
}

function encryptedJsonMetadata(input: Record<string, Json | undefined>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Record<string, Json>;
}

function basicAuthHeader(config: XOAuthConfig) {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

function tokenExpiry(expiresInSeconds: unknown) {
  // Some OAuth servers return expires_in as a string; coerce numeric strings as
  // well as numbers so we don't silently fall back to the 2h default and miss a
  // shorter actual lifetime.
  const numeric =
    typeof expiresInSeconds === "number"
      ? expiresInSeconds
      : typeof expiresInSeconds === "string"
        ? Number(expiresInSeconds.trim())
        : NaN;
  const seconds = Number.isFinite(numeric) && numeric > 0 ? numeric : OAUTH_EXPIRES_IN_FALLBACK_S;
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

function normalizeXPublishingScopes(scopes: readonly string[] | string | null | undefined) {
  return normalizeXScopes(scopes).filter((scope) => allowedPublishingScopes.has(scope));
}

export function deriveXCapabilities(scopes: readonly string[], overrides: Partial<Pick<XCapabilities, "enterprise_analytics_enabled" | "enterprise_quote_post_enabled" | "enterprise_streams_enabled">> = {}): XCapabilities {
  const scopeSet = new Set(normalizeXScopes(scopes));
  const hasTweetRead = scopeSet.has("tweet.read");
  const hasUsersRead = scopeSet.has("users.read");
  const hasTweetWrite = scopeSet.has("tweet.write");
  const enterpriseQuote = overrides.enterprise_quote_post_enabled ?? false;

  return {
    can_delete_posts: hasTweetWrite,
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

function optionalBooleanFlag(value: null | string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function getXCapabilityOverrides(source: NodeJS.ProcessEnv = process.env) {
  return {
    enterprise_analytics_enabled: optionalBooleanFlag(source.X_ENTERPRISE_ANALYTICS_ENABLED),
    enterprise_quote_post_enabled: optionalBooleanFlag(source.X_ENTERPRISE_QUOTE_POST_ENABLED),
    enterprise_streams_enabled: optionalBooleanFlag(source.X_ENTERPRISE_STREAMS_ENABLED),
  } satisfies Partial<Pick<XCapabilities, "enterprise_analytics_enabled" | "enterprise_quote_post_enabled" | "enterprise_streams_enabled">>;
}

export function getXOAuthConfig(source: NodeJS.ProcessEnv = process.env): XOAuthConfig {
  return {
    clientId: requireEnvValue(source.X_CLIENT_ID, "X_CLIENT_ID"),
    clientSecret: requireEnvValue(source.X_CLIENT_SECRET, "X_CLIENT_SECRET"),
    defaultScopes: normalizeXScopes(source.X_DEFAULT_SCOPES ?? fallbackDefaultScopes),
    publishingScopes: normalizeXPublishingScopes(source.X_PUBLISHING_SCOPES ?? fallbackPublishingScopes),
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
  publishingScopes?: readonly string[];
  returnTo?: null | string;
  state: string;
}, source: NodeJS.ProcessEnv = process.env) {
  const config = getXOAuthConfig(source);
  const writeScopes = normalizeXPublishingScopes(input.publishingScopes ?? config.publishingScopes);
  const scopes = input.mode === "publishing" ? normalizeXScopes([...config.defaultScopes, ...writeScopes]) : config.defaultScopes;
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
  let response: Response;
  try {
    response = await fetchWithOauthTimeout(options.fetchImpl ?? fetch, X_TOKEN_ENDPOINT, {
      body,
      headers: {
        Authorization: basicAuthHeader(config),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("X OAuth code exchange timed out.");
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`X OAuth code exchange failed with status ${response.status}.`);
  }

  return assertTokenPayload(await response.json());
}

// M-7: distinguish "refresh token is no longer valid" (X returned 4xx with
// invalid_grant or invalid_client) from a transient 5xx / network error so the
// caller can mark the connection `revoked` vs `degraded`.
export class XOAuthRefreshError extends Error {
  override name = "XOAuthRefreshError";

  constructor(
    message: string,
    public readonly kind: "invalid_grant" | "transient" | "unknown",
    public readonly status: null | number = null,
  ) {
    super(message);
  }
}

// SCA-501 (W-22): max attempts before declaring the connection degraded.
// One initial attempt + two retries on transient classification (5xx/network/
// timeout/bare-401). invalid_grant short-circuits — no point retrying when
// the refresh token itself is no longer valid.
const X_OAUTH_REFRESH_MAX_ATTEMPTS = 3;
const X_OAUTH_REFRESH_RETRY_DELAY_MS = 250;

export async function refreshXOAuthToken(refreshToken: string, options: { fetchImpl?: typeof fetch; source?: NodeJS.ProcessEnv } = {}) {
  const config = getXOAuthConfig(options.source ?? process.env);
  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  async function attemptRefresh(): Promise<Response> {
    try {
      return await fetchWithOauthTimeout(options.fetchImpl ?? fetch, X_TOKEN_ENDPOINT, {
        body,
        headers: {
          Authorization: basicAuthHeader(config),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new XOAuthRefreshError("X OAuth refresh timed out.", "transient");
      }
      throw new XOAuthRefreshError(error instanceof Error ? error.message : "x_oauth_refresh_network", "transient");
    }
  }

  // SCA-501 (W-22): retry transient classifications (network / 5xx / bare 401)
  // before persisting `degraded`. The classification already distinguished
  // invalid_grant from transient — now we actually act on it. A single 5xx
  // blip during a cron sync no longer forces a connection state transition.
  let response: Response | null = null;
  let lastTransientError: null | XOAuthRefreshError = null;
  for (let attempt = 0; attempt < X_OAUTH_REFRESH_MAX_ATTEMPTS; attempt += 1) {
    try {
      response = await attemptRefresh();
      if (response.ok) break;
      // Non-2xx: check whether to retry. Clone the body before consuming.
      const clone = response.clone();
      let bodyJson: unknown = null;
      try { bodyJson = await clone.json(); } catch { /* classify by status alone */ }
      const errorCode = bodyJson && typeof bodyJson === "object" && !Array.isArray(bodyJson)
        ? String((bodyJson as Record<string, unknown>).error ?? "")
        : "";
      const isInvalidGrant = response.status >= 400 && response.status < 500
        && (errorCode === "invalid_grant" || errorCode === "invalid_client" || errorCode === "invalid_request");
      if (isInvalidGrant || attempt >= X_OAUTH_REFRESH_MAX_ATTEMPTS - 1) break;
      // transient: small backoff before retry. Don't loop forever — bounded by attempts.
      await new Promise((resolve) => setTimeout(resolve, X_OAUTH_REFRESH_RETRY_DELAY_MS * (attempt + 1)));
    } catch (error) {
      if (!(error instanceof XOAuthRefreshError) || error.kind !== "transient") throw error;
      lastTransientError = error;
      if (attempt >= X_OAUTH_REFRESH_MAX_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, X_OAUTH_REFRESH_RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  if (!response) {
    throw lastTransientError ?? new XOAuthRefreshError("X OAuth refresh exhausted retries.", "transient");
  }

  if (!response.ok) {
    let bodyJson: unknown = null;
    try {
      bodyJson = await response.json();
    } catch {
      // ignore parse errors; classify by status alone
    }
    const errorCode = bodyJson && typeof bodyJson === "object" && !Array.isArray(bodyJson)
      ? String((bodyJson as Record<string, unknown>).error ?? "")
      : "";
    // SCA-502 (W-23): only classify as invalid_grant when the response body
    // explicitly carries an OAuth error code. A bare 401 with empty body
    // (transient WAF / upstream auth blip) used to force `revoked` and a full
    // reconnect; now it's classified `transient` so the next attempt can
    // recover without owner intervention.
    const isInvalidGrant = response.status >= 400 && response.status < 500
      && (errorCode === "invalid_grant" || errorCode === "invalid_client" || errorCode === "invalid_request");
    const kind = isInvalidGrant ? "invalid_grant" : response.status >= 500 || response.status === 401 ? "transient" : "unknown";
    throw new XOAuthRefreshError(
      `X OAuth refresh failed with status ${response.status}.`,
      kind,
      response.status,
    );
  }

  return assertTokenPayload(await response.json());
}

export function shouldRefreshXToken(expiresAt: null | string, at = Date.now()) {
  // Treat missing or unparseable expiry as "needs refresh" so a corrupted /
  // never-stored expiry does not trap us into using a stale token until X
  // returns 401 — that path is more expensive than a proactive refresh.
  if (!expiresAt) {
    return true;
  }

  const expiryMs = new Date(expiresAt).getTime();

  if (!Number.isFinite(expiryMs)) {
    return true;
  }

  return expiryMs - at <= TOKEN_REFRESH_WINDOW_MS;
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
  // M-6: prefer the scope string returned by X. The fallback (`input.scopes`)
  // must come from the server-side x_oauth_states row, NOT a client cookie or
  // request body. Callers in app/api/x/oauth/callback/route.ts already pass the
  // server-recorded scopes; this comment exists to make that contract sticky.
  const scopes = normalizeXScopes(input.tokenSet.scope ?? input.scopes);
  const capabilities = deriveXCapabilities(scopes, getXCapabilityOverrides());
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
    // L-15: when X does not return a new refresh_token, re-encrypt the existing
    // plaintext (decrypted earlier) under the current purpose/key version. This
    // upgrades pre-k1 ciphertext to the current AAD on every refresh and
    // ensures we never persist legacy ciphertext indefinitely.
    const encryptedRefreshToken = refreshed.refreshToken
      ? encryptToken(refreshed.refreshToken, { purpose: tokenPurpose("refresh", admin.userId) })
      : encryptToken(connection.refreshToken, { purpose: tokenPurpose("refresh", admin.userId) });
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
    // M-7: hard-failure (invalid_grant / 401) means the refresh token is no
    // longer valid at X. Mark `revoked` so the connection cannot be silently
    // re-used and the owner sees a clear "reconnect" prompt. Transient errors
    // (5xx, network, timeout) keep the connection in `degraded` so the next
    // attempt can recover without forcing a full reconnect.
    const kind = error instanceof XOAuthRefreshError ? error.kind : "unknown";
    if (kind === "invalid_grant") {
      await markXConnectionRevoked(admin, message, options.client);
    } else {
      await markXConnectionDegraded(admin, message, options.client);
    }
    await logAuditEvent({
      actorEmail: admin.email,
      error: message,
      eventType: "x_token_refresh_failed",
      metadata: { kind, phase: "16-x-oauth-and-read-sync" },
      success: false,
      targetId: connection.id,
      targetType: "x_connection",
      userId: admin.userId,
    });
    throw error;
  }
}

export async function markXConnectionRevoked(admin: AdminContext, message: string, client: StoreClient = createSupabaseServiceRoleClient()) {
  const sanitized = scrubXMessage(message).slice(0, SANITIZED_OAUTH_ERROR_LIMIT);
  const { error } = await client
    .from("x_connections")
    .update({
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      last_error: sanitized,
      status: "revoked",
      token_expires_at: null,
    })
    .eq("user_id", admin.userId);

  if (error) {
    throw new Error(`Failed to mark X connection revoked: ${error.message}`);
  }
}

// H-3: revoke an X token at the provider so disconnect actually invalidates
// upstream credentials, not just the local copy. Best-effort: any failure is
// returned as ok=false so disconnectXConnection can record the partial state in
// the audit log without aborting the local cleanup.
export async function revokeXOAuthToken(
  token: string,
  hint: "access_token" | "refresh_token",
  options: { fetchImpl?: typeof fetch; source?: NodeJS.ProcessEnv } = {},
): Promise<{ error?: string; ok: boolean }> {
  let config: XOAuthConfig;
  try {
    config = getXOAuthConfig(options.source ?? process.env);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "x_oauth_unconfigured", ok: false };
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    token,
    token_type_hint: hint,
  });

  try {
    const response = await fetchWithOauthTimeout(options.fetchImpl ?? fetch, X_REVOKE_ENDPOINT, {
      body,
      headers: {
        Authorization: basicAuthHeader(config),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });

    if (!response.ok) {
      return { error: `x_revoke_status_${response.status}`, ok: false };
    }

    return { ok: true };
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { error: "x_revoke_timeout", ok: false };
    }
    return { error: error instanceof Error ? error.message.slice(0, 120) : "x_revoke_unknown", ok: false };
  }
}

// L-16: defense-in-depth — strip token-shaped substrings from the message
// before persistence. The caller (refreshXOAuthToken) already classifies, but
// raw bodies from the X token endpoint can echo tokens on some 4xx paths.
const X_OAUTH_TOKEN_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{12,})\b/g,
  /\b(?:access|refresh)[_-]?token["'\s:=]*[A-Za-z0-9._~+/-]{16,}/gi,
];

function scrubXMessage(message: string) {
  let scrubbed = message;
  for (const pattern of X_OAUTH_TOKEN_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, "[redacted-token]");
  }
  return scrubbed;
}

export async function markXConnectionDegraded(admin: AdminContext, message: string, client: StoreClient = createSupabaseServiceRoleClient()) {
  const sanitized = scrubXMessage(message).slice(0, SANITIZED_OAUTH_ERROR_LIMIT);
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

export async function disconnectXConnection(
  admin: AdminContext,
  options: { client?: StoreClient; deleteImportedPosts?: boolean; deleteSnapshots?: boolean; fetchImpl?: typeof fetch; source?: NodeJS.ProcessEnv } = {},
) {
  const client = options.client ?? createSupabaseServiceRoleClient();

  // H-3: load and decrypt the current tokens BEFORE we wipe them so we can call
  // X's /oauth2/revoke for both access and refresh. This is best-effort — if X
  // returns a non-2xx or times out, the audit metadata records the partial
  // state and the local row is still wiped so the owner cannot accidentally
  // continue using a connection they asked us to disconnect.
  let revokeAccess: { error?: string; ok: boolean } = { ok: false, error: "no_token_stored" };
  let revokeRefresh: { error?: string; ok: boolean } = { ok: false, error: "no_token_stored" };
  try {
    const { data: priorRow } = await client
      .from("x_connections")
      .select("encrypted_access_token,encrypted_refresh_token")
      .eq("user_id", admin.userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (priorRow?.encrypted_access_token) {
      try {
        const accessToken = decryptToken(priorRow.encrypted_access_token, {
          legacyPurposes: tokenLegacyPurposes("access", admin.userId),
          purpose: tokenPurpose("access", admin.userId),
        });
        revokeAccess = await revokeXOAuthToken(accessToken, "access_token", { fetchImpl: options.fetchImpl, source: options.source });
      } catch (error) {
        revokeAccess = { error: error instanceof Error ? error.message.slice(0, 120) : "decrypt_failed", ok: false };
      }
    }

    if (priorRow?.encrypted_refresh_token) {
      try {
        const refreshToken = decryptToken(priorRow.encrypted_refresh_token, {
          legacyPurposes: tokenLegacyPurposes("refresh", admin.userId),
          purpose: tokenPurpose("refresh", admin.userId),
        });
        revokeRefresh = await revokeXOAuthToken(refreshToken, "refresh_token", { fetchImpl: options.fetchImpl, source: options.source });
      } catch (error) {
        revokeRefresh = { error: error instanceof Error ? error.message.slice(0, 120) : "decrypt_failed", ok: false };
      }
    }
  } catch (error) {
    // Log but don't abort: we still want to wipe the local row on hard failure.
    // SCA-481 (W-2): scrub upstream X error string before it lands on stdout.
    logSafeError("X disconnect: revoke step failed", error);
  }

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
        revoked_access_token_at_provider: revokeAccess.ok,
        revoked_refresh_token_at_provider: revokeRefresh.ok,
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
      // Replaces the prior misleading `token_material_deleted: true` value: now
      // we record both local wipe and provider-revoke status separately so a
      // partial-revoke is visible in audit instead of being a silent lie.
      revoke_access_error: revokeAccess.ok ? null : revokeAccess.error ?? null,
      revoke_access_ok: revokeAccess.ok,
      revoke_refresh_error: revokeRefresh.ok ? null : revokeRefresh.error ?? null,
      revoke_refresh_ok: revokeRefresh.ok,
      token_material_deleted_locally: true,
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
    accessToken: decryptToken(data.encrypted_access_token, {
      legacyPurposes: tokenLegacyPurposes("access", admin.userId),
      purpose: tokenPurpose("access", admin.userId),
    }),
    encryptedRefreshToken: data.encrypted_refresh_token,
    refreshToken: data.encrypted_refresh_token
      ? decryptToken(data.encrypted_refresh_token, {
          legacyPurposes: tokenLegacyPurposes("refresh", admin.userId),
          purpose: tokenPurpose("refresh", admin.userId),
        })
      : null,
  } satisfies DecryptedXConnection;
}

function parseConnectionStatus(value: string): XConnectionStatus {
  if (value === "connected" || value === "degraded" || value === "disconnected" || value === "pending" || value === "revoked") {
    return value;
  }

  // An unknown stored status indicates schema drift or DB corruption; fall
  // back to "disconnected" rather than "degraded" so publishing paths refuse
  // to write until the row is explicitly reconnected.
  console.error("Unknown X connection status encountered", { value });
  return "disconnected";
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
