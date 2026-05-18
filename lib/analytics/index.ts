import { calculateEngagementScore, calculateMetricVelocity, calculateViralityScore, type MetricVelocity } from "@/lib/scoring";
import type {
  BlogPostRow,
  CampaignItemRow,
  CampaignRow,
  ContentPillarRow,
  ExperimentResultRow,
  ExperimentRow,
  GrowthGoalRow,
  Json,
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
  XConnectionRow,
} from "@/types/database";

export type AnalyticsInput = {
  blogPosts: BlogPostRow[];
  campaigns: CampaignRow[];
  campaignItems: CampaignItemRow[];
  contentPillars?: ContentPillarRow[];
  experimentResults: ExperimentResultRow[];
  experiments: ExperimentRow[];
  growthGoals?: GrowthGoalRow[];
  monthlyReviews?: MonthlyReviewRow[];
  postMetricSnapshots: PostMetricSnapshotRow[];
  posts: PostRow[];
  profileAudits?: ProfileAuditRow[];
  publishedPosts: PublishedPostRow[];
  publishingDrafts: PublishingDraftRow[];
  publishingFailures: PublishingFailureRow[];
  publishingJobs: PublishingJobRow[];
  scheduledPosts: ScheduledPostRow[];
  weeklyReviews?: WeeklyReviewRow[];
};

export type AnalyticsOptions = {
  now?: Date;
};

export type AnalyticsMetricCoverage = {
  impressionsKnown: number;
  impressionsUnknown: number;
  scoreKnown: number;
  scoreUnknown: number;
};

export type AnalyticsAggregate = {
  averageEngagementRate: number | null;
  averageHeuristicScore: number | null;
  count: number;
  key: string;
  label: string;
  topPostId: null | string;
  totalEngagements: number;
  totalImpressions: number;
};

export type AnalyticsPostSummary = {
  createdAt: string;
  engagementRate: number | null;
  format: null | string;
  heuristicScore: number | null;
  hookType: null | string;
  id: string;
  impressions: number;
  text: string;
  topic: null | string;
  totalEngagements: number;
  url: null | string;
};

export type DashboardQueueRow = {
  detail: string;
  id: string;
  kind: "due_today" | "failed" | "needs_approval" | "publishing" | "scheduled";
  label: string;
  scheduledFor: null | string;
  status: string;
};

export type VelocityPostSummary = MetricVelocity & {
  postId: string;
  text: string;
};

export type UnknownMetric = {
  key: string;
  label: string;
  reason: string;
};

export type ScoreExplanation = {
  confidence: "fact" | "inference" | "speculation";
  formula: string;
  label: string;
  notes: string;
};

export type CampaignSummary = {
  blogItemCount: number;
  draftItemCount: number;
  id: string;
  itemCount: number;
  name: string;
  objective: null | string;
  publishedItemCount: number;
  status: string;
  targetMetrics: Json;
};

export type ExperimentSummary = {
  decision: null | string;
  experimentType: string;
  id: string;
  latestResult: null | string;
  resultCount: number;
  status: string;
  successMetric: null | string;
  title: string;
};

export type GrowthReviewDigest = {
  confidenceLabel: null | string;
  generatedAt: string;
  id: string;
  recommendations: string[];
  strategy: null | string;
};

export type ProfileAuditDigest = {
  confidenceLabel: null | string;
  findings: string[];
  generatedAt: string;
  id: string;
  recommendations: string[];
  score: null | number;
};

export type AnalyticsReport = {
  aggregates: {
    dayOfWeek: AnalyticsAggregate[];
    format: AnalyticsAggregate[];
    hook: AnalyticsAggregate[];
    hour: AnalyticsAggregate[];
    topic: AnalyticsAggregate[];
  };
  blogs: {
    averageWords: number;
    byStatus: Record<string, number>;
    publishedExternally: number;
    readyOrExported: number;
    total: number;
    totalWords: number;
  };
  bottomPosts: AnalyticsPostSummary[];
  cadence: {
    activePostingDaysLast30: number;
    averagePostsPerActiveDay: number;
    averagePostsPerWeek: number;
    longestGapDays: number | null;
    postsLast30Days: number;
  };
  campaigns: {
    active: number;
    byStatus: Record<string, number>;
    itemCount: number;
    summaries: CampaignSummary[];
    total: number;
  };
  experiments: {
    active: number;
    byDecision: Record<string, number>;
    byStatus: Record<string, number>;
    summaries: ExperimentSummary[];
    total: number;
    withResults: number;
  };
  growth: {
    activeGoals: number;
    activePillars: number;
    latestMonthlyReview: GrowthReviewDigest | null;
    latestProfileAudit: ProfileAuditDigest | null;
    latestWeeklyReview: GrowthReviewDigest | null;
    totalGoals: number;
    totalPillars: number;
  };
  performance: {
    averageEngagementRate: number | null;
    averageHeuristicScore: number | null;
    averageViralityScore: number | null;
    metricCoverage: AnalyticsMetricCoverage;
    ownerPosts: number;
    totalEngagements: number;
    totalImpressions: number;
    totalPosts: number;
  };
  publishing: {
    approved: number;
    failedDrafts: number;
    failedJobs: number;
    failures: number;
    needsApproval: number;
    published: number;
    scheduled: number;
    totalDrafts: number;
  };
  scoreExplanations: ScoreExplanation[];
  topPosts: AnalyticsPostSummary[];
  unknowns: UnknownMetric[];
  velocity: {
    status: "ready" | "unknown";
    topPosts: VelocityPostSummary[];
  };
};

export type DashboardXConnection = Pick<XConnectionRow, "capabilities" | "last_error" | "last_synced_at" | "scopes" | "status" | "username">;

export type DashboardSummary = {
  archive: {
    blogs: number;
    generatedOutputs: number;
    ideas: number;
    posts: number;
  };
  performance: {
    topPosts: AnalyticsPostSummary[];
    totalEngagements: number;
    totalImpressions: number;
  };
  queue: {
    failedJobs: number;
    failureTotal: number;
    needsApproval: number;
    scheduled: number;
  };
  queueRows: DashboardQueueRow[];
  recommendedNextActions: Array<{
    confidence: "inference" | "speculation";
    label: string;
    reason: string;
  }>;
  status: {
    canPublish: boolean;
    lastSync: null | string;
    publishingStatus: "disabled" | "enabled";
    xError: null | string;
    xStatus: string;
    xUsername: null | string;
  };
  strategy: {
    activeCampaigns: number;
    activeExperiments: number;
    activeGoals: number;
    activePillars: number;
    latestProfileScore: null | number;
    latestReviewStrategy: null | string;
  };
};

type DashboardSummaryInput = {
  analytics: AnalyticsReport;
  generatedOutputCount: number;
  ideaCount: number;
  queueRows?: DashboardQueueRow[];
  xConnection: DashboardXConnection | null;
};

type CountableRow = {
  created_at?: string;
  created_at_platform?: null | string;
  engagement_rate?: null | number;
  format?: null | string;
  heuristic_score?: null | number;
  hook_type?: null | string;
  id: string;
  impression_count?: number;
  like_count?: number;
  media_view_count?: number;
  bookmark_count?: number;
  profile_click_count?: number;
  quote_count?: number;
  reply_count?: number;
  repost_count?: number;
  topic?: null | string;
  url?: null | string;
  url_link_click_count?: number;
  video_view_count?: number;
  virality_score?: null | number;
};

function round(value: number, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function metric(value: null | number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function safeScore(value: null | number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function totalEngagements(row: CountableRow) {
  return (
    metric(row.like_count) +
    metric(row.reply_count) +
    metric(row.repost_count) +
    metric(row.quote_count) +
    metric(row.bookmark_count) +
    metric(row.profile_click_count) +
    metric(row.url_link_click_count)
  );
}

function hasMetricBasis(row: CountableRow) {
  return metric(row.impression_count) > 0 || totalEngagements(row) > 0 || metric(row.media_view_count) > 0 || metric(row.video_view_count) > 0;
}

function derivedEngagementRate(row: CountableRow) {
  const stored = safeScore(row.engagement_rate);
  if (stored !== null) return stored;
  return hasMetricBasis(row) ? calculateEngagementScore(postToMetricInput(row)) : null;
}

function derivedViralityScore(row: CountableRow) {
  const stored = safeScore(row.virality_score);
  if (stored !== null) return stored;
  return hasMetricBasis(row) ? calculateViralityScore(postToMetricInput(row)) : null;
}

function createdAtForPost(post: PostRow) {
  return post.created_at_platform ?? post.created_at;
}

function validDate(value: null | string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizedGroup(value: null | string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Uncategorized";
}

function postScore(post: PostRow) {
  const stored = safeScore(post.heuristic_score);
  if (stored !== null) return stored;
  const engagement = derivedEngagementRate(post);
  const virality = derivedViralityScore(post);
  if (engagement === null && virality === null) return null;
  return round(((engagement ?? 0) + (virality ?? 0)) / 2);
}

function postToMetricInput(row: CountableRow) {
  return {
    bookmarkCount: row.bookmark_count,
    impressionCount: row.impression_count,
    likeCount: row.like_count,
    mediaViewCount: row.media_view_count,
    profileClickCount: row.profile_click_count,
    quoteCount: row.quote_count,
    replyCount: row.reply_count,
    repostCount: row.repost_count,
    urlLinkClickCount: row.url_link_click_count,
    videoViewCount: row.video_view_count,
  };
}

function postSummary(post: PostRow): AnalyticsPostSummary {
  return {
    createdAt: createdAtForPost(post),
    engagementRate: derivedEngagementRate(post),
    format: post.format,
    heuristicScore: postScore(post),
    hookType: post.hook_type,
    id: post.id,
    impressions: metric(post.impression_count),
    text: post.text,
    topic: post.topic,
    totalEngagements: totalEngagements(post),
    url: post.url,
  };
}

function averageKnown(values: Array<null | number>) {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (known.length === 0) return null;
  return round(known.reduce((sum, value) => sum + value, 0) / known.length);
}

function countBy<T>(rows: T[], keyForRow: (row: T) => null | string | undefined) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = normalizedGroup(keyForRow(row));
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function isJsonRecord(value: Json | null | undefined): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jsonString(value: Json | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function jsonStringArray(value: Json | null | undefined, limit = 6) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, limit) : [];
}

function latestByGeneratedAt<T>(rows: T[], dateForRow: (row: T) => null | string | undefined) {
  return [...rows].sort((left, right) => new Date(dateForRow(right) ?? 0).getTime() - new Date(dateForRow(left) ?? 0).getTime())[0] ?? null;
}

function aggregateBy(posts: PostRow[], keyForPost: (post: PostRow) => string): AnalyticsAggregate[] {
  const groups = new Map<
    string,
    AnalyticsAggregate & {
      scoreTotal: number;
      scoreKnown: number;
      engagementTotal: number;
      engagementKnown: number;
      topScore: number;
    }
  >();

  for (const post of posts) {
    const key = keyForPost(post);
    const current = groups.get(key) ?? {
      averageEngagementRate: null,
      averageHeuristicScore: null,
      count: 0,
      engagementKnown: 0,
      engagementTotal: 0,
      key,
      label: key,
      scoreKnown: 0,
      scoreTotal: 0,
      topPostId: null,
      topScore: Number.NEGATIVE_INFINITY,
      totalEngagements: 0,
      totalImpressions: 0,
    };
    const score = postScore(post);
    const engagementRate = derivedEngagementRate(post);

    current.count += 1;
    current.totalImpressions += metric(post.impression_count);
    current.totalEngagements += totalEngagements(post);

    if (score !== null) {
      current.scoreKnown += 1;
      current.scoreTotal += score;
      if (score >= current.topScore) {
        current.topScore = score;
        current.topPostId = post.id;
      }
    }

    if (engagementRate !== null) {
      current.engagementKnown += 1;
      current.engagementTotal += engagementRate;
    }

    current.averageHeuristicScore = current.scoreKnown > 0 ? round(current.scoreTotal / current.scoreKnown) : null;
    current.averageEngagementRate = current.engagementKnown > 0 ? round(current.engagementTotal / current.engagementKnown) : null;
    groups.set(key, current);
  }

  return [...groups.values()]
    .sort((left, right) => right.count - left.count)
    .map((group) => ({
      averageEngagementRate: group.averageEngagementRate,
      averageHeuristicScore: group.averageHeuristicScore,
      count: group.count,
      key: group.key,
      label: group.label,
      topPostId: group.topPostId,
      totalEngagements: group.totalEngagements,
      totalImpressions: group.totalImpressions,
    }));
}

function dayOfWeekKey(post: PostRow) {
  const date = validDate(createdAtForPost(post));
  if (!date) return "Unknown";
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getUTCDay()] ?? "Unknown";
}

function hourKey(post: PostRow) {
  const date = validDate(createdAtForPost(post));
  return date ? String(date.getUTCHours()).padStart(2, "0") : "Unknown";
}

function buildPerformance(posts: PostRow[]): AnalyticsReport["performance"] {
  const scoreValues = posts.map((post) => postScore(post));
  const engagementValues = posts.map((post) => derivedEngagementRate(post));
  const viralityValues = posts.map((post) => derivedViralityScore(post));

  return {
    averageEngagementRate: averageKnown(engagementValues),
    averageHeuristicScore: averageKnown(scoreValues),
    averageViralityScore: averageKnown(viralityValues),
    metricCoverage: {
      impressionsKnown: posts.filter((post) => metric(post.impression_count) > 0).length,
      impressionsUnknown: posts.filter((post) => metric(post.impression_count) === 0).length,
      scoreKnown: scoreValues.filter((value) => value !== null).length,
      scoreUnknown: scoreValues.filter((value) => value === null).length,
    },
    ownerPosts: posts.filter((post) => post.is_owner_post).length,
    totalEngagements: posts.reduce((sum, post) => sum + totalEngagements(post), 0),
    totalImpressions: posts.reduce((sum, post) => sum + metric(post.impression_count), 0),
    totalPosts: posts.length,
  };
}

function buildTopPosts(posts: PostRow[], direction: "bottom" | "top") {
  return posts
    .map(postSummary)
    .filter((post) => post.heuristicScore !== null)
    .sort((left, right) => {
      const leftScore = left.heuristicScore ?? 0;
      const rightScore = right.heuristicScore ?? 0;
      return direction === "top" ? rightScore - leftScore : leftScore - rightScore;
    })
    .slice(0, 5);
}

function buildVelocity(posts: PostRow[], snapshots: PostMetricSnapshotRow[]): AnalyticsReport["velocity"] {
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const byPost = new Map<string, PostMetricSnapshotRow[]>();

  for (const snapshot of snapshots) {
    byPost.set(snapshot.post_id, [...(byPost.get(snapshot.post_id) ?? []), snapshot]);
  }

  const topPosts = [...byPost.entries()]
    .flatMap(([postId, postSnapshots]) => {
      const ordered = [...postSnapshots].sort((left, right) => new Date(right.snapshot_at).getTime() - new Date(left.snapshot_at).getTime());
      const current = ordered[0];
      const previous = ordered[1];
      const post = postsById.get(postId);
      if (!current || !previous || !post) return [];
      const velocity = calculateMetricVelocity({
        current: { ...postToMetricInput(current), snapshotAt: current.snapshot_at },
        previous: { ...postToMetricInput(previous), snapshotAt: previous.snapshot_at },
      });
      if (velocity.hoursElapsed <= 0) return [];
      return [{ ...velocity, postId, text: post.text }];
    })
    .sort((left, right) => right.impressionVelocityPerHour - left.impressionVelocityPerHour || right.engagementVelocityPerHour - left.engagementVelocityPerHour)
    .slice(0, 5);

  return {
    status: topPosts.length > 0 ? "ready" : "unknown",
    topPosts,
  };
}

function buildCadence(posts: PostRow[], now: Date): AnalyticsReport["cadence"] {
  const windowStart = now.getTime() - 30 * 24 * 60 * 60 * 1_000;
  const dates = posts
    .map((post) => validDate(createdAtForPost(post)))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());
  const recentDates = dates.filter((date) => date.getTime() >= windowStart && date.getTime() <= now.getTime());
  const activeDays = new Set(recentDates.map((date) => date.toISOString().slice(0, 10)));
  let longestGapDays: number | null = null;

  for (let index = 1; index < dates.length; index += 1) {
    const previous = dates[index - 1];
    const current = dates[index];
    if (!previous || !current) continue;
    const gapDays = Math.floor((current.getTime() - previous.getTime()) / (24 * 60 * 60 * 1_000));
    longestGapDays = Math.max(longestGapDays ?? 0, gapDays);
  }

  return {
    activePostingDaysLast30: activeDays.size,
    averagePostsPerActiveDay: activeDays.size > 0 ? round(recentDates.length / activeDays.size) : 0,
    averagePostsPerWeek: round(recentDates.length / (30 / 7)),
    longestGapDays,
    postsLast30Days: recentDates.length,
  };
}

function publishingNeedsApproval(draft: PublishingDraftRow) {
  if (["archived", "canceled", "published"].includes(draft.status)) return false;
  return draft.approval_status !== "approved";
}

function buildPublishing(input: AnalyticsInput): AnalyticsReport["publishing"] {
  const scheduledDraftIds = new Set([
    ...input.publishingDrafts.filter((draft) => draft.status === "scheduled").map((draft) => draft.id),
    ...input.scheduledPosts.filter((post) => post.status === "scheduled").map((post) => post.publishing_draft_id),
  ]);

  return {
    approved: input.publishingDrafts.filter((draft) => draft.approval_status === "approved").length,
    failedDrafts: input.publishingDrafts.filter((draft) => draft.status === "failed").length,
    failedJobs: input.publishingJobs.filter((job) => job.status === "failed").length,
    failures: input.publishingFailures.length,
    needsApproval: input.publishingDrafts.filter(publishingNeedsApproval).length,
    published: input.publishedPosts.length,
    scheduled: scheduledDraftIds.size,
    totalDrafts: input.publishingDrafts.length,
  };
}

function sameUtcDay(value: null | string, now: Date) {
  const date = validDate(value);
  return date ? date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10) : false;
}

function compactText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || "Untitled draft";
}

function queuePriority(kind: DashboardQueueRow["kind"]) {
  if (kind === "failed") return 0;
  if (kind === "due_today") return 1;
  if (kind === "needs_approval") return 2;
  if (kind === "publishing") return 3;
  return 4;
}

export function buildDashboardQueueRows(input: AnalyticsInput, options: AnalyticsOptions = {}): DashboardQueueRow[] {
  const now = options.now ?? new Date();
  const scheduledByDraftId = new Map(input.scheduledPosts.map((row) => [row.publishing_draft_id, row]));
  const rows = input.publishingDrafts.flatMap((draft): DashboardQueueRow[] => {
    if (["archived", "canceled", "published"].includes(draft.status)) return [];
    const scheduledFor = draft.scheduled_at ?? scheduledByDraftId.get(draft.id)?.scheduled_for ?? null;
    const kind: DashboardQueueRow["kind"] | null =
      draft.status === "failed"
        ? "failed"
        : publishingNeedsApproval(draft)
          ? "needs_approval"
          : draft.status === "publishing"
            ? "publishing"
            : scheduledFor && sameUtcDay(scheduledFor, now)
              ? "due_today"
              : draft.status === "scheduled" || scheduledFor
                ? "scheduled"
                : null;

    if (!kind) return [];

    return [
      {
        detail: `${draft.content_type.replaceAll("_", " ")} / ${draft.approval_status.replaceAll("_", " ")}`,
        id: draft.id,
        kind,
        label: compactText(draft.text || (Array.isArray(draft.thread_items) ? draft.thread_items.join(" ") : "")),
        scheduledFor,
        status: draft.status,
      },
    ];
  });

  return rows
    .sort((left, right) => queuePriority(left.kind) - queuePriority(right.kind) || (left.scheduledFor ?? "9999").localeCompare(right.scheduledFor ?? "9999"))
    .slice(0, 8);
}

function buildBlogs(rows: BlogPostRow[]): AnalyticsReport["blogs"] {
  const totalWords = rows.reduce((sum, row) => sum + metric(row.word_count), 0);
  return {
    averageWords: rows.length > 0 ? round(totalWords / rows.length) : 0,
    byStatus: countBy(rows, (row) => row.status),
    publishedExternally: rows.filter((row) => row.status === "published_externally").length,
    readyOrExported: rows.filter((row) => ["ready", "exported", "published_externally"].includes(row.status)).length,
    total: rows.length,
    totalWords,
  };
}

function buildCampaigns(campaigns: CampaignRow[], campaignItems: CampaignItemRow[]): AnalyticsReport["campaigns"] {
  const itemsByCampaign = new Map<string, CampaignItemRow[]>();
  for (const item of campaignItems) {
    itemsByCampaign.set(item.campaign_id, [...(itemsByCampaign.get(item.campaign_id) ?? []), item]);
  }

  return {
    active: campaigns.filter((campaign) => ["active", "running", "in_progress"].includes(campaign.status)).length,
    byStatus: countBy(campaigns, (campaign) => campaign.status),
    itemCount: campaignItems.length,
    summaries: campaigns
      .map((campaign) => {
        const items = itemsByCampaign.get(campaign.id) ?? [];
        return {
          blogItemCount: items.filter((item) => item.entity_type === "blog_post" || Boolean(item.blog_post_id)).length,
          draftItemCount: items.filter((item) => item.status === "drafted" || Boolean(item.publishing_draft_id)).length,
          id: campaign.id,
          itemCount: items.length,
          name: campaign.name,
          objective: campaign.objective,
          publishedItemCount: items.filter((item) => item.status === "published" || item.status === "completed" || Boolean(item.published_post_id)).length,
          status: campaign.status,
          targetMetrics: campaign.target_metrics,
        };
      })
      .sort((left, right) => right.itemCount - left.itemCount || left.name.localeCompare(right.name))
      .slice(0, 8),
    total: campaigns.length,
  };
}

function buildExperiments(experiments: ExperimentRow[], results: ExperimentResultRow[]): AnalyticsReport["experiments"] {
  const experimentIdsWithResults = new Set(results.map((result) => result.experiment_id));
  const resultsByExperiment = new Map<string, ExperimentResultRow[]>();
  for (const result of results) {
    resultsByExperiment.set(result.experiment_id, [...(resultsByExperiment.get(result.experiment_id) ?? []), result]);
  }

  return {
    active: experiments.filter((experiment) => ["active", "running", "in_progress"].includes(experiment.status)).length,
    byDecision: countBy(results, (result) => result.decision ?? "undecided"),
    byStatus: countBy(experiments, (experiment) => experiment.status),
    summaries: experiments
      .map((experiment) => {
        const experimentResults = resultsByExperiment.get(experiment.id) ?? [];
        const latestResult = latestByGeneratedAt(experimentResults, (result) => result.generated_at);
        const interpretation = isJsonRecord(latestResult?.ai_interpretation) ? latestResult?.ai_interpretation : null;
        return {
          decision: latestResult?.decision ?? experiment.decision,
          experimentType: experiment.experiment_type,
          id: experiment.id,
          latestResult: latestResult?.result ?? jsonString(interpretation?.result_summary) ?? null,
          resultCount: experimentResults.length,
          status: experiment.status,
          successMetric: experiment.success_metric,
          title: experiment.title,
        };
      })
      .sort((left, right) => right.resultCount - left.resultCount || left.title.localeCompare(right.title))
      .slice(0, 8),
    total: experiments.length,
    withResults: experimentIdsWithResults.size,
  };
}

function reviewDigest(row: MonthlyReviewRow | WeeklyReviewRow | null, strategyKey: "monthly_strategy" | "weekly_strategy"): GrowthReviewDigest | null {
  if (!row) return null;
  const report = isJsonRecord(row.report) ? row.report : {};
  const recommendations = "recommendations" in row ? jsonStringArray(row.recommendations) : jsonStringArray(isJsonRecord(row.strategy_changes) ? row.strategy_changes.changes : row.strategy_changes);
  return {
    confidenceLabel: row.confidence_label,
    generatedAt: row.generated_at,
    id: row.id,
    recommendations,
    strategy: jsonString(report[strategyKey]) ?? jsonString(report.weekly_strategy) ?? jsonString(report.strategy) ?? null,
  };
}

function buildGrowth(input: AnalyticsInput): AnalyticsReport["growth"] {
  const growthGoals = input.growthGoals ?? [];
  const contentPillars = input.contentPillars ?? [];
  const latestWeeklyReview = latestByGeneratedAt(input.weeklyReviews ?? [], (review) => review.generated_at);
  const latestMonthlyReview = latestByGeneratedAt(input.monthlyReviews ?? [], (review) => review.generated_at);
  const latestProfileAudit = latestByGeneratedAt(input.profileAudits ?? [], (audit) => audit.generated_at);

  return {
    activeGoals: growthGoals.filter((goal) => ["active", "running", "in_progress"].includes(goal.status)).length,
    activePillars: contentPillars.filter((pillar) => pillar.active).length,
    latestMonthlyReview: reviewDigest(latestMonthlyReview, "monthly_strategy"),
    latestProfileAudit: latestProfileAudit
      ? {
          confidenceLabel: latestProfileAudit.confidence_label,
          findings: jsonStringArray(latestProfileAudit.findings),
          generatedAt: latestProfileAudit.generated_at,
          id: latestProfileAudit.id,
          recommendations: jsonStringArray(latestProfileAudit.recommendations),
          score: latestProfileAudit.score,
        }
      : null,
    latestWeeklyReview: reviewDigest(latestWeeklyReview, "weekly_strategy"),
    totalGoals: growthGoals.length,
    totalPillars: contentPillars.length,
  };
}

function buildUnknowns(input: AnalyticsInput, ownerPosts: PostRow[]): UnknownMetric[] {
  const unknowns: UnknownMetric[] = [
    {
      key: "follower_growth",
      label: "Follower growth",
      reason: "No follower-history table exists yet; show as unknown instead of inferring from post metrics.",
    },
  ];

  if (ownerPosts.some((post) => metric(post.impression_count) === 0)) {
    unknowns.push({
      key: "impression_coverage",
      label: "Impression coverage",
      reason: "Some imported/manual posts have zero impressions, which may mean unavailable data rather than true zero reach.",
    });
  }

  if (buildVelocity(ownerPosts, input.postMetricSnapshots).status === "unknown") {
    unknowns.push({
      key: "velocity",
      label: "Velocity",
      reason: "Velocity needs at least two valid metric snapshots for the same owner post.",
    });
  }

  return unknowns;
}

const scoreExplanations: ScoreExplanation[] = [
  {
    confidence: "inference",
    formula: "Stored heuristic_score when present; fallback = (engagement + virality) / 2 when stored score is unavailable.",
    label: "Heuristic score",
    notes: "This is an internal performance index, not a claim about the official X algorithm. Stored scores may come from the import/scoring pipeline; fallback scores use only available metrics.",
  },
  {
    confidence: "fact",
    formula: "engagement = weighted engagements / impressions * 100 when impressions are known; otherwise log fallback on raw engagement.",
    label: "Engagement rate",
    notes: "Likes, replies, reposts, quotes, bookmarks, profile clicks, and link clicks are weighted by deterministic scoring helpers.",
  },
  {
    confidence: "fact",
    formula: "velocity = max(current snapshot metric - previous snapshot metric, 0) / hours elapsed.",
    label: "Post-publish velocity",
    notes: "Velocity is hidden as unknown until two snapshots exist for the same post.",
  },
];

export function buildAnalyticsReport(input: AnalyticsInput, options: AnalyticsOptions = {}): AnalyticsReport {
  const now = options.now ?? new Date();
  const ownerPosts = input.posts.filter((post) => post.is_owner_post);

  return {
    aggregates: {
      dayOfWeek: aggregateBy(ownerPosts, dayOfWeekKey),
      format: aggregateBy(ownerPosts, (post) => normalizedGroup(post.format)),
      hook: aggregateBy(ownerPosts, (post) => normalizedGroup(post.hook_type)),
      hour: aggregateBy(ownerPosts, hourKey),
      topic: aggregateBy(ownerPosts, (post) => normalizedGroup(post.topic)),
    },
    blogs: buildBlogs(input.blogPosts),
    bottomPosts: buildTopPosts(ownerPosts, "bottom"),
    cadence: buildCadence(ownerPosts, now),
    campaigns: buildCampaigns(input.campaigns, input.campaignItems),
    experiments: buildExperiments(input.experiments, input.experimentResults),
    growth: buildGrowth(input),
    performance: buildPerformance(ownerPosts),
    publishing: buildPublishing(input),
    scoreExplanations,
    topPosts: buildTopPosts(ownerPosts, "top"),
    unknowns: buildUnknowns(input, ownerPosts),
    velocity: buildVelocity(ownerPosts, input.postMetricSnapshots),
  };
}

function parseDashboardCapabilities(value: Json) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    can_write_posts: record.can_write_posts === true,
  };
}

export function buildDashboardSummary(input: DashboardSummaryInput): DashboardSummary {
  const capabilities = input.xConnection ? parseDashboardCapabilities(input.xConnection.capabilities) : { can_write_posts: false };
  const canPublish = input.xConnection?.status === "connected" || input.xConnection?.status === "degraded" ? capabilities.can_write_posts : false;
  const topPost = input.analytics.topPosts[0];
  const latestReviewStrategy = input.analytics.growth.latestWeeklyReview?.strategy ?? input.analytics.growth.latestMonthlyReview?.strategy ?? null;

  return {
    archive: {
      blogs: input.analytics.blogs.total,
      generatedOutputs: input.generatedOutputCount,
      ideas: input.ideaCount,
      posts: input.analytics.performance.totalPosts,
    },
    performance: {
      topPosts: input.analytics.topPosts.slice(0, 3),
      totalEngagements: input.analytics.performance.totalEngagements,
      totalImpressions: input.analytics.performance.totalImpressions,
    },
    queue: {
      failedJobs: input.analytics.publishing.failedJobs,
      failureTotal: input.analytics.publishing.failedJobs + input.analytics.publishing.failedDrafts + input.analytics.publishing.failures,
      needsApproval: input.analytics.publishing.needsApproval,
      scheduled: input.analytics.publishing.scheduled,
    },
    queueRows: input.queueRows ?? [],
    recommendedNextActions: [
      {
        confidence: topPost ? "inference" : "speculation",
        label: topPost ? "Repurpose the current top post" : "Import or sync posts",
        reason: topPost ? `Best available post is ${topPost.id} by heuristic score.` : "Analytics needs at least one scored post before recommendations can cite evidence.",
      },
      ...(latestReviewStrategy
        ? [
            {
              confidence: "inference" as const,
              label: "Use latest growth strategy",
              reason: `Latest review recommends: ${latestReviewStrategy}`,
            },
          ]
        : []),
      {
        // L-23: Phase 19 (coach + retrieval) shipped; this static dashboard
        // recommendation is intentionally minimal — the coach itself produces
        // evidence-citing playbooks via /coach. Keeping a non-stale neutral
        // pointer so the dashboard recommendation list always has at least
        // one entry.
        confidence: "speculation",
        label: "Open coach for evidence-citing recommendations",
        reason: "Use the AI coach to generate playbooks tied to your stored posts, blogs, and growth context.",
      },
    ],
    status: {
      canPublish,
      lastSync: input.xConnection?.last_synced_at ?? null,
      publishingStatus: canPublish ? "enabled" : "disabled",
      xError: input.xConnection?.last_error ?? null,
      xStatus: input.xConnection?.status ?? "disconnected",
      xUsername: input.xConnection?.username ?? null,
    },
    strategy: {
      activeCampaigns: input.analytics.campaigns.active,
      activeExperiments: input.analytics.experiments.active,
      activeGoals: input.analytics.growth.activeGoals,
      activePillars: input.analytics.growth.activePillars,
      latestProfileScore: input.analytics.growth.latestProfileAudit?.score ?? null,
      latestReviewStrategy,
    },
  };
}
