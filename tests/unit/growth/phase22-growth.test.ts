import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.hoisted(() => ({
  logAuditEvent: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => auditMock);

import { GrowthCampaignsView, GrowthExperimentsView } from "@/components/growth";
import { createMockAiProvider } from "@/lib/ai/providers/mock";
import { buildAnalyticsReport, buildDashboardSummary } from "@/lib/analytics";
import type { AdminContext } from "@/lib/auth/admin";
import {
  addCampaignItem,
  calculateExperimentMetricDelta,
  createCampaign,
  createContentPillar,
  createExperiment,
  createGrowthGoal,
  loadGrowthWorkspace,
  recordExperimentResult,
  runMonthlyGrowthReview,
  runProfileAudit,
  runWeeklyGrowthReview,
} from "@/lib/growth";
import {
  campaignCreateSchema,
  campaignItemCreateSchema,
  experimentCreateSchema,
  experimentResultSchema,
  goalCreateSchema,
  pillarCreateSchema,
  profileAuditInputSchema,
} from "@/lib/growth/validation";
import type { BlogPostRow, CampaignItemRow, CampaignRow, ExperimentResultRow, ExperimentRow, PostRow } from "@/types/database";

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

const baseMutable = {
  created_at: now,
  deleted_at: null,
  metadata: {},
  updated_at: now,
  user_id: "user-1",
};

function seedGrowthSources() {
  return {
    blog_posts: [
      {
        ...baseMutable,
        campaign_id: "campaign-1",
        canonical_summary: "A practical essay about creator systems.",
        categories: [],
        experiment_id: null,
        excerpt: "Creator systems essay.",
        html: null,
        id: "blog-1",
        json_doc: {},
        markdown: "# Creator Systems",
        meta_description: null,
        published_external_url: null,
        reading_time_minutes: 4,
        seo_title: null,
        slug: "creator-systems",
        source_content_idea_id: null,
        source_generated_output_id: null,
        source_id: null,
        source_post_id: null,
        source_type: "manual",
        status: "ready",
        tags: ["systems"],
        title: "Creator Systems",
        word_count: 900,
      },
    ],
    campaign_items: [
      {
        ...baseMutable,
        blog_post_id: "blog-1",
        campaign_id: "campaign-1",
        entity_id: "blog-1",
        entity_type: "blog_post",
        id: "campaign-item-1",
        published_post_id: null,
        publishing_draft_id: null,
        role: "anchor",
        scheduled_for: null,
        sequence_index: 0,
        status: "planned",
      },
    ],
    campaigns: [
      {
        ...baseMutable,
        end_date: "2026-05-31",
        hypothesis: "Systems notes will lift replies from operators.",
        id: "campaign-1",
        name: "Systems Month",
        objective: "Grow qualified replies around creator workflows.",
        pillar_id: "pillar-1",
        result_summary: {},
        start_date: "2026-05-01",
        status: "active",
        target_metrics: { replies: 40 },
      },
    ],
    content_ideas: [
      { ...baseMutable, favorite: false, id: "idea-1", linked_post_id: null, raw_text: "Turn memory systems into a post series.", source: "manual", source_entity_id: null, source_entity_type: null, status: "active", tags: ["systems"], title: "Memory systems" },
    ],
    content_pillars: [
      { ...baseMutable, active: true, description: "Systems for publishing consistently.", examples: ["capture", "review"], id: "pillar-1", name: "Creator systems", priority: 1 },
    ],
    experiment_results: [],
    experiments: [
      {
        ...baseMutable,
        content_filters: { ids: ["post-1"] },
        decision: null,
        end_date: "2026-05-07",
        experiment_type: "hook",
        hypothesis: "Concrete contrast hooks earn more replies than abstract advice.",
        id: "experiment-1",
        start_date: "2026-05-01",
        status: "active",
        success_metric: "reply_count",
        title: "Contrast hook test",
      },
    ],
    growth_goals: [
      { ...baseMutable, description: "More qualified public conversations.", end_date: "2026-06-30", id: "goal-1", metric_key: "qualified_replies", start_date: "2026-05-01", status: "active", target_value: 80, title: "Earn qualified replies" },
    ],
    monthly_reviews: [],
    post_metric_snapshots: [],
    posts: [
      {
        ...baseMutable,
        author_display_name: "Owner",
        author_username: "owner",
        bookmark_count: 3,
        content_pillar: "Creator systems",
        created_at_platform: "2026-04-27T12:00:00.000Z",
        engagement_rate: 8,
        format: "single_post",
        has_link: false,
        has_media: false,
        heuristic_score: 82,
        hook_type: "contrast",
        id: "post-1",
        imported_at: now,
        impression_count: 1200,
        is_owner_post: true,
        like_count: 80,
        media_metadata: {},
        media_view_count: 0,
        platform: "x",
        platform_post_id: "x-1",
        profile_click_count: 2,
        quality_score: 76,
        quote_count: 2,
        raw_api_payload: {},
        reply_count: 14,
        repost_count: 7,
        source: "manual",
        text: "A quiet system beats heroic memory.",
        tone: "direct",
        topic: "creator systems",
        url: "https://x.com/owner/status/1",
        url_link_click_count: 0,
        video_view_count: 0,
        virality_score: 53,
      },
    ],
    profile_audits: [],
    published_posts: [],
    publishing_drafts: [],
    publishing_failures: [],
    publishing_jobs: [],
    scheduled_posts: [],
    weekly_reviews: [],
  };
}

function experimentProvider(decision = "scale") {
  return createMockAiProvider({
    responses: [
      {
        content: JSON.stringify({
          confidence_label: "inference",
          confounders: ["Small sample size; one linked post has complete metrics."],
          decision,
          hypothesis_supported: true,
          next_experiment: "Test the same contrast hook against a narrower audience hypothesis.",
          result_summary: "Reply count improved against the stated baseline.",
        }),
      },
    ],
  });
}

function growthProvider() {
  return createMockAiProvider({
    responses: [
      {
        content: JSON.stringify({
          cadence_recommendations: ["Keep a three-post weekly systems cadence."],
          campaign_recommendations: ["Continue Systems Month and add one blog-to-X series."],
          confidence_label: "inference",
          evidence: [
            { confidence: "fact", record_id: "campaign-1", record_type: "campaign", snippet: "Systems Month" },
            { confidence: "fact", record_id: "made-up", record_type: "post", snippet: "missing" },
          ],
          experiment_recommendations: ["Scale the contrast-hook experiment after one more post."],
          profile_optimization_recommendations: ["Make the bio promise creator systems more explicit."],
          weekly_strategy: "Lead with systems hooks, then convert the best response into a blog outline.",
        }),
      },
    ],
  });
}

function auditProvider() {
  return createMockAiProvider({
    responses: [
      {
        content: JSON.stringify({
          confidence_label: "inference",
          findings: ["Bio is specific about systems but light on audience outcome."],
          recommendations: ["Name the creator outcome in the first clause."],
          score: 74,
          suggested_pinned_post_drafts: [{ rationale: "States the operating promise clearly.", text: "I write about quiet systems that help creators publish consistently without becoming content machines." }],
        }),
      },
    ],
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  auditMock.logAuditEvent.mockClear();
});

describe("Phase 22 growth validation", () => {
  it("normalizes goal, pillar, campaign, campaign item, experiment, result, and profile audit inputs", () => {
    expect(goalCreateSchema.parse({ metric_key: " replies ", target_value: "25", title: " Qualified replies " })).toMatchObject({ metricKey: "replies", targetValue: 25, title: "Qualified replies" });
    expect(pillarCreateSchema.parse({ examples: "hooks\nreviews", name: " Systems ", priority: "2" })).toMatchObject({ examples: ["hooks", "reviews"], name: "Systems", priority: 2 });
    expect(campaignCreateSchema.parse({ end_date: "2026-05-31", name: " Systems Month ", start_date: "2026-05-01", target_metrics: '{"replies":40}' })).toMatchObject({ name: "Systems Month", targetMetrics: { replies: 40 } });
    expect(campaignItemCreateSchema.parse({ campaign_id: "campaign-1", entity_id: "11111111-1111-4111-8111-111111111111", entity_type: "blog_post", sequence_index: "2" })).toMatchObject({ entityType: "blog_post", sequenceIndex: 2 });
    expect(experimentCreateSchema.parse({ experiment_type: "hook", success_metric: " reply_count ", title: " Hooks " })).toMatchObject({ experimentType: "hook", successMetric: "reply_count", title: "Hooks" });
    expect(experimentResultSchema.parse({ baseline_metrics: '{"reply_count":5}', experiment_id: "experiment-1", metrics: '{"reply_count":12}', result: "Lifted replies" })).toMatchObject({ baselineMetrics: { reply_count: 5 }, metrics: { reply_count: 12 } });
    expect(profileAuditInputSchema.parse({ bio: " I build creator systems. ", header_notes: "warm header", pinned_post_text: "Pinned proof" })).toMatchObject({ bio: "I build creator systems.", headerNotes: "warm header" });
  });
});

describe("Phase 22 growth services", () => {
  it("creates goals, pillars, campaigns, campaign items, and experiments with owner scope and audit events", async () => {
    const db = createSupabaseMock();
    const admin = createAdminContext(db.supabase);

    const goal = await createGrowthGoal(admin, { description: "More useful replies.", endDate: "2026-06-30", metricKey: "qualified_replies", startDate: "2026-05-01", status: "active", targetValue: 80, title: "Qualified replies" });
    const pillar = await createContentPillar(admin, { active: true, description: "Publishing systems.", examples: ["capture", "cadence"], name: "Systems", priority: 1 });
    const campaign = await createCampaign(admin, { endDate: "2026-05-31", hypothesis: "Systems posts lift replies.", name: "Systems Month", objective: "Grow qualified replies.", pillarId: pillar.id, startDate: "2026-05-01", status: "active", targetMetrics: { replies: 40 } });
    const item = await addCampaignItem(admin, { campaignId: campaign.id, entityId: null, entityType: "x_post", role: "hook", scheduledFor: "2026-05-03T12:00:00.000Z", sequenceIndex: 1, status: "planned" });
    const experiment = await createExperiment(admin, { contentFilters: { campaign_id: campaign.id }, endDate: "2026-05-07", experimentType: "hook", hypothesis: "Contrast hooks lift replies.", startDate: "2026-05-01", status: "active", successMetric: "reply_count", title: "Contrast hooks" });

    expect(goal.userId).toBe("user-1");
    expect(pillar.name).toBe("Systems");
    expect(campaign.pillarId).toBe(pillar.id);
    expect(item.campaignId).toBe(campaign.id);
    expect(experiment.successMetric).toBe("reply_count");
    expect(db.inserts.growth_goals?.[0]).toMatchObject({ metric_key: "qualified_replies", user_id: "user-1" });
    expect(db.inserts.campaign_items?.[0]).toMatchObject({ campaign_id: campaign.id, entity_type: "x_post", user_id: "user-1" });
    expect(auditMock.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "growth_goal_created" }));
    expect(auditMock.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "campaign_created" }));
    expect(auditMock.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "experiment_created" }));
  });

  it("calculates experiment lift and persists AI interpretation plus decision", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_MODEL", "mock-model");
    const db = createSupabaseMock(seedGrowthSources());
    const admin = createAdminContext(db.supabase);

    const delta = calculateExperimentMetricDelta({ baselineMetrics: { reply_count: 5 }, metricKey: "reply_count", resultMetrics: { reply_count: 12 } });
    expect(delta).toMatchObject({ absoluteDelta: 7, baselineValue: 5, percentChange: 140, resultValue: 12 });

    const result = await recordExperimentResult(
      admin,
      {
        baselineMetrics: { reply_count: 5 },
        decision: null,
        experimentId: "experiment-1",
        metrics: { reply_count: 12 },
        result: "Replies lifted from 5 to 12.",
        runAi: true,
      },
      { provider: experimentProvider("scale") },
    );

    expect(result.decision).toBe("scale");
    expect(result.confidenceLabel).toBe("inference");
    expect(result.aiInterpretation).toMatchObject({ hypothesis_supported: true, result_summary: "Reply count improved against the stated baseline." });
    expect(db.inserts.experiment_results?.[0]).toMatchObject({ decision: "scale", experiment_id: "experiment-1", user_id: "user-1" });
    expect(db.updates.experiments?.at(-1)?.payload).toMatchObject({ decision: "scale", status: "completed" });
  });

  it("generates weekly and monthly growth reviews with sanitized evidence citations", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_MODEL", "mock-model");
    const db = createSupabaseMock(seedGrowthSources());
    const admin = createAdminContext(db.supabase);

    const weekly = await runWeeklyGrowthReview(admin, { weekStart: "2026-04-27", weekEnd: "2026-05-03" }, { provider: growthProvider() });
    const monthly = await runMonthlyGrowthReview(admin, { monthStart: "2026-05-01", monthEnd: "2026-05-31" }, { provider: growthProvider() });

    expect(weekly.evidence.map((item) => item.record_id)).toEqual(["campaign-1"]);
    expect(monthly.evidence.map((item) => item.record_id)).toEqual(["campaign-1"]);
    expect(db.inserts.weekly_reviews?.[0]).toMatchObject({ confidence_label: "inference", user_id: "user-1", week_start: "2026-04-27" });
    expect(db.inserts.monthly_reviews?.[0]).toMatchObject({ confidence_label: "inference", month_start: "2026-05-01", user_id: "user-1" });
  });

  it("generates profile audits without publishing or exposing secret material", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_MODEL", "mock-model");
    const db = createSupabaseMock(seedGrowthSources());
    const admin = createAdminContext(db.supabase);

    const audit = await runProfileAudit(
      admin,
      { bio: "Creator systems for consistent publishing.", headerNotes: "Manual snapshot: notebook and terminal.", linkCta: "Read the field notes.", pinnedPostText: "A quiet system beats heroic memory." },
      { provider: auditProvider() },
    );

    expect(audit.score).toBe(74);
    expect(audit.suggestedPinnedPostDrafts[0]?.text).toContain("owner review");
    expect(JSON.stringify(db.inserts.profile_audits?.[0])).not.toContain("sk-");
    expect(auditMock.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "profile_audit_generated" }));
  });

  it("loads a workspace and renders campaign cards, experiment ledger, reviews, and profile audit cards", async () => {
    const db = createSupabaseMock({
      ...seedGrowthSources(),
      profile_audits: [
        { created_at: now, findings: ["Bio could name the audience outcome."], generated_at: now, id: "audit-1", input_snapshot: {}, metadata: {}, model: "mock", provider: "mock", prompt_version: "v1", recommendations: ["Clarify the promise."], score: 74, suggested_pinned_post_drafts: [{ rationale: "Clearer positioning.", text: "I help creators build quiet publishing systems." }], user_id: "user-1", confidence_label: "inference" },
      ],
      weekly_reviews: [
        { created_at: now, evidence: [{ confidence: "fact", record_id: "post-1", record_type: "post", snippet: "quiet system" }], generated_at: now, id: "review-1", metadata: {}, model: "mock", provider: "mock", prompt_version: "v1", recommendations: ["Keep the systems cadence."], report: { weekly_strategy: "Lead with systems hooks." }, user_id: "user-1", week_end: "2026-05-03", week_start: "2026-04-27", confidence_label: "inference" },
      ],
    });
    const admin = createAdminContext(db.supabase);

    const workspace = await loadGrowthWorkspace(admin, { selectedCampaign: "campaign-1", selectedExperiment: "experiment-1" });
    const campaignMarkup = renderToStaticMarkup(React.createElement(GrowthCampaignsView, { workspace }));
    const experimentMarkup = renderToStaticMarkup(React.createElement(GrowthExperimentsView, { workspace }));

    expect(workspace.metrics.activeCampaigns).toBe(1);
    expect(workspace.selectedCampaign?.name).toBe("Systems Month");
    expect(campaignMarkup).toContain("Systems Month");
    expect(campaignMarkup).toContain("Weekly review");
    expect(experimentMarkup).toContain("Contrast hook test");
    expect(experimentMarkup).toContain("Profile audit");
  });
});

describe("Phase 22 analytics and dashboard growth summaries", () => {
  it("surfaces growth goals, pillars, campaign summaries, experiment decisions, reviews, and profile audit warnings", () => {
    const seeds = seedGrowthSources();
    const report = buildAnalyticsReport({
      blogPosts: seeds.blog_posts as BlogPostRow[],
      campaignItems: seeds.campaign_items as CampaignItemRow[],
      campaigns: seeds.campaigns as CampaignRow[],
      contentPillars: seeds.content_pillars as never,
      experimentResults: [
        { created_at: now, experiment_id: "experiment-1", generated_at: now, id: "result-1", metadata: {}, user_id: "user-1", ai_interpretation: { result_summary: "lift" }, baseline_metrics: { reply_count: 5 }, confidence_label: "inference", decision: "scale", metrics: { reply_count: 12 }, model: "mock", provider: "mock", prompt_version: "v1", result: "lift" } as ExperimentResultRow,
      ],
      experiments: seeds.experiments as ExperimentRow[],
      growthGoals: seeds.growth_goals as never,
      monthlyReviews: [],
      postMetricSnapshots: [],
      posts: seeds.posts as PostRow[],
      profileAudits: [
        { created_at: now, findings: ["Bio warning"], generated_at: now, id: "audit-1", input_snapshot: {}, metadata: {}, model: "mock", provider: "mock", prompt_version: "v1", recommendations: ["Clarify bio"], score: 68, suggested_pinned_post_drafts: [], user_id: "user-1", confidence_label: "inference" },
      ],
      publishedPosts: [],
      publishingDrafts: [],
      publishingFailures: [],
      publishingJobs: [],
      scheduledPosts: [],
      weeklyReviews: [
        { created_at: now, evidence: [], generated_at: now, id: "review-1", metadata: {}, model: "mock", provider: "mock", prompt_version: "v1", recommendations: ["Keep cadence"], report: { weekly_strategy: "Systems hooks" }, user_id: "user-1", week_end: "2026-05-03", week_start: "2026-04-27", confidence_label: "inference" },
      ],
    });

    expect(report.growth.activeGoals).toBe(1);
    expect(report.growth.activePillars).toBe(1);
    expect(report.campaigns.summaries[0]).toMatchObject({ itemCount: 1, name: "Systems Month" });
    expect(report.experiments.summaries[0]).toMatchObject({ decision: "scale", latestResult: "lift" });
    expect(report.growth.latestProfileAudit?.score).toBe(68);

    const dashboard = buildDashboardSummary({ analytics: report, generatedOutputCount: 0, ideaCount: 1, xConnection: null });
    expect(dashboard.strategy.activeGoals).toBe(1);
    expect(dashboard.strategy.latestProfileScore).toBe(68);
    expect(dashboard.recommendedNextActions.some((action) => action.reason.includes("Systems hooks"))).toBe(true);
  });
});
