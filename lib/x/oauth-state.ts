import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/db/service-role";

import type { XOAuthMode } from "./oauth";

const STATE_TTL_SECONDS = 10 * 60;

export type StoredOAuthState = {
  codeVerifier: string;
  consumedAt: null | string;
  expiresAt: string;
  mode: XOAuthMode;
  returnTo: null | string;
  scopes: string[];
  state: string;
  userId: string;
};

// H-5/M-4/M-5: persist OAuth state, PKCE verifier, mode, scopes, and return-to
// in the database keyed by the random `state` value, bound to the initiating
// user's id. Replaces the prior cookie-only approach so:
//   1. The verifier is never round-tripped through the browser.
//   2. The state is single-use server-side: consumeOAuthState atomically marks
//      the row consumed and returns it; a replay returns null.
//   3. The callback can verify the row.user_id matches the signed-in admin.
export async function persistOAuthState(input: {
  codeVerifier: string;
  mode: XOAuthMode;
  returnTo: null | string;
  scopes: string[];
  state: string;
  userId: string;
}) {
  const expiresAt = new Date(Date.now() + STATE_TTL_SECONDS * 1_000).toISOString();
  const client = createSupabaseServiceRoleClient();
  const { error } = await client.from("x_oauth_states").insert({
    code_verifier: input.codeVerifier,
    expires_at: expiresAt,
    mode: input.mode,
    return_to: input.returnTo,
    scopes: input.scopes,
    state: input.state,
    user_id: input.userId,
  });

  if (error) {
    throw new Error(`Failed to persist OAuth state: ${error.message}`);
  }

  return { expiresAt };
}

export async function consumeOAuthState(state: string, expectedUserId: string): Promise<null | StoredOAuthState> {
  const client = createSupabaseServiceRoleClient();
  const now = new Date().toISOString();

  // Atomic CAS: only consume if not already consumed and not expired.
  const { data, error } = await client
    .from("x_oauth_states")
    .update({ consumed_at: now })
    .eq("state", state)
    .is("consumed_at", null)
    .gte("expires_at", now)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to consume OAuth state: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  if (data.user_id !== expectedUserId) {
    return null;
  }

  return {
    codeVerifier: data.code_verifier,
    consumedAt: data.consumed_at,
    expiresAt: data.expires_at,
    mode: data.mode,
    returnTo: data.return_to,
    scopes: Array.isArray(data.scopes) ? data.scopes : [],
    state: data.state,
    userId: data.user_id,
  };
}

export async function cleanupExpiredOAuthStates() {
  const client = createSupabaseServiceRoleClient();
  const { error } = await client.rpc("creatoros_x_oauth_states_cleanup", {});
  if (error) {
    throw new Error(`Failed to clean up OAuth states: ${error.message}`);
  }
}
