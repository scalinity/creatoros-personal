import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logAuditEvent, logSafeError } from "@/lib/audit";
import type { AdminContext } from "@/lib/auth/admin";
import { nowIso } from "@/lib/db/json";
import { createSupabaseServiceRoleClient } from "@/lib/db/service-role";
import { calculateEngagementScore } from "@/lib/scoring";
import type { Database, Json, PostRow } from "@/types/database";

import { createLiveXApiClient, createMockXApiClient, type XApiClient, XApiError, type XAuthenticatedUser, type XSyncPost } from "./client";
import { loadDecryptedXConnection, markXConnectionDegraded, refreshStoredXConnection, shouldRefreshXToken } from "./oauth";

export type XReadSyncMode = "live" | "mock";

export type XReadSyncInput = {
  includeMetrics: boolean;
  maxPosts: number;
  mode: XReadSyncMode;
};

export type XReadSyncResult = {
  error: null | string;
  jobId: string;
  mode: XReadSyncMode;
  rateLimitResetAt: null | string;
  recordsCreated: number;
  recordsFailed: number;
  recordsSeen: number;
  recordsUpdated: number;
  status: "failed" | "succeeded";
};

type SyncOptions = {
  client?: XApiClient;
  now?: () => Date;
  request?: { headers: Headers; url?: string } | null;
  serviceClient?: SupabaseClient<Database>;
};

type SyncJobAccumulator = {
  created: number;
  failed: number;
  rateLimitResetAt: null | string;
  seen: number;
  updated: number;
};

function metric(value: null | number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

// L-16: scrub token-shaped substrings before persisting any error message to
// `last_error`, `sync_jobs.error`, or audit metadata. If X ever echoes a token
// fragment in an error body it must not survive into our audit log.
const TOKEN_SHAPED_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, // JWT-shape
  /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{12,})\b/g,
  /\boauth[_-]?token=([^\s&]+)/gi,
  /\baccess[_-]?token["'\s:=]*[A-Za-z0-9._~+/-]{16,}/gi,
  /\brefresh[_-]?token["'\s:=]*[A-Za-z0-9._~+/-]{16,}/gi,
];

function scrubTokenShapedSubstrings(message: string): string {
  let scrubbed = message;
  for (const pattern of TOKEN_SHAPED_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, "[redacted-token]");
  }
  return scrubbed;
}

function safeError(error: unknown) {
  const message = error instanceof XApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "unknown X sync failure";
  return scrubTokenShapedSubstrings(message).slice(0, 500);
}

function dbMetrics(post: XSyncPost) {
  return {
    bookmark_count: metric(post.metrics.bookmarkCount),
    impression_count: metric(post.metrics.impressionCount),
    like_count: metric(post.metrics.likeCount),
    media_view_count: metric(post.metrics.mediaViewCount),
    profile_click_count: metric(post.metrics.profileClickCount),
    quote_count: metric(post.metrics.quoteCount),
    reply_count: metric(post.metrics.replyCount),
    repost_count: metric(post.metrics.repostCount),
    url_link_click_count: metric(post.metrics.urlLinkClickCount),
    video_view_count: metric(post.metrics.videoViewCount),
  };
}

function missingMetrics(post: XSyncPost) {
  const entries = {
    bookmark_count: post.metrics.bookmarkCount,
    impression_count: post.metrics.impressionCount,
    like_count: post.metrics.likeCount,
    media_view_count: post.metrics.mediaViewCount,
    profile_click_count: post.metrics.profileClickCount,
    quote_count: post.metrics.quoteCount,
    reply_count: post.metrics.replyCount,
    repost_count: post.metrics.repostCount,
    url_link_click_count: post.metrics.urlLinkClickCount,
    video_view_count: post.metrics.videoViewCount,
  };

  return Object.entries(entries)
    .filter(([, value]) => value === null || value === undefined)
    .map(([key]) => key);
}

function scoreMetadata(post: XSyncPost): Record<string, Json> {
  const missing = missingMetrics(post);

  return {
    metrics_missing: missing,
    metrics_missing_count: missing.length,
    scoring_version: "phase16.x_sync.v1",
    source: "x_api",
  };
}

// SCA-516 (S-10): delegate to scoring/calculateEngagementScore so the same
// post produces the same engagement number whether you reach it via the
// X sync path (posts.engagement_rate column) or via the scoring path
// (calculated on read from raw metric counts). The prior unweighted
// formula here diverged from scoring's weighted formula, so the same
// row had two different "engagement" numbers depending on which surface
// you queried from. Engagement is `null` when there are no impressions
// (the metric is undefined in that case, not zero) — calculateEngagementScore
// returns 0 for that case so we map it to null to preserve the
// "no data yet" semantics the dashboard relies on.
function engagementRate(post: XSyncPost) {
  if (metric(post.metrics.impressionCount) <= 0) {
    return null;
  }
  return calculateEngagementScore({
    bookmarkCount: post.metrics.bookmarkCount,
    impressionCount: post.metrics.impressionCount,
    likeCount: post.metrics.likeCount,
    mediaViewCount: post.metrics.mediaViewCount,
    profileClickCount: post.metrics.profileClickCount,
    quoteCount: post.metrics.quoteCount,
    replyCount: post.metrics.replyCount,
    repostCount: post.metrics.repostCount,
    urlLinkClickCount: post.metrics.urlLinkClickCount,
    videoViewCount: post.metrics.videoViewCount,
  });
}

function xPostUrl(username: string, id: string) {
  return `https://x.com/${username}/status/${id}`;
}

function payloadForPost(admin: AdminContext, profile: XAuthenticatedUser, post: XSyncPost) {
  const metricsMissing = missingMetrics(post);
  const media = Array.isArray(post.media) ? post.media : [];
  const username = post.authorUsername ?? profile.username;

  return {
    ...dbMetrics(post),
    author_display_name: post.authorDisplayName ?? profile.displayName,
    author_username: username,
    created_at_platform: post.createdAt,
    engagement_rate: engagementRate(post),
    format: null,
    has_link: /https?:\/\//i.test(post.text),
    has_media: media.length > 0,
    heuristic_score: null,
    hook_type: null,
    imported_at: nowIso(),
    is_owner_post: true,
    media_metadata: media as Json,
    metadata: {
      metrics_missing: metricsMissing,
      sync_phase: "16-x-oauth-and-read-sync",
      untrusted_external_content: true,
      x_lang: post.lang,
    } satisfies Record<string, Json>,
    platform: "x",
    platform_post_id: post.id,
    quality_score: null,
    raw_api_payload: post.raw as Json,
    source: "x_api",
    text: post.text,
    tone: null,
    topic: null,
    url: xPostUrl(username, post.id),
    user_id: admin.userId,
    virality_score: null,
  } satisfies Database["public"]["Tables"]["posts"]["Insert"];
}

function updatePayloadWithoutUserId(payload: Database["public"]["Tables"]["posts"]["Insert"], existing?: PostRow) {
  const updatePayload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "user_id")) as Database["public"]["Tables"]["posts"]["Update"];

  if (!existing) {
    return updatePayload;
  }

  const existingMetadata = existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? existing.metadata : {};
  const syncMetadata = payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata : {};

  return {
    ...updatePayload,
    content_pillar: existing.content_pillar,
    deleted_at: null,
    format: existing.format,
    heuristic_score: existing.heuristic_score,
    hook_type: existing.hook_type,
    imported_at: existing.imported_at,
    metadata: {
      ...existingMetadata,
      ...syncMetadata,
    } as Json,
    quality_score: existing.quality_score,
    tone: existing.tone,
    topic: existing.topic,
    virality_score: existing.virality_score,
  };
}

async function createSyncJob(admin: AdminContext, input: XReadSyncInput, options: SyncOptions) {
  const timestamp = nowIso(options.now);
  const { data, error } = await admin.supabase
    .from("sync_jobs")
    .insert({
      job_type: "x_read_sync",
      metadata: {
        include_metrics: input.includeMetrics,
        max_posts: input.maxPosts,
        mode: input.mode,
        phase: "16-x-oauth-and-read-sync",
      },
      records_created: 0,
      records_failed: 0,
      records_seen: 0,
      records_updated: 0,
      started_at: timestamp,
      status: "running",
      user_id: admin.userId,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create X sync job: ${error?.message ?? "missing row"}`);
  }

  return data.id;
}

async function finalizeSyncJob(admin: AdminContext, jobId: string, accumulator: SyncJobAccumulator, status: "failed" | "succeeded", errorMessage: null | string, options: SyncOptions) {
  const { error } = await admin.supabase
    .from("sync_jobs")
    .update({
      completed_at: nowIso(options.now),
      error: errorMessage,
      rate_limit_reset_at: accumulator.rateLimitResetAt,
      records_created: accumulator.created,
      records_failed: accumulator.failed,
      records_seen: accumulator.seen,
      records_updated: accumulator.updated,
      status,
    })
    .eq("id", jobId)
    .eq("user_id", admin.userId);

  if (error) {
    throw new Error(`Failed to finalize X sync job: ${error.message}`);
  }
}

// SCA-499 (W-20): batch existence lookup. For a 25-post cron pull this
// replaces 25 serial round-trips with ONE `select ... in (...)`. The
// returned Map is keyed by platform_post_id so the per-post loop is a
// pure in-memory lookup.
async function findExistingPostsByPlatformId(
  admin: AdminContext,
  platformPostIds: readonly string[],
): Promise<Map<string, PostRow>> {
  if (platformPostIds.length === 0) return new Map();
  const { data, error } = await admin.supabase
    .from("posts")
    .select("*")
    .eq("user_id", admin.userId)
    .eq("platform", "x")
    .in("platform_post_id", platformPostIds as string[]);

  if (error) {
    throw new Error(`Failed to load existing X posts: ${error.message}`);
  }

  const map = new Map<string, PostRow>();
  for (const row of (data ?? []) as PostRow[]) {
    if (row.platform_post_id) map.set(row.platform_post_id, row);
  }
  return map;
}

// SCA-499 (W-20): factored out so the snapshot insert can be batched
// across the whole sync rather than happening one row at a time.
function buildSnapshotPayload(admin: AdminContext, postId: string, post: XSyncPost) {
  return {
    ...dbMetrics(post),
    engagement_rate: engagementRate(post),
    heuristic_score: null,
    post_id: postId,
    quality_score: null,
    raw_api_payload: post.raw as Json,
    score_metadata: scoreMetadata(post),
    snapshot_at: nowIso(),
    source: "x_api",
    user_id: admin.userId,
    virality_score: null,
  };
}

async function insertPostAndReturnRow(admin: AdminContext, profile: XAuthenticatedUser, post: XSyncPost): Promise<PostRow> {
  const payload = payloadForPost(admin, profile, post);
  const { data, error } = await admin.supabase.from("posts").insert(payload).select().single();

  if (error || !data) {
    throw new Error(`Failed to insert X post: ${error?.message ?? "missing row"}`);
  }
  return data as PostRow;
}

async function updatePostAndReturnRow(admin: AdminContext, profile: XAuthenticatedUser, existing: PostRow, post: XSyncPost): Promise<PostRow> {
  const payload = updatePayloadWithoutUserId(payloadForPost(admin, profile, post), existing);
  const { data, error } = await admin.supabase
    .from("posts")
    .update(payload)
    .eq("id", existing.id)
    .eq("user_id", admin.userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update X post: ${error?.message ?? "missing row"}`);
  }
  return data as PostRow;
}

async function getSyncClient(admin: AdminContext, input: XReadSyncInput, options: SyncOptions) {
  if (input.mode === "mock") {
    const client = options.client ?? createMockXApiClient();
    return {
      client,
      profile: await client.getAuthenticatedUser(),
      syncInput: input,
    };
  }

  const serviceClient = options.serviceClient ?? createSupabaseServiceRoleClient();
  let connection = await loadDecryptedXConnection(admin, { client: serviceClient });
  const capabilities = connection.capabilities;

  if (!capabilities.can_read_user_posts) {
    throw new Error("X connection is missing tweet.read or users.read scope.");
  }

  if (shouldRefreshXToken(connection.tokenExpiresAt)) {
    connection = await refreshStoredXConnection(admin, connection, { client: serviceClient });
  }

  const client = options.client ?? createLiveXApiClient(connection.accessToken);
  return {
    client,
    profile: await client.getAuthenticatedUser(),
    syncInput: {
      ...input,
      includeMetrics: input.includeMetrics && connection.capabilities.can_read_private_metrics,
    },
  };
}

async function updateLiveConnectionAfterSync(admin: AdminContext, mode: XReadSyncMode, profile: XAuthenticatedUser, accumulator: SyncJobAccumulator, options: SyncOptions) {
  if (mode !== "live") {
    return;
  }

  const { error } = await (options.serviceClient ?? createSupabaseServiceRoleClient())
    .from("x_connections")
    .update({
      avatar_url: profile.avatarUrl,
      display_name: profile.displayName,
      last_error: accumulator.failed > 0 ? `${accumulator.failed} posts failed during sync.` : null,
      last_synced_at: nowIso(options.now),
      status: accumulator.failed > 0 ? "degraded" : "connected",
      username: profile.username,
      x_user_id: profile.id,
    })
    .eq("user_id", admin.userId);

  if (error) {
    throw new Error(`Failed to update X connection sync status: ${error.message}`);
  }
}

export async function runXReadSync(admin: AdminContext, input: XReadSyncInput, options: SyncOptions = {}): Promise<XReadSyncResult> {
  const accumulator: SyncJobAccumulator = {
    created: 0,
    failed: 0,
    rateLimitResetAt: null,
    seen: 0,
    updated: 0,
  };
  const jobId = await createSyncJob(admin, input, options);

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "x_sync_started",
    metadata: {
      include_metrics: input.includeMetrics,
      max_posts: input.maxPosts,
      mode: input.mode,
      phase: "16-x-oauth-and-read-sync",
    },
    request: options.request,
    success: true,
    targetId: jobId,
    targetType: "sync_job",
    userId: admin.userId,
  });

  try {
    const { client, profile, syncInput } = await getSyncClient(admin, input, options);
    const listResult = await client.listUserPosts(profile.id, syncInput);
    accumulator.rateLimitResetAt = listResult.rateLimitResetAt;
    accumulator.seen = listResult.posts.length;

    // SCA-499 (W-20): batch existence lookup ONCE, then upsert + bulk-
    // insert snapshots. Prior implementation did up to 3 sequential DB
    // round-trips per post (find + insert/update + snapshot insert) for
    // a 25-post pull = ~75 round-trips, which could exceed the platform
    // wall-clock on a slow Postgres window and leave sync_jobs stuck in
    // \`running\`. We still iterate the upsert per post because each row
    // needs distinct error handling for the failed-count, but the
    // existence lookup is now O(1) per post.
    const existingByPlatformId = await findExistingPostsByPlatformId(
      admin,
      listResult.posts.map((post) => post.id),
    );

    // Per-tick wall-clock safety. The X API call upstream is bounded by
    // its own X_API_FETCH_TIMEOUT; this guards the DB-write loop.
    const dbTimeoutMs = 60_000;
    const startedAt = Date.now();

    const snapshotPayloads: Json[] = [];

    for (const post of listResult.posts) {
      if (Date.now() - startedAt > dbTimeoutMs) {
        accumulator.failed += listResult.posts.length - accumulator.created - accumulator.updated - accumulator.failed;
        logSafeError(
          "X sync DB-write loop exceeded wall-clock budget",
          new Error(`elapsed=${Date.now() - startedAt}ms limit=${dbTimeoutMs}ms`),
        );
        break;
      }
      try {
        const existing = existingByPlatformId.get(post.id) ?? null;
        let persistedPostId: string;
        if (existing) {
          const updated = await updatePostAndReturnRow(admin, profile, existing, post);
          persistedPostId = updated.id;
          accumulator.updated += 1;
        } else {
          const inserted = await insertPostAndReturnRow(admin, profile, post);
          persistedPostId = inserted.id;
          accumulator.created += 1;
        }
        snapshotPayloads.push(buildSnapshotPayload(admin, persistedPostId, post) as Json);
      } catch (error) {
        accumulator.failed += 1;
        // SCA-481 (W-2): safeError already scrubs token-shaped substrings;
        // logSafeError adds the broader redaction pass for any provider noise.
        logSafeError("Failed to persist X sync post", error, { platformPostId: post.id });
      }
    }

    // SCA-499 (W-20): single bulk insert of every snapshot. ~25 rows
    // shipped in one round-trip instead of 25.
    if (snapshotPayloads.length > 0) {
      const { error: snapshotError } = await admin.supabase
        .from("post_metric_snapshots")
        .insert(snapshotPayloads as never);
      if (snapshotError) {
        // Don't fail the whole sync — the posts ARE persisted. Snapshots
        // can be regenerated on the next tick. But surface the failure.
        logSafeError("Bulk snapshot insert failed during X sync", snapshotError);
      }
    }

    const status = accumulator.failed > 0 ? "failed" : "succeeded";
    const errorMessage = accumulator.failed > 0 ? `${accumulator.failed} X posts failed during sync.` : null;
    await updateLiveConnectionAfterSync(admin, input.mode, profile, accumulator, options);
    await finalizeSyncJob(admin, jobId, accumulator, status, errorMessage, options);
    await logAuditEvent({
      actorEmail: admin.email,
      eventType: status === "succeeded" ? "x_sync_succeeded" : "x_sync_failed",
      error: errorMessage,
      metadata: {
        created: accumulator.created,
        failed: accumulator.failed,
        mode: input.mode,
        phase: "16-x-oauth-and-read-sync",
        rate_limit_reset_at: accumulator.rateLimitResetAt,
        records_seen: accumulator.seen,
        updated: accumulator.updated,
      },
      request: options.request,
      success: status === "succeeded",
      targetId: jobId,
      targetType: "sync_job",
      userId: admin.userId,
    });

    return {
      error: errorMessage,
      jobId,
      mode: input.mode,
      rateLimitResetAt: accumulator.rateLimitResetAt,
      recordsCreated: accumulator.created,
      recordsFailed: accumulator.failed,
      recordsSeen: accumulator.seen,
      recordsUpdated: accumulator.updated,
      status,
    };
  } catch (error) {
    const errorMessage = safeError(error);
    const rateLimitResetAt = error instanceof XApiError ? (error.details.rateLimitResetAt ?? null) : null;
    accumulator.rateLimitResetAt = rateLimitResetAt;
    accumulator.failed = Math.max(accumulator.failed, accumulator.seen > 0 ? accumulator.failed : 1);

    if (input.mode === "live") {
      try {
        await markXConnectionDegraded(admin, errorMessage, options.serviceClient ?? createSupabaseServiceRoleClient());
      } catch (degradeError) {
        logSafeError("Failed to mark X connection degraded after sync failure", degradeError);
      }
    }

    await finalizeSyncJob(admin, jobId, accumulator, "failed", errorMessage, options);
    await logAuditEvent({
      actorEmail: admin.email,
      error: errorMessage,
      eventType: "x_sync_failed",
      metadata: {
        mode: input.mode,
        phase: "16-x-oauth-and-read-sync",
        rate_limit_reset_at: rateLimitResetAt,
      },
      request: options.request,
      success: false,
      targetId: jobId,
      targetType: "sync_job",
      userId: admin.userId,
    });

    return {
      error: errorMessage,
      jobId,
      mode: input.mode,
      rateLimitResetAt,
      recordsCreated: accumulator.created,
      recordsFailed: accumulator.failed,
      recordsSeen: accumulator.seen,
      recordsUpdated: accumulator.updated,
      status: "failed",
    };
  }
}
