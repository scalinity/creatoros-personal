import { afterEach, describe, expect, it, vi } from "vitest";

process.env.ENCRYPTION_KEY = "test-encryption-key-that-is-at-least-32-bytes";

const auditMock = vi.hoisted(() => ({
  logAuditEvent: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => auditMock);

import type { AdminContext } from "@/lib/auth/admin";
import { computePublishingPayloadHash, runXPublishingJob } from "@/lib/publishing";
import { XApiError, createLiveXPublishingClient, type XPublishingClient } from "@/lib/x/client";
import { buildXAuthorizationUrl, deriveXCapabilities, type DecryptedXConnection } from "@/lib/x/oauth";
import { xPublishSchema } from "@/lib/x/validation";

type TableRow = Record<string, unknown>;
type SelectFilter = { key: string; op: "eq" | "in" | "is" | "lte"; value: unknown };

const now = "2026-04-28T12:00:00.000Z";
const approvedAt = "2026-04-28T11:00:00.000Z";

function createSupabaseMock(seedRows: Record<string, TableRow[]> = {}) {
  const inserts: Record<string, TableRow[]> = {};
  const rows: Record<string, TableRow[]> = Object.fromEntries(Object.entries(seedRows).map(([table, seeded]) => [table, seeded.map((row) => ({ ...row }))]));
  const updates: Record<string, TableRow[]> = {};
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
        if (filter.op === "lte") return String(value) <= String(filter.value);
        if (filter.op === "in") {
          return Array.isArray(filter.value) && (filter.value as unknown[]).includes(value);
        }
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
      lte(key: string, value: unknown) {
        filters.push({ key, op: "lte", value });
        return chain;
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
    function applyUpdate() {
      const matching = filteredRows(table, filters);
      const updated: TableRow[] = [];
      rows[table] = (rows[table] ?? []).map((row) => {
        if (!matching.includes(row)) return row;
        const next = { ...row, ...payload, updated_at: now };
        updated.push(next);
        return next;
      });
      updates[table] = [...(updates[table] ?? []), { filters, payload }];
      return updated;
    }

    const chain = {
      eq(key: string, value: unknown) {
        filters.push({ key, op: "eq", value });
        return chain;
      },
      in(key: string, value: unknown) {
        filters.push({ key, op: "in", value });
        return chain;
      },
      is(key: string, value: unknown) {
        filters.push({ key, op: "is", value });
        return chain;
      },
      select() {
        return {
          async maybeSingle() {
            const updated = applyUpdate();
            return { data: updated[0] ?? null, error: null };
          },
          async single() {
            const updated = applyUpdate();
            const data = updated[0] ?? null;
            return { data, error: data ? null : { message: "not found" } };
          },
        };
      },
      then<TResult1 = { error: null }, TResult2 = never>(
        onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        applyUpdate();
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

function draftHash(input: {
  contentType: string;
  connection?: null | DecryptedXConnection;
  mediaAssetIds?: string[];
  quotePostId?: null | string;
  replyToPostId?: null | string;
  text?: string;
  threadItems?: string[];
}) {
  return computePublishingPayloadHash(
    {
      approvalPayloadHash: null,
      approvalStatus: "approved",
      approvedAt,
      campaignId: null,
      contentType: input.contentType,
      createdAt: now,
      duplicateCheck: { status: "clear" },
      experimentId: null,
      id: "draft-1",
      mediaAssetIds: input.mediaAssetIds ?? [],
      metadata: {},
      quotePostId: input.quotePostId ?? null,
      replyToPostId: input.replyToPostId ?? null,
      riskCheck: { blocking: false, warnings: [] },
      scheduledAt: null,
      similarityCheck: { status: "clear" },
      sourceId: null,
      sourceType: "manual",
      status: "approved",
      text: input.text ?? "",
      threadItems: input.threadItems ?? [],
      timezone: "UTC",
      updatedAt: now,
    },
    input.connection,
  );
}

function approvedDraft(overrides: TableRow = {}, approvalConnection?: null | DecryptedXConnection) {
  const contentType = String(overrides.content_type ?? "single_post");
  const mediaAssetIds = (overrides.media_asset_ids as string[] | undefined) ?? [];
  const quotePostId = (overrides.quote_post_id as null | string | undefined) ?? null;
  const replyToPostId = (overrides.reply_to_post_id as null | string | undefined) ?? null;
  const text = String(overrides.text ?? "Live post approved by the owner.");
  const threadItems = (overrides.thread_items as string[] | undefined) ?? [];

  return {
    approval_payload_hash: draftHash({ connection: approvalConnection, contentType, mediaAssetIds, quotePostId, replyToPostId, text, threadItems }),
    approval_status: "approved",
    approved_at: approvedAt,
    approved_by: "user-1",
    campaign_id: null,
    content_type: contentType,
    created_at: now,
    deleted_at: null,
    duplicate_check: { status: "clear" },
    experiment_id: null,
    id: "draft-1",
    media_asset_ids: mediaAssetIds,
    metadata: {},
    quote_post_id: quotePostId,
    reply_to_post_id: replyToPostId,
    risk_check: { blocking: false, warnings: [] },
    scheduled_at: null,
    similarity_check: { status: "clear" },
    source_content_idea_id: null,
    source_generated_output_id: null,
    source_id: null,
    source_post_id: null,
    source_type: "manual",
    status: "approved",
    text,
    thread_items: threadItems,
    timezone: "UTC",
    updated_at: now,
    user_id: "user-1",
    ...overrides,
  };
}

function connectedX(overrides: TableRow = {}) {
  return {
    avatar_url: null,
    capabilities: deriveXCapabilities(["tweet.read", "users.read", "tweet.write", "media.write"], { enterprise_quote_post_enabled: true }),
    created_at: now,
    deleted_at: null,
    display_name: "Creator OS",
    encrypted_access_token: "encrypted-token-not-used-in-test",
    encrypted_refresh_token: null,
    id: "x-connection-1",
    last_error: null,
    last_synced_at: null,
    metadata: {},
    scopes: ["tweet.read", "users.read", "tweet.write", "media.write"],
    status: "connected",
    token_expires_at: "2099-04-28T12:00:00.000Z",
    updated_at: now,
    user_id: "user-1",
    username: "creatoros",
    x_user_id: "12345",
    ...overrides,
  };
}

function decryptedConnection(row: TableRow): DecryptedXConnection {
  return {
    accessToken: "test-token",
    avatarUrl: (row.avatar_url as null | string) ?? null,
    capabilities: row.capabilities as DecryptedXConnection["capabilities"],
    displayName: (row.display_name as null | string) ?? null,
    encryptedRefreshToken: null,
    id: String(row.id),
    lastError: (row.last_error as null | string) ?? null,
    lastSyncedAt: (row.last_synced_at as null | string) ?? null,
    refreshToken: null,
    scopes: row.scopes as string[],
    status: String(row.status) as DecryptedXConnection["status"],
    tokenExpiresAt: (row.token_expires_at as null | string) ?? null,
    username: (row.username as null | string) ?? null,
    xUserId: (row.x_user_id as null | string) ?? null,
  };
}

function publishingClient(responses: Array<{ id: string; text: string }> = [{ id: "1785000000000000001", text: "Live post approved by the owner." }]): XPublishingClient {
  return {
    async createPost(payload) {
      const next = responses.shift();
      if (!next) throw new Error(`No mocked X response queued for ${payload.text ?? "post"}.`);
      return { ...next, raw: { data: next }, rateLimitResetAt: null };
    },
    async deletePost(id) {
      return { deleted: true, id, raw: { data: { deleted: true } }, rateLimitResetAt: null };
    },
    async uploadMedia() {
      throw new Error("Unexpected media upload in this test.");
    },
  };
}

afterEach(() => {
  auditMock.logAuditEvent.mockClear();
});

describe("Phase 17 X write client", () => {
  it("posts to the official X create endpoint with sanitized JSON", async () => {
    const requests: Array<{ body: unknown; url: string }> = [];
    const client = createLiveXPublishingClient("secret-token", {
      fetchImpl: (async (url, init) => {
        requests.push({ body: JSON.parse(String(init?.body)), url: String(url) });
        return new Response(JSON.stringify({ data: { id: "1785000000000000001", text: "hello" } }), { status: 201 });
      }) as typeof fetch,
    });

    const result = await client.createPost({ text: "hello" });

    expect(result.id).toBe("1785000000000000001");
    expect(requests).toEqual([{ body: { text: "hello" }, url: "https://api.x.com/2/tweets" }]);
  });
});

describe("Phase 17 publishing executor", () => {
  it("requires explicit confirmation for live X publish validation", () => {
    expect(
      xPublishSchema.safeParse({
        dry_run: false,
        payload_hash: "abc123",
        publishing_draft_id: "draft-1",
      }).success,
    ).toBe(false);
  });

  it("publishes only an approved exact payload and reconciles the X post", async () => {
    const connection = connectedX();
    const decrypted = decryptedConnection(connection);
    const draft = approvedDraft({}, decrypted);
    const { inserts, supabase, updates } = createSupabaseMock({ publishing_drafts: [draft], x_connections: [connection] });
    const admin = createAdminContext(supabase);

    const result = await runXPublishingJob(
      admin,
      {
        confirmation: "confirm live publish",
        id: "draft-1",
        payloadHash: String(draft.approval_payload_hash),
      },
      {
        client: publishingClient(),
        connection: decrypted,
        mode: "live",
        now: () => new Date(now),
      },
    );

    expect(result.job.status).toBe("succeeded");
    expect(result.publishedPost?.platformPostId).toBe("1785000000000000001");
    expect(inserts.publishing_jobs?.[0]).toMatchObject({ job_type: "publish", publishing_draft_id: "draft-1", status: "running" });
    expect(updates.publishing_jobs?.at(-1)?.payload).toMatchObject({ status: "succeeded" });
    expect(inserts.published_posts?.[0]).toMatchObject({ content_type: "single_post", platform: "x", platform_post_id: "1785000000000000001" });
    expect(inserts.posts?.[0]).toMatchObject({ is_owner_post: true, platform_post_id: "1785000000000000001", source: "x_api_publish" });
    expect(inserts.post_metric_snapshots?.[0]).toMatchObject({ source: "x_api_publish" });
    expect(updates.publishing_drafts?.at(-1)?.payload).toMatchObject({ status: "published" });
    expect(auditMock.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "x_publish_succeeded" }));
  });

  it("records a retryable rate-limit failure without a published post", async () => {
    const connection = connectedX();
    const decrypted = decryptedConnection(connection);
    const draft = approvedDraft({}, decrypted);
    const rateLimitedClient: XPublishingClient = {
      async createPost() {
        throw new XApiError("X API request failed with status 429.", {
          code: "rate_limited",
          rateLimitResetAt: "2026-04-28T13:00:00.000Z",
          retryable: true,
          status: 429,
        });
      },
      async deletePost() {
        throw new Error("Unexpected delete.");
      },
      async uploadMedia() {
        throw new Error("Unexpected upload.");
      },
    };
    const { inserts, supabase, updates } = createSupabaseMock({ publishing_drafts: [draft], x_connections: [connection] });
    const admin = createAdminContext(supabase);

    const result = await runXPublishingJob(
      admin,
      {
        confirmation: "confirm live publish",
        id: "draft-1",
        payloadHash: String(draft.approval_payload_hash),
      },
      {
        client: rateLimitedClient,
        connection: decrypted,
        mode: "live",
        now: () => new Date(now),
      },
    );

    expect(result.job.status).toBe("failed");
    expect(result.failure?.retryable).toBe(true);
    expect(inserts.publishing_failures?.[0]).toMatchObject({ failure_type: "rate_limited", retry_after: "2026-04-28T13:00:00.000Z", retryable: true });
    expect(inserts.published_posts).toBeUndefined();
    expect(updates.publishing_drafts?.at(-1)?.payload).toMatchObject({ status: "failed" });
  });

  it("publishes thread posts in order and records partial failure state", async () => {
    const connection = connectedX();
    const decrypted = decryptedConnection(connection);
    const draft = approvedDraft({
      content_type: "thread",
      text: "",
      thread_items: ["Root thread post.", "Second thread reply.", "Third thread reply."],
    }, decrypted);
    const client: XPublishingClient = {
      async createPost(payload) {
        if (payload.text === "Third thread reply.") {
          throw new Error("X returned a sanitized thread failure.");
        }

        const id = payload.text === "Root thread post." ? "1785000000000000100" : "1785000000000000101";
        return { id, raw: { data: { id, text: payload.text } }, rateLimitResetAt: null, text: payload.text ?? "" };
      },
      async deletePost() {
        throw new Error("Unexpected delete.");
      },
      async uploadMedia() {
        throw new Error("Unexpected upload.");
      },
    };
    const { inserts, supabase } = createSupabaseMock({ publishing_drafts: [draft], x_connections: [connection] });
    const admin = createAdminContext(supabase);

    const result = await runXPublishingJob(
      admin,
      {
        confirmation: "confirm live publish",
        id: "draft-1",
        payloadHash: String(draft.approval_payload_hash),
      },
      {
        client,
        connection: decrypted,
        mode: "live",
        now: () => new Date(now),
      },
    );

    expect(result.job.status).toBe("failed");
    expect(result.publishedPost?.threadPostIds).toEqual(["1785000000000000100", "1785000000000000101"]);
    expect(result.failure?.failureType).toBe("thread_partial_failure");
    expect(inserts.published_posts?.[0]).toMatchObject({ platform_post_id: "1785000000000000100", thread_post_ids: ["1785000000000000100", "1785000000000000101"] });
    expect(inserts.publishing_failures?.[0]).toMatchObject({ failure_type: "thread_partial_failure", retryable: false });
  });

  it("blocks quote publishing when the Enterprise quote capability is disabled", async () => {
    const connection = connectedX({
      capabilities: deriveXCapabilities(["tweet.read", "users.read", "tweet.write"], { enterprise_quote_post_enabled: false }),
      scopes: ["tweet.read", "users.read", "tweet.write"],
    });
    const decrypted = decryptedConnection(connection);
    const draft = approvedDraft({ content_type: "quote_post", quote_post_id: "1784000000000000001", text: "Quote with explicit approval." }, decrypted);
    const { inserts, supabase } = createSupabaseMock({ publishing_drafts: [draft], x_connections: [connection] });
    const admin = createAdminContext(supabase);

    // SCA-520 (S-14): capability + approval-payload checks now run BEFORE
    // the CAS that flips status to `publishing`. A capability-disabled
    // draft throws XPublishingGuardError immediately rather than burning
    // a publishing transition and recording a no-op failure row.
    await expect(
      runXPublishingJob(
        admin,
        {
          confirmation: "confirm live publish",
          id: "draft-1",
          payloadHash: String(draft.approval_payload_hash),
        },
        {
          client: publishingClient(),
          connection: decrypted,
          mode: "live",
          now: () => new Date(now),
        },
      ),
    ).rejects.toMatchObject({ code: "capability_disabled", name: "XPublishingGuardError" });
    expect(inserts.published_posts).toBeUndefined();
    expect(inserts.publishing_jobs).toBeUndefined();
  });

  it("rejects live publish when approval was bound to a different X account", async () => {
    const approvedConnection = decryptedConnection(connectedX({ username: "creatoros", x_user_id: "12345" }));
    const currentConnection = connectedX({ username: "otheraccount", x_user_id: "99999" });
    const draft = approvedDraft({}, approvedConnection);
    const { inserts, supabase } = createSupabaseMock({ publishing_drafts: [draft], x_connections: [currentConnection] });
    const admin = createAdminContext(supabase);
    const client = publishingClient();
    const createSpy = vi.spyOn(client, "createPost");

    // SCA-520 (S-14): payload-hash freshness now checked BEFORE the CAS.
    // A draft approved for a different X account has a stale hash relative
    // to the current connection and throws immediately rather than passing
    // through the publishing transition.
    await expect(
      runXPublishingJob(
        admin,
        {
          confirmation: "confirm live publish",
          id: "draft-1",
          payloadHash: String(draft.approval_payload_hash),
        },
        {
          client,
          connection: decryptedConnection(currentConnection),
          mode: "live",
          now: () => new Date(now),
        },
      ),
    ).rejects.toMatchObject({ code: "payload_mismatch", name: "XPublishingGuardError" });
    expect(createSpy).not.toHaveBeenCalled();
    expect(inserts.published_posts).toBeUndefined();
  });

  it("C-1 regression: a retry whose draft was already re-published is rejected by the status CAS", async () => {
    // Simulate the race: another publish path already transitioned the draft
    // out of `failed` (e.g. a parallel retry won the CAS first and is in
    // `publishing` or has already moved it to `published`). The second retry
    // then walks into runXPublishingJob and the CAS update returns zero rows.
    const connection = connectedX();
    const decrypted = decryptedConnection(connection);
    const draft = approvedDraft({ status: "publishing" }, decrypted);
    const { inserts, supabase } = createSupabaseMock({ publishing_drafts: [draft], x_connections: [connection] });
    const admin = createAdminContext(supabase);
    const client = publishingClient();
    const createSpy = vi.spyOn(client, "createPost");

    await expect(
      runXPublishingJob(
        admin,
        { confirmation: "confirm live publish", id: "draft-1", payloadHash: String(draft.approval_payload_hash) },
        { client, connection: decrypted, jobType: "retry", mode: "live", now: () => new Date(now), priorFailedJobId: "prior-failed-job-1" },
      ),
    ).rejects.toMatchObject({ code: "status_conflict" });

    // No publishing_jobs row is created because the CAS bails before
    // createLivePublishingJob.
    expect(inserts.publishing_jobs).toBeUndefined();
    // No external X call.
    expect(createSpy).not.toHaveBeenCalled();
    // No published_posts row.
    expect(inserts.published_posts).toBeUndefined();
  });

  it("C-1 regression: a retry on a still-failed draft uses a deterministic idempotency key bound to the prior job", async () => {
    const connection = connectedX();
    const decrypted = decryptedConnection(connection);
    const draft = approvedDraft({ status: "failed" }, decrypted);
    const { inserts, supabase } = createSupabaseMock({ publishing_drafts: [draft], x_connections: [connection] });
    const admin = createAdminContext(supabase);
    const client = publishingClient();

    await runXPublishingJob(
      admin,
      { confirmation: "confirm live publish", id: "draft-1", payloadHash: String(draft.approval_payload_hash) },
      { client, connection: decrypted, jobType: "retry", mode: "live", now: () => new Date(now), priorFailedJobId: "prior-failed-job-7" },
    );

    const job = inserts.publishing_jobs?.[0];
    expect(job).toBeDefined();
    expect(String(job?.idempotency_key ?? "")).toContain(":retry-of:prior-failed-job-7");
    // The key must NOT contain a UUID — that was the C-1 randomisation we removed.
    expect(String(job?.idempotency_key ?? "")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe("Phase 17 OAuth scope escalation", () => {
  it("hard-gates publishing scopes to the allowed X write scopes", () => {
    const { scopes } = buildXAuthorizationUrl(
      {
        codeChallenge: "challenge",
        mode: "publishing",
        publishingScopes: ["tweet.write"],
        state: "state",
      },
      {
        X_CLIENT_ID: "client",
        X_CLIENT_SECRET: "secret",
        X_DEFAULT_SCOPES: "tweet.read users.read offline.access",
        X_PUBLISHING_SCOPES: "tweet.write dm.write follows.write media.write",
        X_REDIRECT_URI: "https://creatoros.example/api/x/oauth/callback",
      } as unknown as NodeJS.ProcessEnv,
    );

    expect(scopes).toEqual(["tweet.read", "users.read", "offline.access", "tweet.write"]);
  });
});
