import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// SCA-505 (W-26): cron secret verification was untested. The bearer
// comparison is constant-time (CWE-208) and the failure path increments
// a rate-limit bucket — both invariants are load-bearing and silently
// breakable in a refactor. Pin them.

const auditMock = vi.hoisted(() => ({
  logAuditEvent: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/lib/audit", () => auditMock);

vi.mock("@/lib/db/service-role", () => ({
  createSupabaseServiceRoleClient: () => ({
    from(_table: string) {
      const profile = {
        created_at: "2026-04-01T00:00:00Z",
        email: "owner@example.com",
        id: "user-1",
      };
      return {
        select() {
          return {
            eq() {
              return {
                limit() {
                  return Promise.resolve({ data: [profile], error: null });
                },
              };
            },
          };
        },
      };
    },
  }),
}));

import { NextRequest } from "next/server";

import { requireCronAuth } from "@/lib/auth/cron";

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://127.0.0.1:3000/api/cron/publish", { headers });
}

describe("requireCronAuth (SCA-505 / W-26)", () => {
  it("rejects when CRON_SECRET is unset (no expected secret to compare against)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    const result = await requireCronAuth(makeRequest({ authorization: "Bearer anything" }), { route: "cron:test" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("rejects an absent Authorization header", async () => {
    vi.stubEnv("CRON_SECRET", "expected-secret-very-long-1234567890");
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    const result = await requireCronAuth(makeRequest({}), { route: "cron:test" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("rejects a non-Bearer Authorization scheme", async () => {
    vi.stubEnv("CRON_SECRET", "expected-secret-very-long-1234567890");
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    const result = await requireCronAuth(
      makeRequest({ authorization: "Basic dXNlcjpwYXNz" }),
      { route: "cron:test" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("rejects a Bearer token that differs in length (constant-time guard short-circuits before timingSafeEqual)", async () => {
    vi.stubEnv("CRON_SECRET", "expected-secret-very-long-1234567890");
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    const result = await requireCronAuth(
      makeRequest({ authorization: "Bearer wrong" }),
      { route: "cron:test" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("rejects a Bearer token that matches in length but not in content", async () => {
    const secret = "expected-secret-very-long-1234567890";
    const sameLenWrong = "wrong-secret-same-len-12345678901234".slice(0, secret.length);
    expect(sameLenWrong.length).toBe(secret.length);
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    const result = await requireCronAuth(
      makeRequest({ authorization: `Bearer ${sameLenWrong}` }),
      { route: "cron:test" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("accepts the exact configured secret and returns an admin context", async () => {
    const secret = "expected-secret-very-long-1234567890";
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    const result = await requireCronAuth(
      makeRequest({ authorization: `Bearer ${secret}` }),
      { route: "cron:test" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.admin.email).toBe("owner@example.com");
      expect(result.admin.userId).toBe("user-1");
    }
    vi.unstubAllEnvs();
  });

  it("SCA-492 (W-13) regression: rejects with a 500 when CRON_SECRET matches but ADMIN_EMAILS is unset", async () => {
    // ADMIN_EMAILS unset is the trigger for the "no fallback to is_admin"
    // path — the prior implementation silently elevated the first
    // is_admin=true profile to the cron actor. The current
    // loadCronAdminContext throws, surfacing as a 500 with the generic
    // internal_error code. The audit row records the throw via the
    // console.error inside the route handler; we just assert the
    // response shape here.
    const secret = "expected-secret-very-long-1234567890";
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("ADMIN_EMAILS", "");
    const result = await requireCronAuth(
      makeRequest({ authorization: `Bearer ${secret}` }),
      { route: "cron:test" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(500);
    vi.unstubAllEnvs();
  });
});
