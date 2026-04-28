import "server-only";

import type { AdminContext } from "@/lib/auth/admin";
import {
  buildAnalyticsReport,
  buildDashboardQueueRows,
  buildDashboardSummary,
  type AnalyticsInput,
  type AnalyticsReport,
  type DashboardSummary,
  type DashboardXConnection,
} from "@/lib/analytics";
import type {
  BlogPostRow,
  CampaignItemRow,
  CampaignRow,
  ContentPillarRow,
  ExperimentResultRow,
  ExperimentRow,
  GrowthGoalRow,
  MonthlyReviewRow,
  PostMetricSnapshotRow,
  PostRow,
  ProfileAuditRow,
  PublishedPostRow,
  PublishingDraftRow,
  PublishingFailureRow,
  PublishingJobRow,
  ScheduledPostRow,
  WeeklyReviewRow,
} from "@/types/database";

async function fetchRows<T>(label: string, promise: PromiseLike<{ data: null | T[]; error: null | { message: string } }>) {
  const { data, error } = await promise;
  if (error) throw new Error(`Failed to load ${label}: ${error.message}`);
  return data ?? [];
}

async function loadAnalyticsInput(admin: AdminContext): Promise<AnalyticsInput> {
  const [
    posts,
    postMetricSnapshots,
    publishingDrafts,
    publishingJobs,
    scheduledPosts,
    publishingFailures,
    publishedPosts,
    blogPosts,
    campaigns,
    campaignItems,
    experiments,
    experimentResults,
    contentPillars,
    growthGoals,
    weeklyReviews,
    monthlyReviews,
    profileAudits,
  ] = await Promise.all([
    fetchRows("analytics posts", admin.supabase.from("posts").select("*").eq("user_id", admin.userId).is("deleted_at", null).order("created_at_platform", { ascending: false, nullsFirst: false }).limit(1000)),
    fetchRows("analytics post metric snapshots", admin.supabase.from("post_metric_snapshots").select("*").eq("user_id", admin.userId).order("snapshot_at", { ascending: false }).limit(2000)),
    fetchRows("analytics publishing drafts", admin.supabase.from("publishing_drafts").select("*").eq("user_id", admin.userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(500)),
    fetchRows("analytics publishing jobs", admin.supabase.from("publishing_jobs").select("*").eq("user_id", admin.userId).order("created_at", { ascending: false }).limit(500)),
    fetchRows("analytics scheduled posts", admin.supabase.from("scheduled_posts").select("*").eq("user_id", admin.userId).is("deleted_at", null).order("scheduled_for", { ascending: true }).limit(500)),
    fetchRows("analytics publishing failures", admin.supabase.from("publishing_failures").select("*").eq("user_id", admin.userId).order("created_at", { ascending: false }).limit(500)),
    fetchRows("analytics published posts", admin.supabase.from("published_posts").select("*").eq("user_id", admin.userId).is("deleted_at", null).order("published_at", { ascending: false }).limit(500)),
    fetchRows("analytics blogs", admin.supabase.from("blog_posts").select("*").eq("user_id", admin.userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(500)),
    fetchRows("analytics campaigns", admin.supabase.from("campaigns").select("*").eq("user_id", admin.userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(500)),
    fetchRows("analytics campaign items", admin.supabase.from("campaign_items").select("*").eq("user_id", admin.userId).is("deleted_at", null).order("sequence_index", { ascending: true }).limit(1000)),
    fetchRows("analytics experiments", admin.supabase.from("experiments").select("*").eq("user_id", admin.userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(500)),
    fetchRows("analytics experiment results", admin.supabase.from("experiment_results").select("*").eq("user_id", admin.userId).order("generated_at", { ascending: false }).limit(500)),
    fetchRows("analytics content pillars", admin.supabase.from("content_pillars").select("*").eq("user_id", admin.userId).is("deleted_at", null).order("priority", { ascending: true }).limit(200)),
    fetchRows("analytics growth goals", admin.supabase.from("growth_goals").select("*").eq("user_id", admin.userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(200)),
    fetchRows("analytics weekly reviews", admin.supabase.from("weekly_reviews").select("*").eq("user_id", admin.userId).order("generated_at", { ascending: false }).limit(52)),
    fetchRows("analytics monthly reviews", admin.supabase.from("monthly_reviews").select("*").eq("user_id", admin.userId).order("generated_at", { ascending: false }).limit(24)),
    fetchRows("analytics profile audits", admin.supabase.from("profile_audits").select("*").eq("user_id", admin.userId).order("generated_at", { ascending: false }).limit(20)),
  ]);

  return {
    blogPosts: blogPosts as BlogPostRow[],
    campaigns: campaigns as CampaignRow[],
    campaignItems: campaignItems as CampaignItemRow[],
    contentPillars: contentPillars as ContentPillarRow[],
    experimentResults: experimentResults as ExperimentResultRow[],
    experiments: experiments as ExperimentRow[],
    growthGoals: growthGoals as GrowthGoalRow[],
    monthlyReviews: monthlyReviews as MonthlyReviewRow[],
    postMetricSnapshots: postMetricSnapshots as PostMetricSnapshotRow[],
    posts: posts as PostRow[],
    profileAudits: profileAudits as ProfileAuditRow[],
    publishedPosts: publishedPosts as PublishedPostRow[],
    publishingDrafts: publishingDrafts as PublishingDraftRow[],
    publishingFailures: publishingFailures as PublishingFailureRow[],
    publishingJobs: publishingJobs as PublishingJobRow[],
    scheduledPosts: scheduledPosts as ScheduledPostRow[],
    weeklyReviews: weeklyReviews as WeeklyReviewRow[],
  };
}

export async function loadAnalyticsReport(admin: AdminContext): Promise<AnalyticsReport> {
  return buildAnalyticsReport(await loadAnalyticsInput(admin));
}

async function countRows(admin: AdminContext, table: "content_ideas" | "generated_outputs") {
  const { data, error } = await admin.supabase.from(table).select("id").eq("user_id", admin.userId).is("deleted_at", null).limit(10_000);
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  return data?.length ?? 0;
}

export async function loadDashboardSummary(admin: AdminContext): Promise<DashboardSummary> {
  const [analyticsInput, ideaCount, generatedOutputCount, xConnectionResult] = await Promise.all([
    loadAnalyticsInput(admin),
    countRows(admin, "content_ideas"),
    countRows(admin, "generated_outputs"),
    admin.supabase
      .from("x_connections")
      .select("status,capabilities,last_synced_at,last_error,username,scopes")
      .eq("user_id", admin.userId)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (xConnectionResult.error) {
    throw new Error(`Failed to load dashboard X status: ${xConnectionResult.error.message}`);
  }

  const analytics = buildAnalyticsReport(analyticsInput);

  return buildDashboardSummary({
    analytics,
    generatedOutputCount,
    ideaCount,
    queueRows: buildDashboardQueueRows(analyticsInput),
    xConnection: (xConnectionResult.data as DashboardXConnection | null) ?? null,
  });
}
