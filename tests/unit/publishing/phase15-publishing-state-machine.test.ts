import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.hoisted(() => ({
  logAuditEvent: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => auditMock);

import { PublishingCalendarView, PublishingWorkspaceView } from "@/components/publishing";
import {
  approvePublishingDraft,
  createPublishingDraft,
  createPublishingDraftFromSource,
  runDryRunPublishingJob,
  scheduleApprovedDraft,
  updatePublishingDraft,
} from "@/lib/publishing";
import { publishingDraftCreateSchema, publishingDraftScheduleSchema } from "@/lib/publishing/validation";
import type { AdminContext } from "@/lib/auth/admin";

type TableRow = Record<string, unknown>;
type SelectFilter = { key: string; op: "eq" | "gte" | "is" | "lte"; value: unknown };

const now = "2026-04-28T12:00:00.000Z";
const future = "2099-04-28T16:30:00.000Z";

function orderedRows(input: TableRow[], key: string | null, ascending: boolean) {
  if (!key) return [...input];
  return [...input].sort((left, right) => {
    const a = left[key];
    const b = right[key];
    if (a === b) return 0;
    return (a ?? "") > (b ?? "") ? (ascending ? 1 : -1) : ascending ? -1 : 1;
  });
}

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
        if (filter.op === "eq" || filter.op === "is") return value === filter.value;
        if (filter.op === "gte") return String(value) >= String(filter.value);
        return String(value) <= String(filter.value);
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
      gte(key: string, value: unknown) {
        filters.push({ key, op: "gte", value });
        return chain;
      },
      is(key: string, value: unknown) {
        filters.push({ key, op: "is", value });
        return chain;
      },
      limit(count: number) {
        const data = orderedRows(filteredRows(table, filters), orderKey, ascending).slice(0, count);
        return Promise.resolve({ data, error: null });
      },
      lte(key: string, value: unknown) {
        filters.push({ key, op: "lte", value });
        return chain;
      },
      maybeSingle() {
        const data = orderedRows(filteredRows(table, filters), orderKey, ascending)[0] ?? null;
        return Promise.resolve({ data, error: null });
      },
      order(key: string, options?: { ascending?: boolean }) {
        orderKey = key;
        ascending = options?.ascending ?? true;
        return chain;
      },
      single() {
        const data = orderedRows(filteredRows(table, filters), orderKey, ascending)[0] ?? null;
        return Promise.resolve({ data, error: data ? null : { message: "not found" } });
      },
      then<TResult1 = { data: TableRow[]; error: null }, TResult2 = never>(
        onfulfilled?: ((value: { data: TableRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve({ data: orderedRows(filteredRows(table, filters), orderKey, ascending), error: null }).then(onfulfilled, onrejected);
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

describe("Phase 15 publishing validation", () => {
  it("parses draft and schedule payloads while rejecting empty publishable content", () => {
    expect(
      publishingDraftCreateSchema.parse({
        content_type: "thread",
        source_type: "generated_output",
        text: "",
        thread_items: JSON.stringify(["First thread post.", "Second thread post."]),
      }),
    ).toMatchObject({ contentType: "thread", sourceType: "generated_output", threadItems: ["First thread post.", "Second thread post."] });

    expect(publishingDraftCreateSchema.safeParse({ content_type: "single_post", text: "   " }).success).toBe(false);
    expect(publishingDraftScheduleSchema.safeParse({ id: "draft-1", scheduled_for: "not-a-date", timezone: "America/New_York" }).success).toBe(false);
    expect(publishingDraftScheduleSchema.parse({ id: "draft-1", scheduled_for: future, timezone: "America/New_York" })).toMatchObject({ timezone: "America/New_York" });
  });
});

describe("Phase 15 publishing services", () => {
  it("requires owner approval before scheduling and invalidates approval on content edits", async () => {
    const generatedOutputId = "550e8400-e29b-41d4-a716-446655440101";
    const { inserts, supabase, updates } = createSupabaseMock({
      generated_outputs: [
        {
          archived_at: null,
          copied_at: null,
          created_at: now,
          deleted_at: null,
          favorite: false,
          id: generatedOutputId,
          input_id: null,
          input_type: "blog_post",
          metadata: {},
          model: "mock-model",
          prompt_version: "blog-to-x.v1",
          provider: "mock",
          saved: true,
          text: "First thread post.\n\nSecond thread post.",
          type: "x_thread",
          updated_at: now,
          user_id: "user-1",
          variants: [],
        },
      ],
    });
    const admin = createAdminContext(supabase);

    const draft = await createPublishingDraftFromSource(admin, {
      sourceId: generatedOutputId,
      sourceType: "generated_output",
    });

    expect(draft.status).toBe("ai_generated");
    expect(draft.contentType).toBe("thread");
    expect(inserts.publishing_drafts?.[0]).toMatchObject({ source_generated_output_id: generatedOutputId, status: "ai_generated", user_id: "user-1" });
    await expect(scheduleApprovedDraft(admin, { id: draft.id, scheduledFor: future, timezone: "America/New_York" })).rejects.toThrow(/approved/i);

    const approved = await approvePublishingDraft(admin, {
      confirmation: "approve exact payload",
      id: draft.id,
    });

    expect(approved.status).toBe("approved");
    expect(approved.approvalStatus).toBe("approved");
    expect(approved.approvalPayloadHash).toMatch(/^[a-f0-9]{64}$/);

    const scheduled = await scheduleApprovedDraft(admin, {
      id: draft.id,
      scheduledFor: future,
      timezone: "America/New_York",
    });

    expect(scheduled.draft.status).toBe("scheduled");
    expect(inserts.scheduled_posts?.[0]).toMatchObject({ publishing_draft_id: draft.id, scheduled_for: future, status: "scheduled" });
    expect(inserts.content_calendar_items?.[0]).toMatchObject({ entity_id: draft.id, item_type: "publishing", status: "scheduled" });

    const edited = await updatePublishingDraft(admin, {
      id: draft.id,
      text: "Owner changed the approved payload.",
    });

    expect(edited.status).toBe("owner_edited");
    expect(edited.approvalStatus).toBe("invalidated");
    expect(updates.publishing_drafts?.at(-1)?.payload).toMatchObject({ approval_payload_hash: null, approval_status: "invalidated" });
    expect(auditMock.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "publishing_draft_approved" }));
    expect(auditMock.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "publishing_scheduled" }));
  });

  // SCA-471 (C-1): updatePayloadForDraft used `=` instead of `||=`, so a later
  // per-field branch could silently reset an earlier change to false. The
  // canonical bad path was mediaAssetIds (→ true) followed by text equal to
  // current.text (→ false) — the draft kept its prior approval_payload_hash
  // even though the publishable payload had materially changed.
  it("SCA-471 regression: multi-field update with no-op text + media change still invalidates approval", async () => {
    const { inserts, updates, supabase } = createSupabaseMock();
    const admin = createAdminContext(supabase);

    const draft = await createPublishingDraft(admin, {
      contentType: "single_post",
      sourceType: "manual",
      text: "Owner draft for multi-field update regression.",
    });
    const approved = await approvePublishingDraft(admin, {
      confirmation: "approve exact payload",
      id: draft.id,
    });
    expect(approved.approvalStatus).toBe("approved");
    expect(approved.approvalPayloadHash).not.toBeNull();

    const mediaAssetId = "00000000-0000-0000-0000-000000000abc";
    inserts.media_assets = [
      {
        id: mediaAssetId,
        user_id: admin.userId,
        mime_type: "image/png",
        metadata: {},
        x_media_id: null,
        x_upload_status: "not_uploaded",
        size_bytes: 1024,
        deleted_at: null,
      },
    ];

    const edited = await updatePublishingDraft(admin, {
      id: draft.id,
      mediaAssetIds: [mediaAssetId],
      // Same text as approved payload — the `=` bug would set contentChanged
      // back to false and SKIP approval invalidation. With `||=`, the prior
      // `true` from mediaAssetIds wins.
      text: approved.text,
    });

    expect(edited.status).toBe("owner_edited");
    expect(edited.approvalStatus).toBe("invalidated");
    expect(edited.approvalPayloadHash).toBeNull();
    expect(updates.publishing_drafts?.at(-1)?.payload).toMatchObject({
      approval_payload_hash: null,
      approval_status: "invalidated",
    });
  });

  it("creates deterministic dry-run jobs and failure rows without published posts or external calls", async () => {
    const { inserts, supabase } = createSupabaseMock();
    const admin = createAdminContext(supabase);

    const draft = await createPublishingDraft(admin, {
      contentType: "single_post",
      sourceType: "manual",
      text: "[dry-run-fail] A deterministic dry run failure for queue testing.",
    });
    const approved = await approvePublishingDraft(admin, {
      confirmation: "approve exact payload",
      id: draft.id,
    });

    const result = await runDryRunPublishingJob(admin, {
      id: approved.id,
      payloadHash: approved.approvalPayloadHash,
    });

    expect(result.job.status).toBe("failed");
    expect(result.failure?.retryable).toBe(true);
    expect(inserts.publishing_jobs?.[0]).toMatchObject({ job_type: "dry_run", publishing_draft_id: draft.id, status: "failed" });
    expect(inserts.publishing_failures?.[0]).toMatchObject({ failure_type: "dry_run_simulated_failure", publishing_draft_id: draft.id, retryable: true });
    expect(JSON.stringify(inserts.publishing_jobs?.[0]?.x_response_payload)).toContain("external_call");
    expect(inserts.published_posts).toBeUndefined();
  });
});

describe("Phase 15 publishing UI", () => {
  it("renders queue, approval rail, failure card, and calendar cells", () => {
    const draft = {
      approvalPayloadHash: "abc123",
      approvalStatus: "approved",
      approvedAt: now,
      campaignId: null,
      contentType: "single_post",
      createdAt: now,
      duplicateCheck: { status: "clear" },
      experimentId: null,
      id: "draft-1",
      mediaAssetIds: [],
      metadata: {},
      quotePostId: null,
      replyToPostId: null,
      riskCheck: { warnings: [] },
      scheduledAt: future,
      similarityCheck: { status: "clear" },
      sourceId: null,
      sourceType: "manual",
      status: "scheduled",
      text: "Exact approved payload for the owner to inspect.",
      threadItems: [],
      timezone: "America/New_York",
      updatedAt: now,
    };
    const failure = {
      createdAt: now,
      failureType: "dry_run_simulated_failure",
      id: "failure-1",
      jobId: "job-1",
      message: "Dry run failed before external write.",
      retryAfter: null,
      retryable: true,
    };

    const publishingMarkup = renderToStaticMarkup(
      React.createElement(PublishingWorkspaceView, {
        approveAction: async () => {},
        cancelAction: async () => {},
        createAction: async () => {},
        dryRunAction: async () => {},
        editAction: async () => {},
        retryAction: async () => {},
        scheduleAction: async () => {},
        selectedDraftId: "draft-1",
        workspace: {
          drafts: [draft],
          failures: [failure],
          jobs: [
            {
              attemptCount: 1,
              completedAt: now,
              createdAt: now,
              draftId: "draft-1",
              error: "Dry run failed before external write.",
              errorCode: "dry_run_simulated_failure",
              id: "job-1",
              idempotencyKey: "dry-run:draft-1:abc123",
              jobType: "dry_run",
              scheduledFor: null,
              startedAt: now,
              status: "failed",
            },
          ],
          metrics: { approved: 1, failed: 1, needsApproval: 0, scheduled: 1 },
          scheduledPosts: [
            {
              calendarItemId: "calendar-1",
              draftId: "draft-1",
              id: "scheduled-1",
              scheduledFor: future,
              status: "scheduled",
              timezone: "America/New_York",
            },
          ],
        },
      }),
    );

    expect(publishingMarkup).toContain("Publishing queue");
    expect(publishingMarkup).toContain("Approval rail");
    expect(publishingMarkup).toContain("Dry run");
    expect(publishingMarkup).toContain("Exact approved payload");
    expect(publishingMarkup).toContain("dry_run_simulated_failure");

    const calendarMarkup = renderToStaticMarkup(
      React.createElement(PublishingCalendarView, {
        calendar: {
          days: [
            {
              date: "2099-04-28",
              items: [
                {
                  draftId: "draft-1",
                  id: "calendar-1",
                  scheduledFor: future,
                  status: "scheduled",
                  text: "Exact approved payload for the owner to inspect.",
                  timezone: "America/New_York",
                  title: "single_post draft",
                  type: "single_post",
                },
              ],
              load: 1,
              warning: null,
            },
          ],
          timezone: "America/New_York",
          totals: { failed: 0, scheduled: 1, warningDays: 0 },
        },
      }),
    );

    expect(calendarMarkup).toContain("Content calendar");
    expect(calendarMarkup).toContain("CalendarDayCell");
    expect(calendarMarkup).toContain("America/New_York");
    expect(calendarMarkup).toContain("Exact approved payload");
  });
});
