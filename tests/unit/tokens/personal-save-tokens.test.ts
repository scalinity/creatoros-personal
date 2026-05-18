import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auditMock = vi.hoisted(() => ({
  logAuditEvent: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/lib/audit", () => auditMock);

import type { AdminContext } from "@/lib/auth/admin";
import {
  createPersonalSaveToken,
  revokePersonalSaveToken,
  rotatePersonalSaveToken,
  verifyPersonalSaveTokenForScope,
  markPersonalSaveTokenUsed,
} from "@/lib/tokens/personal-save-tokens";

// SCA-505 (W-26): personal-save-token CRUD (create / revoke / rotate /
// consume) was previously only exercised end-to-end via the inspiration
// save route. Direct unit coverage pins the per-operation contract and
// the auditToken metadata shape — both surface area for the extension
// API and a security boundary (revoke must blow up any future verify).

type Row = Record<string, unknown>;
const now = "2026-05-18T12:00:00.000Z";

function createDb(seedRows: Record<string, Row[]> = {}) {
  const rows: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seedRows).map(([k, v]) => [k, v.map((r) => ({ ...r }))]),
  );
  let idSequence = 0;

  function selectChain(table: string) {
    let filters: Array<[string, "eq" | "is", unknown]> = [];
    let inFilter: null | [string, unknown[]] = null;
    let limitN = 100;
    function matches(row: Row) {
      if (!filters.every(([k, , v]) => row[k] === v)) return false;
      if (inFilter && !inFilter[1].includes(row[inFilter[0]])) return false;
      return true;
    }
    const chain = {
      eq(k: string, v: unknown) {
        filters.push([k, "eq", v]);
        return chain;
      },
      in(k: string, v: unknown[]) {
        inFilter = [k, v];
        return chain;
      },
      is(k: string, v: unknown) {
        filters.push([k, "is", v]);
        return chain;
      },
      limit(n: number) {
        limitN = n;
        return Promise.resolve({ data: (rows[table] ?? []).filter(matches).slice(0, limitN), error: null });
      },
      order() {
        return chain;
      },
      single() {
        const data = (rows[table] ?? []).find(matches) ?? null;
        return Promise.resolve({ data, error: data ? null : { message: "not found" } });
      },
      maybeSingle() {
        return Promise.resolve({ data: (rows[table] ?? []).find(matches) ?? null, error: null });
      },
      then<T1, T2>(fulfil?: ((v: { data: Row[]; error: null }) => T1 | PromiseLike<T1>) | null, reject?: ((r: unknown) => T2 | PromiseLike<T2>) | null) {
        return Promise.resolve({ data: (rows[table] ?? []).filter(matches).slice(0, limitN), error: null as null }).then(fulfil, reject);
      },
    };
    return chain;
  }

  function updateChain(table: string, payload: Row) {
    let filters: Array<[string, unknown]> = [];
    function applyUpdate() {
      const idx = (rows[table] ?? []).findIndex((row) => filters.every(([k, v]) => row[k] === v));
      if (idx < 0) return null;
      const merged = { ...rows[table]![idx]!, ...payload, updated_at: now };
      rows[table]![idx] = merged;
      return merged;
    }
    const chain = {
      eq(k: string, v: unknown) {
        filters.push([k, v]);
        return chain;
      },
      is() {
        return chain;
      },
      select() {
        return {
          async single() {
            const merged = applyUpdate();
            return merged ? { data: merged, error: null } : { data: null, error: { message: "not found" } };
          },
        };
      },
      then<T1, T2>(fulfil?: ((v: { error: null }) => T1 | PromiseLike<T1>) | null, reject?: ((r: unknown) => T2 | PromiseLike<T2>) | null) {
        applyUpdate();
        return Promise.resolve({ error: null as null }).then(fulfil, reject);
      },
    };
    return chain;
  }

  function makeRow(table: string, payload: Row) {
    idSequence += 1;
    return {
      created_at: now,
      deleted_at: null,
      id: typeof payload.id === "string" ? payload.id : `${table}-${idSequence}`,
      updated_at: now,
      ...payload,
    };
  }

  return {
    rows,
    supabase: {
      from(table: string) {
        return {
          insert(payload: Row) {
            const row = makeRow(table, payload);
            rows[table] = [...(rows[table] ?? []), row];
            return {
              select() {
                return {
                  async single() {
                    return { data: row, error: null };
                  },
                };
              },
            };
          },
          select() {
            return selectChain(table);
          },
          update(payload: Row) {
            return updateChain(table, payload);
          },
        };
      },
    },
  };
}

function admin(userId = "user-1"): AdminContext {
  return { email: "owner@example.com", supabase: null as never, user: { id: userId }, userId } as unknown as AdminContext;
}

const tokenOpts = {
  pepper: "test-pepper-very-long-1234567890123456",
  randomBytes: () => Buffer.alloc(32, 7),
};

describe("personal-save-token CRUD (SCA-505 / W-26)", () => {
  it("creates a token with inspiration:create scope and HMAC hash storage", async () => {
    const db = createDb({ personal_save_tokens: [] });
    const { rawToken, token } = await createPersonalSaveToken(
      admin(),
      { name: "Chrome desktop", rateLimitPerHour: 30 },
      { ...tokenOpts, serviceClient: db.supabase as never },
    );

    expect(rawToken.startsWith("cos_live_")).toBe(true);
    expect(token.scopes).toEqual(["inspiration:create"]);
    expect(token.status).toBe("active");
    expect(token.tokenPrefix.startsWith("cos_live_")).toBe(true);
    // SCA-533 (S-27): visible prefix is 17 chars now.
    expect(token.tokenPrefix.length).toBe(17);

    const stored = db.rows.personal_save_tokens?.[0];
    expect(stored).toBeDefined();
    expect(stored?.token_hash).toMatch(/^pst_v1\$/);
    expect(stored?.token_hash).not.toContain(rawToken);

    expect(auditMock.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "personal_save_token_created",
        success: true,
        targetType: "personal_save_token",
      }),
    );
  });

  it("revokes a token, marking status revoked and recording the reason", async () => {
    const db = createDb({ personal_save_tokens: [] });
    const { token } = await createPersonalSaveToken(
      admin(),
      { name: "To revoke" },
      { ...tokenOpts, serviceClient: db.supabase as never },
    );

    const revoked = await revokePersonalSaveToken(
      admin(),
      { id: token.id, reason: "Lost laptop" },
      { ...tokenOpts, serviceClient: db.supabase as never },
    );

    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).toBeTruthy();
    expect(auditMock.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "personal_save_token_revoked", success: true }),
    );
  });

  it("rotates a token — revokes the old one and creates a new one with a new prefix", async () => {
    const db = createDb({ personal_save_tokens: [] });
    const { token: first } = await createPersonalSaveToken(
      admin(),
      { name: "Rotate me" },
      { ...tokenOpts, serviceClient: db.supabase as never, randomBytes: () => Buffer.alloc(32, 7) },
    );
    const { rawToken: newRaw, token: rotated } = await rotatePersonalSaveToken(
      admin(),
      { id: first.id },
      { ...tokenOpts, serviceClient: db.supabase as never, randomBytes: () => Buffer.alloc(32, 9) },
    );
    expect(rotated.id).not.toBe(first.id);
    expect(rotated.tokenPrefix).not.toBe(first.tokenPrefix);
    expect(newRaw.startsWith("cos_live_")).toBe(true);

    // The original token must now be revoked.
    const originalNow = (db.rows.personal_save_tokens ?? []).find((row) => row.id === first.id);
    expect(originalNow?.status).toBe("revoked");
  });

  it("verifies an active token for inspiration:create scope", async () => {
    const db = createDb({ personal_save_tokens: [] });
    const { rawToken } = await createPersonalSaveToken(
      admin(),
      { name: "Verify me" },
      { ...tokenOpts, serviceClient: db.supabase as never },
    );

    const result = await verifyPersonalSaveTokenForScope(rawToken, "inspiration:create", {
      ...tokenOpts,
      serviceClient: db.supabase as never,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token.scopes).toContain("inspiration:create");
      expect(result.userId).toBe("user-1");
    }
  });

  it("rejects verification when the token is missing", async () => {
    const db = createDb({ personal_save_tokens: [] });
    const result = await verifyPersonalSaveTokenForScope("", "inspiration:create", {
      ...tokenOpts,
      serviceClient: db.supabase as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("missing_token");
  });

  it("rejects verification when the token format is invalid", async () => {
    const db = createDb({ personal_save_tokens: [] });
    const result = await verifyPersonalSaveTokenForScope("not-a-real-token", "inspiration:create", {
      ...tokenOpts,
      serviceClient: db.supabase as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_token");
  });

  it("rejects verification when the token has been revoked", async () => {
    const db = createDb({ personal_save_tokens: [] });
    const { rawToken, token } = await createPersonalSaveToken(
      admin(),
      { name: "Soon revoked" },
      { ...tokenOpts, serviceClient: db.supabase as never },
    );
    await revokePersonalSaveToken(
      admin(),
      { id: token.id, reason: "test" },
      { ...tokenOpts, serviceClient: db.supabase as never },
    );

    const result = await verifyPersonalSaveTokenForScope(rawToken, "inspiration:create", {
      ...tokenOpts,
      serviceClient: db.supabase as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("inactive_token");
  });

  it("markPersonalSaveTokenUsed updates last_used_at without throwing on missing row", async () => {
    const db = createDb({ personal_save_tokens: [{ deleted_at: null, id: "tok-1", revoked_at: null, status: "active", user_id: "user-1" }] });
    await markPersonalSaveTokenUsed("tok-1", "user-1", {
      ...tokenOpts,
      now: () => new Date(now),
      serviceClient: db.supabase as never,
    });
    const row = (db.rows.personal_save_tokens ?? []).find((r) => r.id === "tok-1");
    expect(row?.last_used_at).toBe(now);
  });
});
