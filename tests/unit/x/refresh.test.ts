import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { refreshXOAuthToken, XOAuthRefreshError, shouldRefreshXToken } from "@/lib/x/oauth";

// SCA-505 (W-26): X OAuth refresh classification was untested before this
// commit. The kind ∈ {invalid_grant, transient, unknown} drives whether
// the connection is marked `revoked` (forcing reconnect) or `degraded`
// (auto-recovers next attempt) — a misclassification is a UX bug (forced
// reconnect on a transient blip) AND a security signal (silent recovery
// from a legit invalid_grant). Pin the behavior.

const REQUIRED_ENV = {
  X_CLIENT_ID: "test-client-id",
  X_CLIENT_SECRET: "test-client-secret",
  X_REDIRECT_URI: "http://localhost:3000/api/x/oauth/callback",
};

function envSource(): NodeJS.ProcessEnv {
  return REQUIRED_ENV as unknown as NodeJS.ProcessEnv;
}

function makeFetchResponse(status: number, body: unknown = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("refreshXOAuthToken classification (SCA-505 / W-26)", () => {
  it("returns the token set on 200 success", async () => {
    const fetchImpl = vi.fn(async () =>
      makeFetchResponse(200, {
        access_token: "new-access-token",
        expires_in: 7200,
        refresh_token: "new-refresh-token",
        scope: "tweet.read users.read offline.access",
      }),
    );
    const result = await refreshXOAuthToken("rt-1", { fetchImpl: fetchImpl as never, source: envSource() });
    expect(result.accessToken).toBe("new-access-token");
    expect(result.refreshToken).toBe("new-refresh-token");
    expect(result.scope).toContain("tweet.read");
  });

  it("classifies an explicit invalid_grant body as invalid_grant", async () => {
    const fetchImpl = vi.fn(async () => makeFetchResponse(400, { error: "invalid_grant" }));
    await expect(refreshXOAuthToken("rt-1", { fetchImpl: fetchImpl as never, source: envSource() })).rejects.toMatchObject({
      kind: "invalid_grant",
      name: "XOAuthRefreshError",
    });
  });

  it("classifies invalid_client / invalid_request bodies as invalid_grant", async () => {
    const fetchImpl = vi.fn(async () => makeFetchResponse(400, { error: "invalid_client" }));
    await expect(refreshXOAuthToken("rt-1", { fetchImpl: fetchImpl as never, source: envSource() })).rejects.toMatchObject({
      kind: "invalid_grant",
    });
  });

  it("classifies a 500 server error as transient (auto-retry candidate)", async () => {
    // The retry loop will fire multiple attempts and eventually throw the
    // last transient error. Make the underlying fetch always 500.
    const fetchImpl = vi.fn(async () => makeFetchResponse(500, { error: "upstream_blip" }));
    await expect(refreshXOAuthToken("rt-1", { fetchImpl: fetchImpl as never, source: envSource() })).rejects.toMatchObject({
      kind: "transient",
      name: "XOAuthRefreshError",
    });
  });

  it("SCA-502 (W-23) regression: bare 401 with NO error body is transient, NOT invalid_grant", async () => {
    // Prior to W-23 a 401 with empty body was misclassified as invalid_grant
    // and forced a full reconnect. The fix: only treat 4xx as invalid_grant
    // when the body explicitly carries an OAuth error code.
    const fetchImpl = vi.fn(async () => makeFetchResponse(401, ""));
    await expect(refreshXOAuthToken("rt-1", { fetchImpl: fetchImpl as never, source: envSource() })).rejects.toMatchObject({
      kind: "transient",
      name: "XOAuthRefreshError",
    });
  });

  it("classifies a 418 'I'm a teapot' (unexpected 4xx without OAuth error body) as unknown", async () => {
    const fetchImpl = vi.fn(async () => makeFetchResponse(418, { something: "else" }));
    await expect(refreshXOAuthToken("rt-1", { fetchImpl: fetchImpl as never, source: envSource() })).rejects.toMatchObject({
      kind: "unknown",
      name: "XOAuthRefreshError",
    });
  });

  it("network failure surfaces as transient", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connect ECONNRESET");
    });
    await expect(refreshXOAuthToken("rt-1", { fetchImpl: fetchImpl as never, source: envSource() })).rejects.toMatchObject({
      kind: "transient",
    });
  });
});

describe("shouldRefreshXToken window", () => {
  it("returns true when expiry is missing or unparseable", () => {
    expect(shouldRefreshXToken(null)).toBe(true);
    expect(shouldRefreshXToken("not a date")).toBe(true);
  });

  it("returns true when the token expires inside the 5-minute window", () => {
    const at = Date.UTC(2026, 4, 18, 12, 0, 0);
    const expiresSoon = new Date(at + 4 * 60 * 1_000).toISOString();
    expect(shouldRefreshXToken(expiresSoon, at)).toBe(true);
  });

  it("returns false when the token has plenty of headroom", () => {
    const at = Date.UTC(2026, 4, 18, 12, 0, 0);
    const expiresLater = new Date(at + 30 * 60 * 1_000).toISOString();
    expect(shouldRefreshXToken(expiresLater, at)).toBe(false);
  });
});

describe("XOAuthRefreshError shape (SCA-505)", () => {
  it("carries kind + status alongside the message for the route classifier", () => {
    const err = new XOAuthRefreshError("boom", "transient", 502);
    expect(err.kind).toBe("transient");
    expect(err.status).toBe(502);
    expect(err.name).toBe("XOAuthRefreshError");
  });
});
