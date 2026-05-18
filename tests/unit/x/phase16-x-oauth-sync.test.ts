import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

process.env.ENCRYPTION_KEY = "test-encryption-key-that-is-at-least-32-bytes";

const auditMock = vi.hoisted(() => ({
  logAuditEvent: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => auditMock);

import type { AdminContext } from "@/lib/auth/admin";
import { XConnectionPanel } from "@/components/settings/x-connection-panel";
import { decryptToken } from "@/lib/security/encryption";
import { createLiveXApiClient, type XSyncPost } from "@/lib/x/client";
import { deriveXCapabilities, normalizeXScopes, storeXOAuthConnection } from "@/lib/x/oauth";
import { runXReadSync } from "@/lib/x/sync";

type TableRow = Record<string, unknown>;
type SelectFilter = { key: string; op: "eq" | "is"; value: unknown };

const now = "2026-04-28T12:00:00.000Z";

function createSupabaseMock(seedRows: Record<string, TableRow[]> = {}) {
  const inserts: Record<string, TableRow[]> = {};
  const rows: Record<string, TableRow[]> = Object.fromEntries(Object.entries(seedRows).map(([table, seeded]) => [table, seeded.map((row) => ({ ...row }))]));
  const updates: Record<string, TableRow[]> = {};
  const upserts: Record<string, TableRow[]> = {};
  let idSequence = 0;

  function rowFor(table: string, payload: TableRow) {
    idSequence += 1;
    return {
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
        const value = row[filter.key];
        return value === filter.value;
      }),
    );
  }

  function selectChain(table: string) {
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
      limit(count: number) {
        return Promise.resolve({ data: filteredRows(table, filters).slice(0, count), error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: filteredRows(table, filters)[0] ?? null, error: null });
      },
      order() {
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

  function mutationResult(table: string, payload: TableRow) {
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
  }

  return {
    inserts,
    rows,
    supabase: {
      from(table: string) {
        return {
          insert(payload: TableRow) {
            inserts[table] = [...(inserts[table] ?? []), payload];
            return mutationResult(table, payload);
          },
          select() {
            return selectChain(table);
          },
          update(payload: TableRow) {
            return updateChain(table, payload);
          },
          upsert(payload: TableRow) {
            upserts[table] = [...(upserts[table] ?? []), payload];
            return mutationResult(table, payload);
          },
        };
      },
    },
    updates,
    upserts,
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

const fixturePosts: XSyncPost[] = [
  {
    authorDisplayName: "Creator OS",
    authorUsername: "creatoros",
    createdAt: "2026-04-27T15:00:00.000Z",
    id: "1784230000000000001",
    lang: "en",
    metrics: {
      bookmarkCount: 3,
      impressionCount: 1200,
      likeCount: 44,
      mediaViewCount: null,
      profileClickCount: null,
      quoteCount: 2,
      replyCount: 5,
      repostCount: 8,
      urlLinkClickCount: null,
      videoViewCount: null,
    },
    raw: { id: "1784230000000000001", public_metrics: { like_count: 44 } },
    text: "A synced owner post with public metrics.",
  },
  {
    authorDisplayName: "Creator OS",
    authorUsername: "creatoros",
    createdAt: "2026-04-28T15:00:00.000Z",
    id: "1784230000000000002",
    lang: "en",
    metrics: {
      bookmarkCount: null,
      impressionCount: null,
      likeCount: 9,
      mediaViewCount: null,
      profileClickCount: null,
      quoteCount: 0,
      replyCount: 1,
      repostCount: 2,
      urlLinkClickCount: null,
      videoViewCount: null,
    },
    raw: { id: "1784230000000000002", public_metrics: { like_count: 9 } },
    text: "A synced owner post with missing private metrics.",
  },
];

describe("Phase 16 X API client", () => {
  it("maps media includes back onto synced posts", async () => {
    const client = createLiveXApiClient("token", {
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                attachments: { media_keys: ["3_abc"] },
                created_at: "2026-04-28T16:00:00.000Z",
                id: "1784230000000000003",
                public_metrics: { like_count: 7, reply_count: 1, retweet_count: 2, quote_count: 0 },
                text: "Post with media.",
              },
            ],
            includes: {
              media: [{ height: 720, media_key: "3_abc", type: "photo", url: "https://cdn.example/photo.jpg", width: 1280 }],
            },
          }),
          { status: 200 },
        )) as typeof fetch,
    });

    const result = await client.listUserPosts("12345", { includeMetrics: true, maxPosts: 5 });

    expect(result.posts[0]?.media).toEqual([{ height: 720, media_key: "3_abc", type: "photo", url: "https://cdn.example/photo.jpg", width: 1280 }]);
  });
});

describe("Phase 16 X OAuth and capability helpers", () => {
  it("normalizes read scopes and does not enable publishing capabilities by default", () => {
    const scopes = normalizeXScopes("tweet.read users.read offline.access like.read bookmark.read follows.read list.read tweet.read");

    expect(scopes).toEqual(["tweet.read", "users.read", "offline.access", "like.read", "bookmark.read", "follows.read", "list.read"]);
    expect(deriveXCapabilities(scopes)).toMatchObject({
      can_delete_posts: false,
      can_read_metrics: true,
      can_read_user_posts: true,
      can_upload_media: false,
      can_write_posts: false,
      can_write_quotes: false,
      can_write_replies: false,
      enterprise_analytics_enabled: false,
      enterprise_quote_post_enabled: false,
    });
  });

  it("encrypts X tokens before storing a connection row", async () => {
    const { supabase, upserts } = createSupabaseMock();
    const admin = createAdminContext(supabase);

    await storeXOAuthConnection(admin, {
      profile: {
        avatarUrl: "https://cdn.example/avatar.jpg",
        displayName: "Creator OS",
        id: "12345",
        username: "creatoros",
      },
      scopes: ["tweet.read", "users.read", "offline.access"],
      tokenSet: {
        accessToken: "x-access-token-secret",
        expiresAt: "2026-04-28T14:00:00.000Z",
        refreshToken: "x-refresh-token-secret",
      },
    }, { client: supabase as never });

    const payload = upserts.x_connections?.[0];
    expect(payload).toMatchObject({ status: "connected", user_id: "user-1", x_user_id: "12345", username: "creatoros" });
    expect(payload?.encrypted_access_token).not.toBe("x-access-token-secret");
    expect(payload?.encrypted_refresh_token).not.toBe("x-refresh-token-secret");
    // M-8: tokens are encrypted under the current key-version AAD (`:k1`).
    // The legacy AAD (`x-access:user-1`) is exposed via legacyPurposes so a
    // future key rotation does not require backfilling existing rows.
    expect(decryptToken(String(payload?.encrypted_access_token), { purpose: "x-access:user-1:k1" })).toBe("x-access-token-secret");
    expect(decryptToken(String(payload?.encrypted_refresh_token), { purpose: "x-refresh:user-1:k1" })).toBe("x-refresh-token-secret");
  });
});

describe("Phase 16 X read sync", () => {
  it("runs explicit mock sync, upserts owner posts, and records metric snapshots", async () => {
    const { inserts, supabase, updates } = createSupabaseMock();
    const admin = createAdminContext(supabase);

    const result = await runXReadSync(admin, {
      includeMetrics: true,
      maxPosts: 2,
      mode: "mock",
    }, {
      client: {
        getAuthenticatedUser: async () => ({ avatarUrl: null, displayName: "Creator OS", id: "12345", username: "creatoros" }),
        listUserPosts: async () => ({ posts: fixturePosts, rateLimitResetAt: null }),
      },
    });

    expect(result.status).toBe("succeeded");
    expect(result.recordsCreated).toBe(2);
    expect(inserts.sync_jobs?.[0]).toMatchObject({ job_type: "x_read_sync", status: "running", user_id: "user-1" });
    expect(updates.sync_jobs?.at(-1)?.payload).toMatchObject({ records_created: 2, records_seen: 2, status: "succeeded" });
    expect(inserts.posts).toHaveLength(2);
    expect(inserts.posts?.[0]).toMatchObject({ is_owner_post: true, platform: "x", platform_post_id: "1784230000000000001", source: "x_api" });
    expect(inserts.post_metric_snapshots).toHaveLength(2);
    expect(inserts.post_metric_snapshots?.[1]).toMatchObject({ impression_count: 0, like_count: 9, source: "x_api" });
    expect(auditMock.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "x_sync_succeeded" }));
  });

  it("preserves owner annotations and derived scores when resyncing an existing post", async () => {
    const { rows, supabase, updates } = createSupabaseMock({
      posts: [
        {
          author_display_name: "Creator OS",
          author_username: "creatoros",
          bookmark_count: 0,
          content_pillar: "product",
          created_at: now,
          created_at_platform: "2026-04-27T15:00:00.000Z",
          deleted_at: null,
          engagement_rate: 12.5,
          format: "lesson",
          has_link: false,
          has_media: false,
          heuristic_score: 88,
          hook_type: "contrarian",
          id: "post-existing",
          impression_count: 100,
          imported_at: "2026-04-27T16:00:00.000Z",
          is_owner_post: true,
          like_count: 10,
          media_metadata: {},
          media_view_count: 0,
          metadata: { owner_note: "keep", scoring_version: "manual.v1" },
          platform: "x",
          platform_post_id: "1784230000000000001",
          profile_click_count: 0,
          quality_score: 91,
          quote_count: 0,
          raw_api_payload: {},
          reply_count: 1,
          repost_count: 2,
          source: "manual",
          text: "Older text.",
          tone: "direct",
          topic: "strategy",
          updated_at: now,
          url: "https://x.com/creatoros/status/1784230000000000001",
          url_link_click_count: 0,
          user_id: "user-1",
          video_view_count: 0,
          virality_score: 33,
        },
      ],
    });
    const admin = createAdminContext(supabase);

    const result = await runXReadSync(admin, {
      includeMetrics: true,
      maxPosts: 1,
      mode: "mock",
    }, {
      client: {
        getAuthenticatedUser: async () => ({ avatarUrl: null, displayName: "Creator OS", id: "12345", username: "creatoros" }),
        listUserPosts: async () => ({ posts: [fixturePosts[0]!], rateLimitResetAt: "2026-04-28T17:00:00.000Z" }),
      },
    });

    expect(result.recordsUpdated).toBe(1);
    expect(rows.posts?.[0]).toMatchObject({
      content_pillar: "product",
      format: "lesson",
      heuristic_score: 88,
      hook_type: "contrarian",
      quality_score: 91,
      tone: "direct",
      topic: "strategy",
      virality_score: 33,
    });
    expect(rows.posts?.[0]?.metadata).toMatchObject({ owner_note: "keep", scoring_version: "manual.v1", sync_phase: "16-x-oauth-and-read-sync" });
    expect(updates.sync_jobs?.at(-1)?.payload).toMatchObject({ rate_limit_reset_at: "2026-04-28T17:00:00.000Z" });
  });
});

describe("Phase 16 X settings panel", () => {
  it("allowlists notices, hides token material, and disables live sync without read capability", () => {
    const markup = renderToStaticMarkup(
      React.createElement(XConnectionPanel, {
        connection: {
          avatarUrl: null,
          capabilities: deriveXCapabilities([]),
          displayName: "Creator OS",
          id: "connection-1",
          lastError: null,
          lastSyncedAt: null,
          scopes: ["tweet.read"],
          status: "connected",
          tokenExpiresAt: "2026-04-28T14:00:00.000Z",
          username: "creatoros",
          xUserId: "12345",
        },
        disconnectAction: async () => {},
        notice: "x-access-token-secret",
        syncAction: async () => {},
      }),
    );

    expect(markup).not.toContain("x-access-token-secret");
    expect(markup).toContain("Capability Flags");
    expect(markup).toContain("disabled");
    expect(markup).toContain("disabled=\"\"");
  });
});
