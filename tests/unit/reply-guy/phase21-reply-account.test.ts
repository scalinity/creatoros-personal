import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.hoisted(() => ({
  logAuditEvent: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => auditMock);

import { AccountResearchWorkspaceView } from "@/components/account-research";
import { ReplyGuyWorkspaceView } from "@/components/reply-guy";
import { createMockAiProvider } from "@/lib/ai/providers/mock";
import { runAccountResearch, saveAccountResearchIdea } from "@/lib/account-research";
import { accountResearchInputSchema } from "@/lib/account-research/validation";
import {
  createReplyPublishingDraft,
  createTargetAccount,
  generateReplyDrafts,
  importTargetAccountPost,
  loadReplyGuyWorkspace,
  markReplyDraftCopied,
  markReplyDraftUsed,
} from "@/lib/reply-guy";
import { parsePastedTargetPosts, replyGenerationSchema, targetPostImportSchema } from "@/lib/reply-guy/validation";
import type { AdminContext } from "@/lib/auth/admin";

type TableRow = Record<string, unknown>;
type SelectFilter = { key: string; op: "eq" | "is"; value: unknown };

const now = "2026-04-28T12:00:00.000Z";

function orderedRows(rows: TableRow[], key: string | null, ascending: boolean) {
  if (!key) return [...rows];
  return [...rows].sort((left, right) => {
    const a = left[key];
    const b = right[key];
    if (a === b) return 0;
    return String(a ?? "") > String(b ?? "") ? (ascending ? 1 : -1) : ascending ? -1 : 1;
  });
}

function createSupabaseMock(seedRows: Record<string, TableRow[]> = {}) {
  const inserts: Record<string, TableRow[]> = {};
  const rows: Record<string, TableRow[]> = Object.fromEntries(
    Object.entries(seedRows).map(([table, seeded]) => [table, seeded.map((row) => ({ ...row }))]),
  );
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
        return value === filter.value;
      }),
    );
  }

  function selectChain(table: string) {
    const filters: SelectFilter[] = [];
    let orderKey: string | null = null;
    let ascending = true;
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
        return Promise.resolve({ data: orderedRows(filteredRows(table, filters), orderKey, ascending).slice(0, count), error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: orderedRows(filteredRows(table, filters), orderKey, ascending)[0] ?? null, error: null });
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
    updates,
    supabase: {
      from(table: string) {
        return {
          insert(payload: TableRow | TableRow[]) {
            const payloads = Array.isArray(payload) ? payload : [payload];
            const insertedRows = payloads.map((item) => rowFor(table, item));
            inserts[table] = [...(inserts[table] ?? []), ...payloads];
            rows[table] = [...(rows[table] ?? []), ...insertedRows];
            return {
              select() {
                return {
                  async single() {
                    return { data: insertedRows[0] ?? null, error: insertedRows[0] ? null : { message: "missing row" } };
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

function replyProvider() {
  return createMockAiProvider({
    responses: [
      {
        content: JSON.stringify({
          drafts: [
            { rationale: "Adds a concrete systems angle without selling.", text: "This is useful because the quiet system is usually what makes the visible work repeatable." },
            { rationale: "Asks one specific follow-up question.", text: "Curious how you decide which part of the workflow deserves automation first." },
          ],
          hostility_risk: "low",
          risk_notes: ["Owner approval required before any external reply."],
        }),
      },
    ],
  });
}

function accountProvider() {
  return createMockAiProvider({
    responses: [
      {
        content: JSON.stringify({
          audience_hypotheses: ["Operators who like practical systems."],
          blog_ideas: ["How quiet systems make public work consistent"],
          campaign_ideas: ["One week of behind-the-scenes workflow lessons"],
          content_pillars: ["systems", "craft"],
          ethical_learnings: ["Abstract the proof pattern, not the phrasing."],
          format_patterns: ["short hook plus concrete payoff"],
          hook_patterns: ["contrast visible output with hidden process"],
          idea_seeds: ["Turn private workflow constraints into public operating notes."],
          patterns: ["They pair a sharp opening with one operational takeaway."],
          positioning: "Practical operator voice for creators building systems.",
          reply_strategy: ["Ask precise implementation questions.", "Add one useful constraint from owner experience."],
        }),
      },
    ],
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  auditMock.logAuditEvent.mockClear();
});

describe("Phase 21 validation", () => {
  it("normalizes target-account inputs and caps reply generation to one selected post", () => {
    const pasted = parsePastedTargetPosts("https://x.com/systems/status/1\nFirst useful post.\n\nSecond useful post.");
    expect(pasted).toHaveLength(2);
    expect(pasted[0]).toMatchObject({ platformPostId: "1", url: "https://x.com/systems/status/1" });

    expect(
      replyGenerationSchema.parse({
        count: "3",
        original_post_text: "A target post worth answering thoughtfully.",
        reply_type: "thoughtful_value_add",
      }),
    ).toMatchObject({ count: 3, replyType: "thoughtful_value_add" });
    expect(replyGenerationSchema.safeParse({ count: 12, original_post_text: "mass reply me" }).success).toBe(false);
    expect(accountResearchInputSchema.safeParse({ username: "@systems", pasted_posts: "" }).success).toBe(true);
    expect(accountResearchInputSchema.safeParse({ username: "", pasted_posts: "" }).success).toBe(false);
  });

  it("accepts only numeric X status ids and HTTPS X status URLs", () => {
    expect(targetPostImportSchema.safeParse({ target_account_id: "target-1", text: "A target post.", url: "javascript:alert(1)" }).success).toBe(false);
    expect(targetPostImportSchema.safeParse({ platform_post_id: "not-a-number", target_account_id: "target-1", text: "A target post." }).success).toBe(false);
    expect(
      targetPostImportSchema.parse({ target_account_id: "target-1", text: "A target post.", url: "https://twitter.com/Systems/status/42" }),
    ).toMatchObject({ authorUsername: "systems", platformPostId: "42", url: "https://x.com/systems/status/42" });
    expect(targetPostImportSchema.safeParse({ platform_post_id: "41", target_account_id: "target-1", text: "A target post.", url: "https://x.com/systems/status/42" }).success).toBe(false);
  });
});

describe("Phase 21 reply-guy services", () => {
  it("rejects unsafe service-level reply counts and mismatched target accounts", async () => {
    const db = createSupabaseMock({
      target_account_posts: [
        {
          bookmark_count: 0,
          created_at: now,
          created_at_platform: now,
          deleted_at: null,
          id: "post-1",
          impression_count: 0,
          like_count: 1,
          metadata: {},
          platform: "x",
          platform_post_id: "12345",
          quote_count: 0,
          raw_api_payload: {},
          reply_count: 0,
          repost_count: 0,
          source: "manual",
          target_account_id: "target-1",
          text: "A target post.",
          updated_at: now,
          url: "https://x.com/target/status/12345",
          user_id: "user-1",
        },
      ],
      target_accounts: [
        { created_at: now, deleted_at: null, display_name: null, id: "target-1", last_synced_at: null, list_name: null, metadata: {}, niche: null, notes: null, priority: 1, updated_at: now, user_id: "user-1", username: "target" },
        { created_at: now, deleted_at: null, display_name: null, id: "target-2", last_synced_at: null, list_name: null, metadata: {}, niche: null, notes: null, priority: 1, updated_at: now, user_id: "user-1", username: "other" },
      ],
    });
    const admin = createAdminContext(db.supabase);

    await expect(generateReplyDrafts(admin, { count: 12, originalPostText: "A target post.", replyType: "question" }, { provider: replyProvider() })).rejects.toThrow();
    await expect(generateReplyDrafts(admin, { count: 1, replyType: "question", targetAccountId: "target-2", targetPostId: "post-1" }, { provider: replyProvider() })).rejects.toThrow("Target account does not match");
    expect(db.inserts.reply_drafts).toBeUndefined();
  });

  it("saves a target account, imports one target post, generates reply drafts, and tracks copied/used state", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_MODEL", "mock-model");
    const db = createSupabaseMock();
    const admin = createAdminContext(db.supabase);

    const account = await createTargetAccount(admin, { displayName: "Systems Writer", listName: "operators", niche: "systems", notes: "Respectful, practical replies only.", priority: 3, username: "@Systems" });
    const post = await importTargetAccountPost(admin, {
      likeCount: 44,
      replyCount: 8,
      targetAccountId: account.id,
      text: "The visible work gets all the credit, but the capture system decides whether it repeats.",
      url: "https://x.com/systems/status/1",
    });
    const generated = await generateReplyDrafts(admin, { count: 2, replyType: "thoughtful_value_add", targetPostId: post.id }, { provider: replyProvider() });

    expect(account.username).toBe("systems");
    expect(db.inserts.target_account_posts?.[0]).toMatchObject({ source: "manual", user_id: "user-1" });
    expect(generated.drafts).toHaveLength(2);
    expect(db.inserts.reply_drafts).toHaveLength(2);
    expect(db.inserts.reply_drafts?.[0]).toMatchObject({ original_post_text: expect.stringContaining("visible work"), status: "draft", target_post_id: post.id });
    expect(JSON.stringify(db.inserts.reply_drafts?.[0]?.metadata)).toContain("no_autonomous_reply");

    const duplicate = await importTargetAccountPost(admin, {
      likeCount: 55,
      targetAccountId: account.id,
      text: "The same post with updated metrics.",
      url: "https://x.com/systems/status/1",
    });
    expect(duplicate.id).toBe(post.id);
    expect(db.inserts.target_account_posts).toHaveLength(1);
    expect(db.updates.target_account_posts?.at(-1)?.payload).toMatchObject({ like_count: 55, platform_post_id: "1" });

    await expect(importTargetAccountPost(admin, { authorUsername: "other", targetAccountId: account.id, text: "Wrong account post." })).rejects.toThrow("author does not match");

    const copied = await markReplyDraftCopied(admin, { id: generated.drafts[0]!.id });
    const used = await markReplyDraftUsed(admin, { id: generated.drafts[0]!.id });
    expect(copied.status).toBe("copied");
    expect(used.status).toBe("used");
    expect(db.updates.reply_drafts?.at(-1)?.payload).toMatchObject({ status: "used", used_at: expect.any(String) });
  });

  it("blocks publishing handoff without an X target and preserves handoff status when copied", async () => {
    const db = createSupabaseMock({
      reply_drafts: [
        {
          copied_at: null,
          created_at: now,
          deleted_at: null,
          id: "reply-manual",
          metadata: {},
          model: "mock-model",
          original_post_text: "Manual fallback target post.",
          provider: "mock",
          published_post_id: null,
          publishing_draft_id: null,
          reply_text: "A manual reply that needs a saved target before handoff.",
          reply_type: "question",
          status: "draft",
          target_account_id: null,
          target_post_id: null,
          updated_at: now,
          user_id: "user-1",
          used_at: null,
        },
        {
          copied_at: null,
          created_at: now,
          deleted_at: null,
          id: "reply-handoff",
          metadata: {},
          model: "mock-model",
          original_post_text: "Already handed off target post.",
          provider: "mock",
          published_post_id: null,
          publishing_draft_id: "publishing-1",
          reply_text: "A reply already in publishing.",
          reply_type: "question",
          status: "handoff",
          target_account_id: "target-1",
          target_post_id: "post-1",
          updated_at: now,
          user_id: "user-1",
          used_at: null,
        },
      ],
      target_accounts: [
        {
          created_at: now,
          deleted_at: null,
          display_name: null,
          id: "target-1",
          last_synced_at: null,
          list_name: null,
          metadata: {},
          niche: null,
          notes: null,
          priority: 1,
          updated_at: now,
          user_id: "user-1",
          username: "target",
        },
      ],
      target_account_posts: [
        {
          bookmark_count: 0,
          created_at: now,
          created_at_platform: now,
          deleted_at: null,
          id: "post-1",
          impression_count: 0,
          like_count: 1,
          metadata: {},
          platform: "x",
          platform_post_id: "12345",
          quote_count: 0,
          raw_api_payload: {},
          reply_count: 0,
          repost_count: 0,
          source: "manual",
          target_account_id: "target-1",
          text: "A thoughtful target post.",
          updated_at: now,
          url: "https://x.com/target/status/12345",
          user_id: "user-1",
        },
      ],
    });
    const admin = createAdminContext(db.supabase);

    await expect(createReplyPublishingDraft(admin, { id: "reply-manual" })).rejects.toThrow("requires a saved target post");
    const copied = await markReplyDraftCopied(admin, { id: "reply-handoff" });
    expect(copied.status).toBe("handoff");
    expect(db.updates.reply_drafts?.at(-1)?.payload).toMatchObject({ status: "handoff", copied_at: expect.any(String) });
  });

  it("hands one reply draft to publishing without approving or publishing it", async () => {
    const db = createSupabaseMock({
      posts: [],
      publishing_drafts: [],
      reply_drafts: [
        {
          copied_at: null,
          created_at: now,
          deleted_at: null,
          id: "reply-1",
          metadata: { risk_notes: ["Owner approval required."] },
          model: "mock-model",
          original_post_text: "A thoughtful target post.",
          provider: "mock",
          published_post_id: null,
          publishing_draft_id: null,
          reply_text: "A single useful reply for owner review.",
          reply_type: "question",
          status: "draft",
          target_account_id: "target-1",
          target_post_id: "post-1",
          updated_at: now,
          user_id: "user-1",
          used_at: null,
        },
      ],
      target_accounts: [
        {
          created_at: now,
          deleted_at: null,
          display_name: null,
          id: "target-1",
          last_synced_at: null,
          list_name: null,
          metadata: {},
          niche: null,
          notes: null,
          priority: 1,
          updated_at: now,
          user_id: "user-1",
          username: "target",
        },
      ],
      target_account_posts: [
        {
          bookmark_count: 0,
          created_at: now,
          created_at_platform: now,
          deleted_at: null,
          id: "post-1",
          impression_count: 0,
          like_count: 1,
          metadata: {},
          platform: "x",
          platform_post_id: "12345",
          quote_count: 0,
          raw_api_payload: {},
          reply_count: 0,
          repost_count: 0,
          source: "manual",
          target_account_id: "target-1",
          text: "A thoughtful target post.",
          updated_at: now,
          url: "https://x.com/target/status/12345",
          user_id: "user-1",
        },
      ],
      x_connections: [],
    });
    const admin = createAdminContext(db.supabase);

    const result = await createReplyPublishingDraft(admin, { id: "reply-1" });

    expect(result.publishingDraft?.status).toBe("ai_generated");
    expect(result.publishingDraftId).toBe(result.publishingDraft?.id);
    expect(db.inserts.publishing_drafts?.[0]).toMatchObject({ approval_status: "pending", content_type: "reply", reply_to_post_id: "12345", text: "A single useful reply for owner review." });
    expect(db.inserts.publishing_drafts?.[0]).not.toHaveProperty("approved_at", expect.any(String));
    expect(db.updates.reply_drafts?.at(-1)?.payload).toMatchObject({ publishing_draft_id: result.publishingDraftId, status: "handoff" });
  });
});

describe("Phase 21 account research services", () => {
  it("rejects username-only research when no saved or pasted posts exist", async () => {
    const db = createSupabaseMock();
    const admin = createAdminContext(db.supabase);

    await expect(runAccountResearch(admin, { username: "@systems" }, { provider: accountProvider() })).rejects.toThrow("Pasted posts or a target account with saved posts are required");
    expect(db.inserts.account_research_reports).toBeUndefined();
  });

  it("accepts parsed service posts and rejects arbitrary hidden idea text", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_MODEL", "mock-model");
    const db = createSupabaseMock();
    const admin = createAdminContext(db.supabase);

    const research = await runAccountResearch(
      admin,
      { parsedPosts: [{ authorUsername: "systems", platformPostId: "42", text: "A parsed post with a useful systems pattern.", url: "https://x.com/systems/status/42" }] },
      { provider: accountProvider() },
    );

    expect(research.report.topPosts[0]).toMatchObject({ id: "pasted-1", text: expect.stringContaining("parsed post") });
    await expect(saveAccountResearchIdea(admin, { ideaKind: "x_post", ideaText: "Hidden field tampering", reportId: research.report.id })).rejects.toThrow("not part of the account research report");
  });

  it("researches pasted or saved target posts, stores a report, and saves generated ideas to composer", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_MODEL", "mock-model");
    const db = createSupabaseMock();
    const admin = createAdminContext(db.supabase);

    const research = await runAccountResearch(
      admin,
      {
        ownerNotes: "Look for reply angles that fit my systems voice.",
        pastedPosts: "The visible work gets credit, but the workflow makes it repeat.\n\nA good tool removes one decision at the right moment.",
        saveTargetAccount: true,
        username: "@systems",
      },
      { provider: accountProvider() },
    );

    expect(research.report.username).toBe("systems");
    expect(research.report.report.reply_strategy).toContain("Ask precise implementation questions.");
    expect(db.inserts.target_accounts?.[0]).toMatchObject({ username: "systems", user_id: "user-1" });
    expect(db.inserts.target_account_posts).toHaveLength(2);
    expect(db.inserts.account_research_reports?.[0]).toMatchObject({ input_source: "manual", user_id: "user-1" });
    expect(JSON.stringify(db.inserts.prompt_runs?.[0]?.input_redacted)).toContain("untrusted external data");
    expect(JSON.stringify(db.inserts.prompt_runs?.[0]?.input_redacted)).toContain('"trusted":false');

    const idea = await saveAccountResearchIdea(admin, { ideaKind: "x_post", ideaText: research.report.report.idea_seeds[0]!, reportId: research.report.id });
    expect(idea.source).toBe("account_research");
    expect(db.inserts.content_ideas?.[0]).toMatchObject({ source_entity_id: research.report.id, source_entity_type: "account_research" });
  });
});

describe("Phase 21 workspace UI", () => {
  it("renders manual fallback, approval handoff, and no mass-reply controls", async () => {
    const db = createSupabaseMock({
      account_research_reports: [],
      reply_drafts: [],
      target_account_posts: [],
      target_accounts: [],
    });
    const admin = createAdminContext(db.supabase);
    const replyWorkspace = await loadReplyGuyWorkspace(admin, {});

    const replyMarkup = renderToStaticMarkup(
      React.createElement(ReplyGuyWorkspaceView, {
        createTargetAction: async () => {},
        generateReplyAction: async () => {},
        handoffAction: async () => {},
        importPostAction: async () => {},
        markCopiedAction: async () => {},
        markUsedAction: async () => {},
        workspace: replyWorkspace,
      }),
    );

    expect(replyMarkup).toContain("Paste target post");
    expect(replyMarkup).toContain("Create publishing draft");
    expect(replyMarkup).toContain("Owner approval still happens in Publishing");
    expect(replyMarkup.toLowerCase()).not.toContain("batch publish");
    expect(replyMarkup.toLowerCase()).not.toContain("mass reply");

    const handoffDisabledMarkup = renderToStaticMarkup(
      React.createElement(ReplyGuyWorkspaceView, {
        workspace: {
          accounts: [],
          drafts: [
            {
              canCreatePublishingHandoff: false,
              copiedAt: null,
              createdAt: now,
              id: "draft-1",
              metadata: {},
              model: null,
              originalPostText: "A target post without status id.",
              provider: null,
              publishedPostId: null,
              publishingDraftId: null,
              replyText: "A reply draft.",
              replyType: "question",
              status: "draft",
              targetAccountId: null,
              targetPostId: "post-1",
              updatedAt: now,
              usedAt: null,
            },
          ],
          metrics: { accounts: 0, copied: 0, drafts: 1, handoffs: 0, posts: 0, used: 0 },
          posts: [],
          selectedAccount: null,
          selectedPost: null,
        },
      }),
    );
    expect(handoffDisabledMarkup).toContain("Save the target post with an X status URL");

    const noticeMarkup = renderToStaticMarkup(
      React.createElement(ReplyGuyWorkspaceView, {
        notice: "handoff_failed",
        workspace: replyWorkspace,
      }),
    );
    expect(noticeMarkup).toContain("Publishing handoff failed");

    const researchMarkup = renderToStaticMarkup(
      React.createElement(AccountResearchWorkspaceView, {
        notice: "research_failed",
        researchAction: async () => {},
        saveIdeaAction: async () => {},
        workspace: { reports: [], selectedReport: null, targetAccounts: [] },
      }),
    );
    expect(researchMarkup).toContain("Account research failed");
    expect(researchMarkup).toContain("Pasted posts");
    expect(researchMarkup).toContain("Save target account");
    expect(researchMarkup).toContain("Ethical patterns");
  });
});
