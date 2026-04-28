import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.hoisted(() => ({
  logAuditEvent: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => auditMock);

import { createMockAiProvider } from "@/lib/ai/providers/mock";
import type { AdminContext } from "@/lib/auth/admin";
import { InspirationWorkspaceView } from "@/components/inspiration";
import { TokenSettingsClient } from "@/components/settings/tokens";
import {
  assessSimilarityRisk,
  createInspiration,
  loadInspirationWorkspace,
  saveInspirationWithExtensionToken,
  transformInspiration,
} from "@/lib/inspiration";
import {
  createPersonalSaveToken,
  listPersonalSaveTokens,
  revokePersonalSaveToken,
  rotatePersonalSaveToken,
} from "@/lib/tokens/personal-save-tokens";
import { inspirationSaveSchema, inspirationTransformSchema } from "@/lib/inspiration/validation";

type TableRow = Record<string, unknown>;
type SelectFilter = { key: string; op: "eq" | "is"; value: unknown };

const now = "2026-04-28T12:00:00.000Z";

function createSupabaseMock(seedRows: Record<string, TableRow[]> = {}) {
  const inserts: Record<string, TableRow[]> = {};
  const rows: Record<string, TableRow[]> = Object.fromEntries(Object.entries(seedRows).map(([table, seeded]) => [table, seeded.map((row) => ({ ...row }))]));
  const updates: Record<string, TableRow[]> = {};
  let idSequence = 0;

  function rowFor(table: string, payload: TableRow) {
    idSequence += 1;
    return {
      captured_at: now,
      created_at: now,
      deleted_at: null,
      id: typeof payload.id === "string" ? payload.id : `${table}-${idSequence}`,
      metadata: {},
      updated_at: now,
      ...payload,
    };
  }

  function filteredRows(table: string, filters: SelectFilter[]) {
    return (rows[table] ?? []).filter((row) =>
      filters.every((filter) => {
        if (filter.op === "eq" || filter.op === "is") return row[filter.key] === filter.value;
        return false;
      }),
    );
  }

  function selectChain(table: string) {
    const filters: SelectFilter[] = [];
    let ascending = true;
    let orderKey: string | null = null;

    const chain = {
      eq(key: string, value: unknown) {
        filters.push({ key, op: "eq", value });
        return chain;
      },
      is(key: string, value: unknown) {
        filters.push({ key, op: "is", value });
        return chain;
      },
      limit(count: number) {
        const sorted = [...filteredRows(table, filters)].sort((left, right) => {
          if (!orderKey) return 0;
          return String(left[orderKey] ?? "") > String(right[orderKey] ?? "") ? (ascending ? 1 : -1) : ascending ? -1 : 1;
        });
        return Promise.resolve({ data: sorted.slice(0, count), error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: filteredRows(table, filters)[0] ?? null, error: null });
      },
      order(key: string, options?: { ascending?: boolean }) {
        orderKey = key;
        ascending = options?.ascending ?? true;
        return chain;
      },
      single() {
        const data = filteredRows(table, filters)[0] ?? null;
        return Promise.resolve({ data, error: data ? null : { message: "not found" } });
      },
      then<TResult1 = { data: TableRow[]; error: null }, TResult2 = never>(
        onfulfilled?: ((value: { data: TableRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve({ data: filteredRows(table, filters), error: null }).then(onfulfilled, onrejected);
      },
    };

    return chain;
  }

  function updateChain(table: string, payload: TableRow) {
    const filters: SelectFilter[] = [];
    const chain = {
      eq(key: string, value: unknown) {
        filters.push({ key, op: "eq", value });
        return chain;
      },
      is(key: string, value: unknown) {
        filters.push({ key, op: "is", value });
        return chain;
      },
      select() {
        return {
          async single() {
            const existing = filteredRows(table, filters)[0] ?? null;
            if (!existing) return { data: null, error: { message: "not found" } };
            const updated = { ...existing, ...payload, updated_at: now };
            rows[table] = (rows[table] ?? []).map((row) => (row === existing ? updated : row));
            updates[table] = [...(updates[table] ?? []), { filters, payload }];
            return { data: updated, error: null };
          },
        };
      },
      then<TResult1 = { error: null }, TResult2 = never>(
        onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        rows[table] = (rows[table] ?? []).map((row) => (filteredRows(table, filters).includes(row) ? { ...row, ...payload, updated_at: now } : row));
        updates[table] = [...(updates[table] ?? []), { filters, payload }];
        return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
      },
    };

    return chain;
  }

  return {
    inserts,
    rows,
    supabase: {
      from(table: string) {
        return {
          insert(payload: TableRow) {
            inserts[table] = [...(inserts[table] ?? []), payload];
            const row = rowFor(table, payload);
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
          update(payload: TableRow) {
            return updateChain(table, payload);
          },
        };
      },
    },
    updates,
  };
}

function createAdminContext(supabase: unknown): AdminContext {
  return {
    email: "owner@example.com",
    supabase,
    user: { id: "user-1" },
    userId: "user-1",
  } as AdminContext;
}

afterEach(() => {
  auditMock.logAuditEvent.mockClear();
});

describe("Phase 20 validation and plagiarism guard", () => {
  it("normalizes extension save payloads and transform modes", () => {
    const save = inspirationSaveSchema.parse({
      author_display_name: "  Writer Name  ",
      author_username: " @writer ",
      notes: "Useful structure, do not copy wording.",
      post_id: "12345",
      post_url: "https://x.com/writer/status/12345",
      tags: "hook, teardown, hook",
      text: "  The first line frames a problem, then the rest shows the mechanism.  ",
    });

    expect(save).toMatchObject({
      authorDisplayName: "Writer Name",
      authorUsername: "writer",
      platform: "x",
      platformPostId: "12345",
      tags: ["hook", "teardown"],
      text: "The first line frames a problem, then the rest shows the mechanism.",
      url: "https://x.com/writer/status/12345",
    });

    expect(inspirationSaveSchema.safeParse({ text: "Missing source" }).success).toBe(false);
    expect(inspirationTransformSchema.parse({ count: "10", id: "insp-1", mode: "ten_unrelated_posts" })).toMatchObject({ count: 10, mode: "ten_unrelated_posts" });
  });

  it("flags lightly paraphrased or copied inspiration as high risk", () => {
    const copied = assessSimilarityRisk("Your best ideas are not missing. They are leaking through a bad capture system.", [
      "Your best ideas are not missing; they are leaking through a bad capture workflow.",
    ]);
    const original = assessSimilarityRisk("Your best ideas are not missing. They are leaking through a bad capture system.", [
      "A quiet intake habit turns half-formed sparks into reusable draft inventory before the week gets noisy.",
    ]);

    expect(copied.risk).toBe("high");
    expect(copied.notes.join(" ")).toContain("overlap");
    expect(original.risk).toBe("low");
  });
});

describe("Phase 20 personal save token service", () => {
  it("creates hashed shown-once tokens and lists only sanitized token rows", async () => {
    const db = createSupabaseMock();
    const admin = createAdminContext(db.supabase);
    const result = await createPersonalSaveToken(admin, { name: "Chrome laptop", rateLimitPerHour: 12 }, { now: () => new Date(now), pepper: "pepper", randomBytes: () => Buffer.alloc(32, 7), serviceClient: db.supabase });

    expect(result.rawToken).toMatch(/^cos_live_/);
    expect(db.inserts.personal_save_tokens?.[0]?.token_hash).toMatch(/^pst_v1\$/);
    expect(db.inserts.personal_save_tokens?.[0]?.token_hash).not.toContain(result.rawToken);
    expect(db.inserts.personal_save_tokens?.[0]).toMatchObject({
      name: "Chrome laptop",
      rate_limit_per_hour: 12,
      scopes: ["inspiration:create"],
      token_prefix: result.token.tokenPrefix,
      user_id: "user-1",
    });

    const tokens = await listPersonalSaveTokens(admin);
    expect(tokens[0]).toMatchObject({ name: "Chrome laptop", tokenPrefix: result.token.tokenPrefix });
    expect(JSON.stringify(tokens)).not.toContain("token_hash");
    expect(JSON.stringify(tokens)).not.toContain(result.rawToken);
  });

  it("revokes and rotates tokens without exposing stored hashes", async () => {
    const db = createSupabaseMock({
      personal_save_tokens: [
        {
          created_at: now,
          deleted_at: null,
          expires_at: null,
          id: "token-1",
          last_used_at: null,
          metadata: {},
          name: "Chrome",
          rate_limit_per_hour: 30,
          revoked_at: null,
          scopes: ["inspiration:create"],
          status: "active",
          token_hash: "pst_v1$old",
          token_prefix: "cos_live_old",
          updated_at: now,
          user_id: "user-1",
        },
      ],
    });
    const admin = createAdminContext(db.supabase);

    await revokePersonalSaveToken(admin, { id: "token-1", reason: "lost browser" }, { now: () => new Date(now), serviceClient: db.supabase });
    expect(db.rows.personal_save_tokens?.[0]?.status).toBe("revoked");
    expect(db.rows.personal_save_tokens?.[0]?.revoked_at).toBe(now);

    const rotation = await rotatePersonalSaveToken(admin, { id: "token-1" }, { now: () => new Date(now), pepper: "pepper", randomBytes: () => Buffer.alloc(32, 8), serviceClient: db.supabase });
    expect(rotation.rawToken).toMatch(/^cos_live_/);
    expect(db.rows.personal_save_tokens?.some((row) => row.status === "active" && row.id !== "token-1")).toBe(true);
  });
});

describe("Phase 20 inspiration service", () => {
  it("saves inspiration with owner auth and returns duplicate status for the same URL", async () => {
    const db = createSupabaseMock();
    const admin = createAdminContext(db.supabase);
    const input = inspirationSaveSchema.parse({
      post_id: "123",
      post_url: "https://x.com/creator/status/123",
      text: "This post has a useful setup and reversal.",
    });

    const first = await createInspiration(admin, input, { source: "in_app" });
    const second = await createInspiration(admin, input, { source: "in_app" });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(db.inserts.saved_inspiration_posts).toHaveLength(1);
  });

  it("transforms inspiration into abstract pattern variants and persists risk warnings", async () => {
    const db = createSupabaseMock({
      saved_inspiration_posts: [
        {
          author_display_name: "Creator",
          author_username: "creator",
          captured_at: now,
          created_at: now,
          deleted_at: null,
          id: "insp-1",
          metadata: {},
          notes: "Extract the structure only.",
          plagiarism_risk_notes: null,
          platform: "x",
          platform_post_id: "123",
          similarity_risk: null,
          tags: ["hook"],
          text: "Your best ideas are not missing. They are leaking through a bad capture system.",
          transformed_outputs: [],
          updated_at: now,
          url: "https://x.com/creator/status/123",
          user_id: "user-1",
        },
      ],
    });
    const admin = createAdminContext(db.supabase);
    const provider = createMockAiProvider({
      responses: [
        {
          content: JSON.stringify({
            abstract_structure: ["Name an invisible loss", "Expose the mechanism", "Offer a replacement habit"],
            originality_notes: ["Uses unrelated wording and a different domain."],
            plagiarism_risk: "low",
            variants: [
              {
                rationale: "Same abstract pattern, new expression.",
                text: "A calendar is not a strategy. It is just where your unfinished decisions go to become visible.",
              },
            ],
          }),
        },
      ],
    });

    const result = await transformInspiration(admin, { count: 1, id: "insp-1", mode: "original_version" }, { provider });

    expect(result.transform.mode).toBe("original_version");
    expect(result.transform.variants[0]?.text).toContain("calendar");
    expect(result.transform.similarityRisk).toBe("low");
    expect(db.rows.saved_inspiration_posts?.[0]?.transformed_outputs).toHaveLength(1);
    expect(db.rows.saved_inspiration_posts?.[0]?.similarity_risk).toBe("low");
  });

  it("loads workspace records for the owner and renders plagiarism warnings", async () => {
    const db = createSupabaseMock({
      saved_inspiration_posts: [
        {
          author_display_name: "Creator",
          author_username: "creator",
          captured_at: now,
          created_at: now,
          deleted_at: null,
          id: "insp-1",
          metadata: {},
          notes: "Watch the structure.",
          plagiarism_risk_notes: "High phrase overlap detected.",
          platform: "x",
          platform_post_id: "123",
          similarity_risk: "high",
          tags: ["hook"],
          text: "Source text",
          transformed_outputs: [],
          updated_at: now,
          url: "https://x.com/creator/status/123",
          user_id: "user-1",
        },
      ],
    });
    const workspace = await loadInspirationWorkspace(createAdminContext(db.supabase), { selected: "insp-1" });
    const noopAction = async () => undefined;
    const markup = renderToStaticMarkup(
      React.createElement(InspirationWorkspaceView, {
        createAction: noopAction,
        deleteAction: noopAction,
        filters: { selected: "insp-1" },
        transformAction: noopAction,
        updateAction: noopAction,
        workspace,
      }),
    );

    expect(workspace.items).toHaveLength(1);
    expect(markup).toContain("§ 20");
    expect(markup).toContain("Plagiarism risk");
    expect(markup).toContain("High phrase overlap detected.");
  });
});

describe("Phase 20 extension endpoint service", () => {
  it("rejects missing or invalid bearer tokens without creating records", async () => {
    const db = createSupabaseMock();
    const missing = await saveInspirationWithExtensionToken(null, { post_id: "123", text: "save me" }, { pepper: "pepper", serviceClient: db.supabase });
    const invalid = await saveInspirationWithExtensionToken("cos_live_invalid", { post_id: "123", text: "save me" }, { pepper: "pepper", serviceClient: db.supabase });

    expect(missing.ok).toBe(false);
    expect(missing.error).toBe("missing_token");
    expect(invalid.ok).toBe(false);
    expect(invalid.error).toBe("invalid_token");
    expect(db.inserts.saved_inspiration_posts ?? []).toHaveLength(0);
  });

  it("allows a valid inspiration:create token to create inspiration only", async () => {
    const tokenDb = createSupabaseMock();
    const admin = createAdminContext(tokenDb.supabase);
    const created = await createPersonalSaveToken(admin, { name: "Extension" }, { pepper: "pepper", randomBytes: () => Buffer.alloc(32, 9), serviceClient: tokenDb.supabase });
    const db = createSupabaseMock({ personal_save_tokens: tokenDb.rows.personal_save_tokens ?? [] });

    const saved = await saveInspirationWithExtensionToken(created.rawToken, { post_id: "123", post_url: "https://x.com/a/status/123", text: "Useful abstract pattern." }, { pepper: "pepper", serviceClient: db.supabase });

    expect(saved.ok).toBe(true);
    expect(saved.ok ? saved.data.duplicate : null).toBe(false);
    expect(db.inserts.saved_inspiration_posts?.[0]).toMatchObject({
      metadata: expect.objectContaining({ source: "extension", token_id: created.token.id }),
      text: "Useful abstract pattern.",
      user_id: "user-1",
    });
    expect(db.updates.personal_save_tokens?.[0]?.payload).toMatchObject({ last_used_at: expect.any(String) });
    expect(db.inserts.publishing_drafts ?? []).toHaveLength(0);
    expect(db.inserts.ai_jobs ?? []).toHaveLength(0);
  });

  it("counts validation failures against the verified token and IP rate limit", async () => {
    const tokenDb = createSupabaseMock();
    const admin = createAdminContext(tokenDb.supabase);
    const created = await createPersonalSaveToken(admin, { name: "Strict extension", rateLimitPerHour: 1 }, { pepper: "pepper", randomBytes: () => Buffer.alloc(32, 10), serviceClient: tokenDb.supabase });
    const db = createSupabaseMock({ personal_save_tokens: tokenDb.rows.personal_save_tokens ?? [] });
    const request = new Request("http://localhost:3000/api/inspiration/save", { headers: { "x-forwarded-for": "203.0.113.20" } });

    const first = await saveInspirationWithExtensionToken(created.rawToken, { text: "Missing source." }, { pepper: "pepper", request, serviceClient: db.supabase });
    const second = await saveInspirationWithExtensionToken(created.rawToken, { text: "Still missing source." }, { pepper: "pepper", request, serviceClient: db.supabase });

    expect(first.ok).toBe(false);
    expect(first.error).toBe("validation_error");
    expect(second.ok).toBe(false);
    expect(second.error).toBe("rate_limited");
    expect(db.inserts.saved_inspiration_posts ?? []).toHaveLength(0);
  });
});

describe("Phase 20 token settings UI", () => {
  it("renders token management without hashes or raw token echoes", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TokenSettingsClient, {
        action: async () => ({ message: "Ready", ok: true }),
        initialState: null,
        tokens: [
          {
            createdAt: now,
            expiresAt: null,
            id: "token-1",
            lastUsedAt: null,
            name: "Chrome",
            rateLimitPerHour: 30,
            revokedAt: null,
            scopes: ["inspiration:create"],
            status: "active",
            tokenPrefix: "cos_live_abcd",
            updatedAt: now,
          },
        ],
      }),
    );

    expect(markup).toContain("Chrome");
    expect(markup).toContain("cos_live_abcd");
    expect(markup).toContain("Rotate");
    expect(markup).not.toContain("pst_v1");
    expect(markup).not.toContain("cos_live_valid_token");
  });
});
