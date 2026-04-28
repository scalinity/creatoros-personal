import { describe, expect, it } from "vitest";

import { buildAnalyticsReport, buildDashboardSummary } from "@/lib/analytics";
import type {
  BlogPostRow,
  CampaignItemRow,
  CampaignRow,
  ExperimentResultRow,
  ExperimentRow,
  PostMetricSnapshotRow,
  PostRow,
  PublishingDraftRow,
  PublishingFailureRow,
  PublishingJobRow,
  ScheduledPostRow,
  XConnectionRow,
} from "@/types/database";

const baseMutable = {
  created_at: "2026-04-01T00:00:00.000Z",
  deleted_at: null,
  metadata: {},
  updated_at: "2026-04-01T00:00:00.000Z",
  user_id: "user-1",
};

const baseMetrics = {
  bookmark_count: 0,
  impression_count: 0,
  like_count: 0,
  media_view_count: 0,
  profile_click_count: 0,
  quote_count: 0,
  reply_count: 0,
  repost_count: 0,
  url_link_click_count: 0,
  video_view_count: 0,
};

function post(overrides: Partial<PostRow> & Pick<PostRow, "id" | "text">): PostRow {
  const row: PostRow = {
    ...baseMutable,
    ...baseMetrics,
    author_display_name: "Owner",
    author_username: "owner",
    content_pillar: null,
    created_at_platform: "2026-04-27T13:00:00.000Z",
    engagement_rate: null,
    format: "single",
    has_link: false,
    has_media: false,
    heuristic_score: null,
    hook_type: null,
    id: overrides.id,
    imported_at: "2026-04-27T13:10:00.000Z",
    is_owner_post: true,
    media_metadata: {},
    platform: "x",
    platform_post_id: overrides.id,
    quality_score: null,
    raw_api_payload: {},
    source: "manual",
    text: overrides.text,
    tone: null,
    topic: "AI",
    url: null,
    virality_score: null,
  };

  return { ...row, ...overrides };
}

function snapshot(overrides: Partial<PostMetricSnapshotRow> & Pick<PostMetricSnapshotRow, "id" | "post_id" | "snapshot_at">): PostMetricSnapshotRow {
  return {
    ...baseMetrics,
    created_at: overrides.snapshot_at,
    engagement_rate: null,
    heuristic_score: null,
    metadata: {},
    quality_score: null,
    raw_api_payload: {},
    score_metadata: {},
    source: "manual_metric_edit",
    user_id: "user-1",
    virality_score: null,
    ...overrides,
  };
}

function draft(overrides: Partial<PublishingDraftRow> & Pick<PublishingDraftRow, "id" | "status">): PublishingDraftRow {
  return {
    ...baseMutable,
    approval_audit_log_id: null,
    approval_payload_hash: null,
    approval_status: "pending",
    approved_at: null,
    approved_by: null,
    campaign_id: null,
    content_type: "single_post",
    duplicate_check: {},
    experiment_id: null,
    media_asset_ids: [],
    quote_post_id: null,
    reply_to_post_id: null,
    risk_check: {},
    scheduled_at: null,
    similarity_check: {},
    source_content_idea_id: null,
    source_generated_output_id: null,
    source_id: null,
    source_post_id: null,
    source_type: "manual",
    text: "draft",
    thread_items: [],
    timezone: "UTC",
    ...overrides,
  };
}

function blog(overrides: Partial<BlogPostRow> & Pick<BlogPostRow, "id" | "status" | "title">): BlogPostRow {
  return {
    ...baseMutable,
    campaign_id: null,
    canonical_summary: null,
    categories: [],
    excerpt: null,
    experiment_id: null,
    html: null,
    json_doc: {},
    markdown: "# Draft",
    meta_description: null,
    published_external_url: null,
    reading_time_minutes: 1,
    seo_title: null,
    slug: null,
    source_content_idea_id: null,
    source_generated_output_id: null,
    source_id: null,
    source_post_id: null,
    source_type: "manual",
    tags: [],
    word_count: 500,
    ...overrides,
  };
}

describe("phase 18 analytics aggregation", () => {
  it("builds explainable post aggregates, top and bottom posts, cadence, and velocity", () => {
    const report = buildAnalyticsReport(
      {
        blogPosts: [blog({ id: "b1", status: "ready", title: "Ready blog", word_count: 900 }), blog({ id: "b2", status: "exported", title: "Exported blog", word_count: 1200 })],
        campaigns: [{ ...baseMutable, end_date: null, hypothesis: "AI systems compound", id: "c1", name: "AI systems", objective: "growth", pillar_id: null, result_summary: {}, start_date: "2026-04-01", status: "active", target_metrics: {} } satisfies CampaignRow],
        campaignItems: [{ ...baseMutable, blog_post_id: "b1", campaign_id: "c1", entity_id: "b1", entity_type: "blog_post", id: "ci1", published_post_id: null, publishing_draft_id: null, role: "anchor", scheduled_for: null, sequence_index: 1, status: "ready" } satisfies CampaignItemRow],
        experimentResults: [{ created_at: "2026-04-27T00:00:00.000Z", experiment_id: "e1", generated_at: "2026-04-27T00:00:00.000Z", id: "er1", metadata: {}, user_id: "user-1", ai_interpretation: {}, baseline_metrics: {}, confidence_label: "fact", decision: "continue", metrics: { avg_heuristic_score: 67 }, model: null, provider: null, prompt_version: null, result: "lift" } satisfies ExperimentResultRow],
        experiments: [{ ...baseMutable, content_filters: {}, decision: null, end_date: null, experiment_type: "topic", hypothesis: "AI beats process", id: "e1", start_date: "2026-04-01", status: "active", success_metric: "heuristic", title: "AI topic" } satisfies ExperimentRow],
        postMetricSnapshots: [
          snapshot({ id: "s1", impression_count: 100, like_count: 4, post_id: "p1", snapshot_at: "2026-04-27T00:00:00.000Z" }),
          snapshot({ id: "s2", impression_count: 460, like_count: 40, post_id: "p1", snapshot_at: "2026-04-27T12:00:00.000Z" }),
        ],
        posts: [
          post({ engagement_rate: 5.4, heuristic_score: 80, id: "p1", impression_count: 1000, like_count: 20, quote_count: 2, reply_count: 4, repost_count: 6, text: "AI systems post", topic: "AI" }),
          post({ created_at_platform: "2026-04-28T17:30:00.000Z", format: "thread", heuristic_score: 30, id: "p2", impression_count: 200, like_count: 2, text: "Process thread", topic: "Process" }),
          post({ created_at_platform: "2026-04-29T09:00:00.000Z", format: null, heuristic_score: null, id: "p3", text: "Metricless imported post", topic: null }),
        ],
        publishedPosts: [],
        publishingDrafts: [draft({ approval_status: "approved", id: "d1", scheduled_at: "2026-04-28T18:00:00.000Z", status: "scheduled" })],
        publishingFailures: [],
        publishingJobs: [],
        scheduledPosts: [],
      },
      { now: new Date("2026-04-30T00:00:00.000Z") },
    );

    expect(report.performance.totalPosts).toBe(3);
    expect(report.performance.totalImpressions).toBe(1200);
    expect(report.performance.metricCoverage.impressionsUnknown).toBe(1);
    expect(report.topPosts[0]?.id).toBe("p1");
    expect(report.bottomPosts[0]?.id).toBe("p2");
    expect(report.aggregates.topic.map((group) => group.key)).toEqual(["AI", "Process", "Uncategorized"]);
    expect(report.aggregates.format.map((group) => group.key)).toEqual(["single", "thread", "Uncategorized"]);
    expect(report.aggregates.hour.map((group) => group.key)).toEqual(["13", "17", "09"]);
    expect(report.velocity.topPosts[0]).toMatchObject({ impressionVelocityPerHour: 30, postId: "p1" });
    expect(report.cadence.postsLast30Days).toBe(3);
    expect(report.unknowns).toContainEqual(expect.objectContaining({ key: "follower_growth" }));
    expect(report.scoreExplanations[0]?.formula).toContain("fallback = (engagement + virality) / 2");
    expect(report.blogs.readyOrExported).toBe(2);
    expect(report.campaigns.active).toBe(1);
    expect(report.experiments.withResults).toBe(1);
  });

  it("preserves known-zero metrics and keeps unusable velocity pairs unknown", () => {
    const report = buildAnalyticsReport(
      {
        blogPosts: [],
        campaigns: [],
        campaignItems: [],
        experimentResults: [],
        experiments: [],
        postMetricSnapshots: [
          snapshot({ id: "s1", impression_count: 100, post_id: "p1", snapshot_at: "2026-04-27T00:00:00.000Z" }),
          snapshot({ id: "s2", impression_count: 200, post_id: "p2", snapshot_at: "2026-04-27T00:00:00.000Z" }),
        ],
        posts: [
          post({ id: "p1", impression_count: 100, text: "Known zero engagement", topic: "Metrics" }),
          post({ id: "p2", impression_count: 200, text: "Different post snapshot", topic: "Metrics" }),
          post({ heuristic_score: 99, id: "external", impression_count: 10000, is_owner_post: false, like_count: 1000, text: "External reference post", topic: "External" }),
        ],
        publishedPosts: [],
        publishingDrafts: [draft({ approval_status: "approved", id: "d-failed-approved", status: "failed" }), draft({ approval_status: "pending", id: "d-failed-pending", status: "failed" })],
        publishingFailures: [],
        publishingJobs: [],
        scheduledPosts: [],
      },
      { now: new Date("2026-04-30T00:00:00.000Z") },
    );

    expect(report.performance.averageEngagementRate).toBe(0);
    expect(report.performance.averageViralityScore).toBe(0);
    expect(report.performance.averageHeuristicScore).toBe(0);
    expect(report.performance.totalPosts).toBe(2);
    expect(report.topPosts.some((item) => item.id === "external")).toBe(false);
    expect(report.aggregates.topic[0]).toMatchObject({ averageEngagementRate: 0, averageHeuristicScore: 0, key: "Metrics" });
    expect(report.velocity.status).toBe("unknown");
    expect(report.velocity.topPosts).toEqual([]);
    expect(report.unknowns).toContainEqual(expect.objectContaining({ key: "velocity" }));
    expect(report.publishing.failedDrafts).toBe(2);
    expect(report.publishing.needsApproval).toBe(1);
  });

  it("uses media and video metrics in fallback scoring", () => {
    const report = buildAnalyticsReport({
      blogPosts: [],
      campaigns: [],
      campaignItems: [],
      experimentResults: [],
      experiments: [],
      postMetricSnapshots: [],
      posts: [post({ id: "p-media", impression_count: 100, media_view_count: 100, text: "Media post", video_view_count: 100 })],
      publishedPosts: [],
      publishingDrafts: [],
      publishingFailures: [],
      publishingJobs: [],
      scheduledPosts: [],
    });

    expect(report.performance.averageEngagementRate).toBe(10);
    expect(report.performance.averageViralityScore).toBe(0);
    expect(report.performance.averageHeuristicScore).toBe(5);
    expect(report.topPosts[0]).toMatchObject({ heuristicScore: 5, id: "p-media" });
  });

  it("summarizes dashboard counts and X capability status without leaking secrets", () => {
    const dashboard = buildDashboardSummary({
      analytics: buildAnalyticsReport({
        blogPosts: [blog({ id: "b1", status: "drafting", title: "Draft" })],
        campaigns: [],
        campaignItems: [],
        experimentResults: [],
        experiments: [],
        postMetricSnapshots: [],
        posts: [post({ id: "p1", impression_count: 100, like_count: 10, text: "Top", heuristic_score: 70 })],
        publishedPosts: [],
        publishingDrafts: [draft({ id: "d1", status: "draft" }), draft({ approval_status: "approved", id: "d2", status: "scheduled" })],
        publishingFailures: [{ created_at: "2026-04-27T00:00:00.000Z", failure_type: "rate_limited", id: "f1", metadata: {}, post_id: undefined, provider_error_code: null, publishing_draft_id: "d1", publishing_job_id: "j1", raw_error_redacted: {}, retry_after: null, retryable: true, sanitized_message: "Rate limited", user_id: "user-1", audit_log_id: null } as unknown as PublishingFailureRow],
        publishingJobs: [{ ...baseMutable, attempt_count: 1, audit_log_id: null, completed_at: null, error: null, error_code: null, id: "j1", idempotency_key: "k1", job_type: "publish", publishing_draft_id: "d1", rate_limit_reset_at: null, scheduled_for: null, started_at: null, status: "failed", x_request_payload: {}, x_response_payload: {} } satisfies PublishingJobRow],
        scheduledPosts: [{ ...baseMutable, canceled_audit_log_id: null, calendar_item_id: null, id: "sp1", lock_token: null, locked_at: null, publishing_draft_id: "d2", scheduled_audit_log_id: null, scheduled_for: "2026-04-28T10:00:00.000Z", status: "scheduled", timezone: "UTC" } satisfies ScheduledPostRow],
      }),
      generatedOutputCount: 4,
      ideaCount: 5,
      xConnection: {
        avatar_url: null,
        capabilities: { can_read_user_posts: true, can_read_metrics: true, can_read_private_metrics: false, can_write_posts: true, can_write_replies: true, can_write_quotes: false, can_upload_media: false, can_delete_posts: true, enterprise_analytics_enabled: false, enterprise_quote_post_enabled: false, enterprise_streams_enabled: false },
        created_at: "2026-04-01T00:00:00.000Z",
        deleted_at: null,
        display_name: "Owner",
        encrypted_access_token: "not returned by dashboard",
        encrypted_refresh_token: "not returned by dashboard",
        id: "x1",
        last_error: null,
        last_synced_at: "2026-04-27T00:00:00.000Z",
        metadata: {},
        scopes: ["tweet.read", "tweet.write"],
        status: "connected",
        token_expires_at: null,
        updated_at: "2026-04-01T00:00:00.000Z",
        user_id: "user-1",
        username: "owner",
        x_user_id: "x-user",
      } as unknown as XConnectionRow,
    });

    expect(dashboard.status.xStatus).toBe("connected");
    expect(dashboard.status.canPublish).toBe(true);
    expect(dashboard.queue.needsApproval).toBe(1);
    expect(dashboard.queue.scheduled).toBe(1);
    expect(dashboard.queue.failedJobs).toBe(1);
    expect(dashboard.archive.ideas).toBe(5);
    expect(dashboard.archive.generatedOutputs).toBe(4);
    expect(JSON.stringify(dashboard)).not.toContain("not returned by dashboard");
  });
});
