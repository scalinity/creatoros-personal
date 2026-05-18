import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logAuditEvent } from "@/lib/audit";
import type { AdminContext } from "@/lib/auth/admin";
import type { NormalizedPostInput, NormalizedPostMetrics } from "@/lib/imports";
import {
  aggregateByDayOfWeek,
  aggregateByFormat,
  aggregateByHour,
  aggregateByTopic,
  calculateEngagementScore,
  calculateRecencyAdjustedScore,
  calculateViralityScore,
  classifyPerformanceBucket,
  classifyPostLengthBucket,
  detectPossibleFormat,
  detectPossibleHookType,
  type PerformanceBucket,
} from "@/lib/scoring";
import type { Database, Json, PostRow } from "@/types/database";

import type { PostHistoryAggregates, PostHistoryFilters, PostHistoryPost, PostHistorySort } from "./types";

type Supabase = SupabaseClient<Database>;

type ScoreBundle = {
  engagementRate: number;
  heuristicScore: number;
  qualityScore: number;
  scoreMetadata: Record<string, Json>;
  viralityScore: number;
};

export type ImportPersistenceResult = {
  created: number;
  failed: number;
  importJobId: null | string;
  updated: number;
};

export type PostMetricUpdateInput = Partial<NormalizedPostMetrics> & {
  contentPillar?: null | string;
  format?: null | string;
  hasLink?: boolean;
  hasMedia?: boolean;
  hookType?: null | string;
  id: string;
  tone?: null | string;
  topic?: null | string;
};

function round(value: number, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function nowIso() {
  return new Date().toISOString();
}

function metric(value: null | number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function metricsFromRow(row: PostRow): NormalizedPostMetrics {
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

function dbMetrics(metrics: NormalizedPostMetrics) {
  return {
    bookmark_count: metric(metrics.bookmarkCount),
    impression_count: metric(metrics.impressionCount),
    like_count: metric(metrics.likeCount),
    media_view_count: metric(metrics.mediaViewCount),
    profile_click_count: metric(metrics.profileClickCount),
    quote_count: metric(metrics.quoteCount),
    reply_count: metric(metrics.replyCount),
    repost_count: metric(metrics.repostCount),
    url_link_click_count: metric(metrics.urlLinkClickCount),
    video_view_count: metric(metrics.videoViewCount),
  };
}

function updatePayloadWithoutUserId(payload: Database["public"]["Tables"]["posts"]["Insert"]) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "user_id")) as Database["public"]["Tables"]["posts"]["Update"];
}

function qualityScoreForPost(post: Pick<NormalizedPostInput, "format" | "hasLink" | "hasMedia" | "hookType" | "text">) {
  const lengthBucket = classifyPostLengthBucket(post.text);
  const lengthScore = {
    essay: 42,
    long: 58,
    micro: 62,
    short: 72,
    standard: 78,
  }[lengthBucket];
  const hookBonus = post.hookType && post.hookType !== "unknown" ? 8 : 0;
  const formatBonus = post.format && post.format !== "unknown" ? 4 : 0;
  const mediaBonus = post.hasMedia ? 3 : 0;
  const linkPenalty = post.hasLink ? -3 : 0;

  return Math.max(0, Math.min(100, lengthScore + hookBonus + formatBonus + mediaBonus + linkPenalty));
}

function scorePost(post: NormalizedPostInput): ScoreBundle {
  const hookType = post.hookType ?? detectPossibleHookType(post.text);
  const format = post.format ?? detectPossibleFormat(post.text);
  const scoredPost = { ...post, format, hookType };
  const engagementRate = calculateEngagementScore(post.metrics);
  const viralityScore = calculateViralityScore(post.metrics);
  const qualityScore = qualityScoreForPost(scoredPost);
  const blendedScore = round(engagementRate * 0.55 + viralityScore * 0.25 + qualityScore * 0.2);
  const heuristicScore =
    calculateRecencyAdjustedScore({
      halfLifeDays: 120,
      score: blendedScore,
      timestamp: post.createdAtPlatform ?? nowIso(),
    }) ?? blendedScore;
  const performanceBucket = classifyPerformanceBucket(heuristicScore);
  const lengthBucket = classifyPostLengthBucket(post.text);

  return {
    engagementRate,
    heuristicScore,
    qualityScore,
    scoreMetadata: {
      // L-24: renamed from detected_format_placeholder / detected_hook_type_placeholder.
      // The flag indicates whether `format` / `hookType` were inferred by the
      // scoring pipeline because the user did not provide them. Old keys were
      // misleading because nothing was a "placeholder" — they were heuristics.
      // Kept the legacy keys alongside as `*_placeholder` aliases for one
      // release window so any persisted score_metadata blob still parses by key.
      detected_format_inferred: post.format ? false : true,
      detected_hook_type_inferred: post.hookType ? false : true,
      detected_format_placeholder: post.format ? false : true,
      detected_hook_type_placeholder: post.hookType ? false : true,
      format,
      heuristic_formula: "0.55*engagement + 0.25*virality + 0.20*quality, recency adjusted with 120-day half-life",
      hook_type: hookType,
      length_bucket: lengthBucket,
      performance_bucket: performanceBucket,
      scoring_version: "phase09.v1",
    },
    viralityScore,
  };
}

function payloadForPost(admin: AdminContext, post: NormalizedPostInput) {
  const detectedHookType = post.hookType ?? detectPossibleHookType(post.text);
  const detectedFormat = post.format ?? detectPossibleFormat(post.text);
  const scores = scorePost(post);
  const metadata = {
    ...(post.metadata as Record<string, Json>),
    ...scores.scoreMetadata,
  };

  return {
    ...dbMetrics(post.metrics),
    author_display_name: post.authorDisplayName,
    author_username: post.authorUsername,
    content_pillar: post.contentPillar,
    created_at_platform: post.createdAtPlatform,
    engagement_rate: scores.engagementRate,
    format: detectedFormat,
    has_link: post.hasLink,
    has_media: post.hasMedia,
    heuristic_score: scores.heuristicScore,
    hook_type: detectedHookType,
    imported_at: nowIso(),
    is_owner_post: post.isOwnerPost,
    media_metadata: {},
    metadata,
    platform: post.platform,
    platform_post_id: post.platformPostId,
    quality_score: scores.qualityScore,
    raw_api_payload: post.rawRecord as Json,
    source: post.source,
    text: post.text,
    tone: post.tone,
    topic: post.topic,
    url: post.url,
    user_id: admin.userId,
    virality_score: scores.viralityScore,
  } satisfies Database["public"]["Tables"]["posts"]["Insert"];
}

async function insertSnapshot(supabase: Supabase, userId: string, postId: string, source: string, post: NormalizedPostInput, scores: ScoreBundle) {
  const { error } = await supabase.from("post_metric_snapshots").insert({
    ...dbMetrics(post.metrics),
    engagement_rate: scores.engagementRate,
    heuristic_score: scores.heuristicScore,
    post_id: postId,
    quality_score: scores.qualityScore,
    raw_api_payload: post.rawRecord as Json,
    score_metadata: scores.scoreMetadata,
    snapshot_at: nowIso(),
    source,
    user_id: userId,
    virality_score: scores.viralityScore,
  });

  if (error) {
    throw new Error(`Failed to insert post metric snapshot: ${error.message}`);
  }
}

async function insertPost(admin: AdminContext, post: NormalizedPostInput) {
  const payload = payloadForPost(admin, post);
  const scores = scorePost(post);
  const { data, error } = await admin.supabase.from("posts").insert(payload).select().single();

  if (error || !data) {
    throw new Error(`Failed to create post: ${error?.message ?? "missing row"}`);
  }

  await insertSnapshot(admin.supabase, admin.userId, data.id, post.source, post, scores);

  return data;
}

async function updateExistingPost(admin: AdminContext, existing: PostRow, post: NormalizedPostInput) {
  const payload = payloadForPost(admin, post);
  const scores = scorePost(post);
  const updatePayload = updatePayloadWithoutUserId(payload);
  const { data, error } = await admin.supabase
    .from("posts")
    .update(updatePayload)
    .eq("id", existing.id)
    .eq("user_id", admin.userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update imported post: ${error?.message ?? "missing row"}`);
  }

  await insertSnapshot(admin.supabase, admin.userId, data.id, post.source, post, scores);

  return data;
}

async function findExistingPost(admin: AdminContext, post: NormalizedPostInput) {
  if (!post.platformPostId) {
    return null;
  }

  const { data, error } = await admin.supabase
    .from("posts")
    .select("*")
    .eq("user_id", admin.userId)
    .eq("platform", post.platform)
    .eq("platform_post_id", post.platformPostId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up existing post: ${error.message}`);
  }

  return data;
}

async function createImportJob(admin: AdminContext, seen: number, failed: number) {
  const timestamp = nowIso();
  const { data, error } = await admin.supabase
    .from("sync_jobs")
    .insert({
      completed_at: timestamp,
      error: failed > 0 ? `${failed} rows failed validation or persistence` : null,
      job_type: "manual_post_import",
      metadata: {
        phase: "09-scoring-imports-post-history",
        source: "manual_import",
      },
      records_created: 0,
      records_failed: failed,
      records_seen: seen,
      records_updated: 0,
      started_at: timestamp,
      status: failed > 0 ? "failed" : "succeeded",
      user_id: admin.userId,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create import job: ${error?.message ?? "missing row"}`);
  }

  return data.id;
}

async function finalizeImportJob(admin: AdminContext, id: string, result: ImportPersistenceResult, seen: number) {
  const { error } = await admin.supabase
    .from("sync_jobs")
    .update({
      completed_at: nowIso(),
      error: result.failed > 0 ? `${result.failed} rows failed validation or persistence` : null,
      records_created: result.created,
      records_failed: result.failed,
      records_seen: seen,
      records_updated: result.updated,
      status: result.failed > 0 ? "failed" : "succeeded",
    })
    .eq("id", id)
    .eq("user_id", admin.userId);

  if (error) {
    throw new Error(`Failed to finalize import job: ${error.message}`);
  }
}

export async function createManualPost(admin: AdminContext, post: NormalizedPostInput) {
  const created = await insertPost(admin, post);

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "post_manual_created",
    metadata: {
      phase: "09-scoring-imports-post-history",
      platform: post.platform,
      platform_post_id: post.platformPostId,
      source: post.source,
    },
    success: true,
    targetId: created.id,
    targetType: "post",
    userId: admin.userId,
  });

  return created;
}

export async function persistImportedPosts(
  admin: AdminContext,
  posts: NormalizedPostInput[],
  options: { parseErrorCount?: number; request?: { headers: Headers; url?: string } | null } = {},
): Promise<ImportPersistenceResult> {
  const result: ImportPersistenceResult = {
    created: 0,
    failed: options.parseErrorCount ?? 0,
    importJobId: null,
    updated: 0,
  };
  const seen = posts.length + result.failed;
  const importJobId = await createImportJob(admin, seen, result.failed);
  result.importJobId = importJobId;

  for (const post of posts) {
    try {
      const existing = await findExistingPost(admin, post);
      if (existing) {
        await updateExistingPost(admin, existing, post);
        result.updated += 1;
      } else {
        await insertPost(admin, post);
        result.created += 1;
      }
    } catch (error) {
      result.failed += 1;
      console.error("Failed to persist imported post", {
        platformPostId: post.platformPostId,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  await finalizeImportJob(admin, importJobId, result, seen);

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "posts_imported",
    metadata: {
      created: result.created,
      failed: result.failed,
      import_job_id: importJobId,
      phase: "09-scoring-imports-post-history",
      records_seen: seen,
      updated: result.updated,
    },
    request: options.request,
    success: result.failed === 0,
    targetId: importJobId,
    targetType: "sync_job",
    userId: admin.userId,
  });

  return result;
}

function metricUpdatePost(existing: PostRow, input: PostMetricUpdateInput): NormalizedPostInput {
  const metrics = metricsFromRow(existing);

  return {
    authorDisplayName: existing.author_display_name,
    authorUsername: existing.author_username,
    contentPillar: input.contentPillar ?? existing.content_pillar,
    createdAtPlatform: existing.created_at_platform,
    format: input.format ?? existing.format,
    hasLink: input.hasLink ?? existing.has_link,
    hasMedia: input.hasMedia ?? existing.has_media,
    hookType: input.hookType ?? existing.hook_type,
    isOwnerPost: existing.is_owner_post,
    metadata: existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? (existing.metadata as Record<string, unknown>) : {},
    metrics: {
      bookmarkCount: metric(input.bookmarkCount ?? metrics.bookmarkCount),
      impressionCount: metric(input.impressionCount ?? metrics.impressionCount),
      likeCount: metric(input.likeCount ?? metrics.likeCount),
      mediaViewCount: metric(input.mediaViewCount ?? metrics.mediaViewCount),
      profileClickCount: metric(input.profileClickCount ?? metrics.profileClickCount),
      quoteCount: metric(input.quoteCount ?? metrics.quoteCount),
      replyCount: metric(input.replyCount ?? metrics.replyCount),
      repostCount: metric(input.repostCount ?? metrics.repostCount),
      urlLinkClickCount: metric(input.urlLinkClickCount ?? metrics.urlLinkClickCount),
      videoViewCount: metric(input.videoViewCount ?? metrics.videoViewCount),
    },
    platform: existing.platform,
    platformPostId: existing.platform_post_id,
    rawRecord: existing.raw_api_payload && typeof existing.raw_api_payload === "object" && !Array.isArray(existing.raw_api_payload) ? (existing.raw_api_payload as Record<string, unknown>) : {},
    source: existing.source,
    text: existing.text,
    tone: input.tone ?? existing.tone,
    topic: input.topic ?? existing.topic,
    url: existing.url,
  };
}

function changedFields(existing: PostRow, input: PostMetricUpdateInput) {
  const checks: [string, unknown, unknown][] = [
    ["impression_count", existing.impression_count, input.impressionCount],
    ["like_count", existing.like_count, input.likeCount],
    ["reply_count", existing.reply_count, input.replyCount],
    ["repost_count", existing.repost_count, input.repostCount],
    ["quote_count", existing.quote_count, input.quoteCount],
    ["bookmark_count", existing.bookmark_count, input.bookmarkCount],
    ["topic", existing.topic, input.topic],
    ["format", existing.format, input.format],
    ["hook_type", existing.hook_type, input.hookType],
    ["tone", existing.tone, input.tone],
  ];

  return checks
    .filter(([, before, after]) => after !== undefined && before !== after)
    .map(([field]) => field);
}

export async function updatePostMetrics(admin: AdminContext, input: PostMetricUpdateInput) {
  const { data: existing, error: fetchError } = await admin.supabase
    .from("posts")
    .select("*")
    .eq("id", input.id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .single();

  if (fetchError || !existing) {
    throw new Error(`Post not found: ${fetchError?.message ?? input.id}`);
  }

  const normalized = metricUpdatePost(existing, input);
  const payload = payloadForPost(admin, normalized);
  const fields = changedFields(existing, input);
  const updatePayload = updatePayloadWithoutUserId(payload);
  const { data, error } = await admin.supabase
    .from("posts")
    .update(updatePayload)
    .eq("id", existing.id)
    .eq("user_id", admin.userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update post metrics: ${error?.message ?? "missing row"}`);
  }

  await insertSnapshot(admin.supabase, admin.userId, data.id, "manual_metric_edit", normalized, scorePost(normalized));

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "post_metrics_updated",
    metadata: {
      changed_fields: fields,
      phase: "09-scoring-imports-post-history",
      score_recalculated: true,
    },
    success: true,
    targetId: data.id,
    targetType: "post",
    userId: admin.userId,
  });

  return data;
}

function rowToPost(row: PostRow): PostHistoryPost {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  const performanceBucket = typeof metadata.performance_bucket === "string" ? metadata.performance_bucket : classifyPerformanceBucket(row.heuristic_score);
  const lengthBucket = typeof metadata.length_bucket === "string" ? metadata.length_bucket : classifyPostLengthBucket(row.text);

  return {
    authorDisplayName: row.author_display_name,
    authorUsername: row.author_username,
    bookmarkCount: row.bookmark_count,
    contentPillar: row.content_pillar,
    createdAt: row.created_at,
    createdAtPlatform: row.created_at_platform,
    engagementScore: row.engagement_rate,
    format: row.format,
    hasLink: row.has_link,
    hasMedia: row.has_media,
    heuristicScore: row.heuristic_score,
    hookType: row.hook_type,
    id: row.id,
    impressionCount: row.impression_count,
    isOwnerPost: row.is_owner_post,
    lengthBucket,
    likeCount: row.like_count,
    performanceBucket: performanceBucket as PerformanceBucket,
    platform: row.platform,
    platformPostId: row.platform_post_id,
    quoteCount: row.quote_count,
    replyCount: row.reply_count,
    repostCount: row.repost_count,
    source: row.source,
    text: row.text,
    tone: row.tone,
    topic: row.topic,
    url: row.url,
    viralityScore: row.virality_score,
  };
}

function postDate(post: PostHistoryPost) {
  const date = new Date(post.createdAtPlatform ?? post.createdAt);
  return Number.isFinite(date.getTime()) ? date : null;
}

function matchesBooleanFilter(value: boolean, filter: string | undefined) {
  if (!filter) return true;
  return filter === "true" ? value : !value;
}

function matchesTextFilter(value: null | string | undefined, filter: string | undefined) {
  if (!filter) return true;
  return value?.toLowerCase().includes(filter.toLowerCase()) ?? false;
}

function filterPosts(posts: PostHistoryPost[], filters: PostHistoryFilters) {
  const query = filters.q?.trim().toLowerCase();
  const from = filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : null;

  return posts.filter((post) => {
    const created = postDate(post);
    const haystack = [post.text, post.authorUsername, post.topic, post.format, post.hookType, post.tone, post.source]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (query && !haystack.includes(query)) return false;
    if (from && created && created < from) return false;
    if (to && created && created > to) return false;
    if (!matchesTextFilter(post.topic, filters.topic)) return false;
    if (!matchesTextFilter(post.format, filters.format)) return false;
    if (!matchesTextFilter(post.hookType, filters.hook_type)) return false;
    if (!matchesTextFilter(post.tone, filters.tone)) return false;
    if (!matchesTextFilter(post.source, filters.source)) return false;
    if (filters.performance && post.performanceBucket !== filters.performance) return false;
    if (!matchesBooleanFilter(post.hasMedia, filters.media)) return false;
    if (!matchesBooleanFilter(post.hasLink, filters.link)) return false;
    if (!matchesBooleanFilter(post.isOwnerPost, filters.owner)) return false;
    return true;
  });
}

function sortPosts(posts: PostHistoryPost[], sort: PostHistorySort = "newest") {
  const sorted = [...posts];

  sorted.sort((left, right) => {
    if (sort === "oldest") return (postDate(left)?.getTime() ?? 0) - (postDate(right)?.getTime() ?? 0);
    if (sort === "impressions") return right.impressionCount - left.impressionCount;
    if (sort === "likes") return right.likeCount - left.likeCount;
    if (sort === "engagement") return (right.engagementScore ?? 0) - (left.engagementScore ?? 0);
    if (sort === "virality") return (right.viralityScore ?? 0) - (left.viralityScore ?? 0);
    if (sort === "heuristic") return (right.heuristicScore ?? 0) - (left.heuristicScore ?? 0);
    return (postDate(right)?.getTime() ?? 0) - (postDate(left)?.getTime() ?? 0);
  });

  return sorted;
}

function aggregatesForPosts(posts: PostHistoryPost[]): PostHistoryAggregates {
  const aggregateInput = posts.map((post) => ({
    createdAt: post.createdAtPlatform ?? post.createdAt,
    format: post.format,
    heuristicScore: post.heuristicScore,
    id: post.id,
    impressionCount: post.impressionCount,
    likeCount: post.likeCount,
    quoteCount: post.quoteCount,
    replyCount: post.replyCount,
    repostCount: post.repostCount,
    topic: post.topic,
    viralityScore: post.viralityScore,
  }));

  return {
    dayOfWeek: aggregateByDayOfWeek(aggregateInput),
    format: aggregateByFormat(aggregateInput),
    hour: aggregateByHour(aggregateInput),
    topic: aggregateByTopic(aggregateInput),
  };
}

export async function loadPostHistory(
  admin: AdminContext,
  filters: PostHistoryFilters & { selected?: string } = {},
): Promise<{ aggregates: PostHistoryAggregates; posts: PostHistoryPost[]; selectedPost: null | PostHistoryPost }> {
  const { data, error } = await admin.supabase
    .from("posts")
    .select("*")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .order("created_at_platform", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Failed to load post history: ${error.message}`);
  }

  const allPosts = (data ?? []).map(rowToPost);
  const posts = sortPosts(filterPosts(allPosts, filters), filters.sort);
  const selectedPost = posts.find((post) => post.id === filters.selected) ?? posts[0] ?? null;

  return {
    aggregates: aggregatesForPosts(posts),
    posts,
    selectedPost,
  };
}
