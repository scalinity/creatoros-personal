import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { logAuditEvent } from "@/lib/audit";
import type { AdminContext } from "@/lib/auth/admin";
import { createSupabaseServiceRoleClient } from "@/lib/db/service-role";
import { createLiveXPublishingClient, type XCreatePostPayload, XApiError, type XCreatedPost, type XMediaUploadInput, type XPublishingClient } from "@/lib/x/client";
import { loadDecryptedXConnection, loadXConnectionStatus, refreshStoredXConnection, shouldRefreshXToken, type DecryptedXConnection, type SanitizedXConnection } from "@/lib/x/oauth";
import type {
  BlogPostRow,
  ContentCalendarItemRow,
  ContentIdeaRow,
  Database,
  GeneratedOutputRow,
  Json,
  MediaAssetRow,
  PostRow,
  PublishingDraftRow,
  PublishingFailureRow,
  PublishingJobRow,
  PublishedPostRow,
  ScheduledPostRow,
} from "@/types/database";

import type {
  PublishingCancelInput,
  PublishingDraftApprovalInput,
  PublishingDraftCreateInput,
  PublishingDraftDryRunInput,
  PublishingDraftFromSourceInput,
  PublishingDraftScheduleInput,
  PublishingDraftUpdateInput,
  PublishingJobRetryInput,
} from "./validation";
import { publishingSourceTypes } from "./validation";

// =============================================================================
// M-14: lib/publishing/index.ts is the publishing domain entry point. The file
// is large (~2400 lines) because it bundles several cooperating concerns:
//
//   1. Domain types and `rowTo*` adapters (around lines 60-260).
//   2. Validation / approval-payload hashing (computePublishingPayloadHash and
//      friends, around lines 750-900).
//   3. The state-machine guard helpers (assertApprovalPayload, etc.) and the
//      XPublishingGuardError class around lines 980-1240.
//   4. Idempotency-key generation (liveIdempotencyKey, dryRunIdempotencyKey).
//   5. Dry-run job construction (runDryRunPublishingJob, around 1140-1200).
//   6. The live X publish path (runXPublishingJob + helpers, ~1820-1990).
//   7. Retry / cancel / archive operations (~1990-2080).
//   8. The scheduled-cron executor (runScheduledPublishingExecutor, ~2150).
//   9. Workspace + calendar loaders for the UI (~2210+).
//
// A future split should extract them into:
//   * lib/publishing/state-machine.ts  (sections 2 + 3)
//   * lib/publishing/idempotency.ts    (section 4)
//   * lib/publishing/adapter.ts        (sections 5 + 6 + 7)
//   * lib/publishing/executor.ts       (section 8)
//   * lib/publishing/workspace.ts      (section 9)
//
// That refactor is deliberately deferred per the FINAL_CODEBASE_REVIEW M-14
// note ("pure refactor, no behavior change") — done here as section markers
// instead so the file is at least navigable without inflating diff risk.
// =============================================================================

const PHASE = "15-publishing-state-machine-dry-run-calendar";
const PHASE_17 = "17-x-write-publishing-adapter";
const DRY_RUN_FAILURE_MARKER = "[dry-run-fail]";

type PublishingDraftUpdatePayload = Database["public"]["Tables"]["publishing_drafts"]["Update"];

type PublishingDraftCreateServiceInput = Partial<PublishingDraftCreateInput> & {
  contentType: PublishingDraftCreateInput["contentType"];
};
type PublishingDraftFromSourceServiceInput = Omit<PublishingDraftFromSourceInput, "contentType"> & {
  contentType?: PublishingDraftFromSourceInput["contentType"];
};
type PublishingDraftApprovalServiceInput = Omit<PublishingDraftApprovalInput, "duplicateOverrideReason" | "payloadHash"> & Partial<Pick<PublishingDraftApprovalInput, "duplicateOverrideReason" | "payloadHash">>;
type PublishingDraftDryRunServiceInput = Omit<PublishingDraftDryRunInput, "confirmation" | "payloadHash"> & Partial<Pick<PublishingDraftDryRunInput, "confirmation" | "payloadHash">>;

type TextComparison = {
  id: string;
  text: string;
  type: "draft" | "post";
};

export type PublishingContentType =
  | "blog_post"
  | "blog_to_x_series"
  | "blog_to_x_thread"
  | "campaign_sequence"
  | "quote_post"
  | "reply"
  | "single_post"
  | "thread";
export type PublishingDraftStatus = "ai_generated" | "analyzed" | "approved" | "archived" | "canceled" | "draft" | "failed" | "owner_edited" | "published" | "publishing" | "scheduled";
export type PublishingApprovalStatus = "approved" | "invalidated" | "pending" | "revoked";

export type PublishingDraft = {
  approvalPayloadHash: null | string;
  approvalStatus: PublishingApprovalStatus | string;
  approvedAt: null | string;
  campaignId: null | string;
  contentType: PublishingContentType | string;
  createdAt: string;
  duplicateCheck: Record<string, Json>;
  experimentId: null | string;
  id: string;
  mediaAssetIds: string[];
  metadata: Record<string, Json>;
  quotePostId: null | string;
  replyToPostId: null | string;
  riskCheck: Record<string, Json>;
  scheduledAt: null | string;
  similarityCheck: Record<string, Json>;
  sourceId: null | string;
  sourceType: null | string;
  status: PublishingDraftStatus | string;
  text: string;
  threadItems: string[];
  timezone: string;
  updatedAt: string;
};

export type PublishingJob = {
  attemptCount: number;
  completedAt: null | string;
  createdAt: string;
  draftId: string;
  error: null | string;
  errorCode: null | string;
  id: string;
  idempotencyKey: string;
  jobType: string;
  scheduledFor: null | string;
  startedAt: null | string;
  status: string;
};

export type PublishingFailure = {
  createdAt: string;
  draftId?: string;
  failureType: string;
  id: string;
  jobId: string;
  message: null | string;
  retryAfter: null | string;
  retryable: boolean;
};

export type PublishedPost = {
  contentType: string;
  id: string;
  platformPostId: null | string;
  publishedAt: string;
  publishedVia: string;
  quoteTargetPostId: null | string;
  replyTargetPostId: null | string;
  threadPostIds: string[];
  threadRootPostId: null | string;
  url: null | string;
};

export type ScheduledPost = {
  calendarItemId: null | string;
  draftId: string;
  id: string;
  scheduledFor: string;
  status: string;
  timezone: string;
};

export type PublishingWorkspace = {
  drafts: PublishingDraft[];
  failures: PublishingFailure[];
  jobs: PublishingJob[];
  metrics: {
    approved: number;
    failed: number;
    needsApproval: number;
    scheduled: number;
  };
  scheduledPosts: ScheduledPost[];
};

export type PublishingCalendarItem = {
  draftId: null | string;
  id: string;
  scheduledFor: string;
  status: string;
  text: string;
  timezone: string;
  title: string;
  type: string;
};

export type PublishingCalendarDay = {
  date: string;
  items: PublishingCalendarItem[];
  load: number;
  warning: null | string;
};

export type PublishingCalendar = {
  days: PublishingCalendarDay[];
  timezone: string;
  totals: {
    failed: number;
    scheduled: number;
    warningDays: number;
  };
};

function nowIso() {
  return new Date().toISOString();
}

function metadataWithPhase(metadata: Record<string, Json> = {}) {
  return {
    phase: PHASE,
    ...metadata,
  } satisfies Record<string, Json>;
}

function safeObject(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : {};
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function rowToDraft(row: PublishingDraftRow): PublishingDraft {
  return {
    approvalPayloadHash: row.approval_payload_hash,
    approvalStatus: row.approval_status,
    approvedAt: row.approved_at,
    campaignId: row.campaign_id,
    contentType: row.content_type,
    createdAt: row.created_at,
    duplicateCheck: safeObject(row.duplicate_check),
    experimentId: row.experiment_id,
    id: row.id,
    mediaAssetIds: row.media_asset_ids,
    metadata: safeObject(row.metadata),
    quotePostId: row.quote_post_id,
    replyToPostId: row.reply_to_post_id,
    riskCheck: safeObject(row.risk_check),
    scheduledAt: row.scheduled_at,
    similarityCheck: safeObject(row.similarity_check),
    sourceId: row.source_id,
    sourceType: row.source_type,
    status: row.status,
    text: row.text,
    threadItems: safeStringArray(row.thread_items),
    timezone: row.timezone,
    updatedAt: row.updated_at,
  };
}

function rowToJob(row: PublishingJobRow): PublishingJob {
  return {
    attemptCount: row.attempt_count,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    draftId: row.publishing_draft_id,
    error: row.error,
    errorCode: row.error_code,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    jobType: row.job_type,
    scheduledFor: row.scheduled_for,
    startedAt: row.started_at,
    status: row.status,
  };
}

function rowToFailure(row: PublishingFailureRow): PublishingFailure {
  return {
    createdAt: row.created_at,
    draftId: row.publishing_draft_id,
    failureType: row.failure_type,
    id: row.id,
    jobId: row.publishing_job_id,
    message: row.sanitized_message,
    retryAfter: row.retry_after,
    retryable: row.retryable,
  };
}

function rowToPublishedPost(row: PublishedPostRow): PublishedPost {
  return {
    contentType: row.content_type,
    id: row.id,
    platformPostId: row.platform_post_id,
    publishedAt: row.published_at,
    publishedVia: row.published_via,
    quoteTargetPostId: row.quote_target_post_id,
    replyTargetPostId: row.reply_target_post_id,
    threadPostIds: row.thread_post_ids,
    threadRootPostId: row.thread_root_post_id,
    url: row.url,
  };
}

function rowToScheduledPost(row: ScheduledPostRow): ScheduledPost {
  return {
    calendarItemId: row.calendar_item_id,
    draftId: row.publishing_draft_id,
    id: row.id,
    scheduledFor: row.scheduled_for,
    status: row.status,
    timezone: row.timezone,
  };
}

function textForDraft(draft: Pick<PublishingDraft, "text" | "threadItems">) {
  return draft.threadItems.length > 0 ? draft.threadItems.join("\n\n") : draft.text;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashString(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJsonStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function requiredScopesForDraft(draft: Pick<PublishingDraft, "contentType" | "mediaAssetIds">) {
  const scopes = new Set(["tweet.write"]);
  if (draft.mediaAssetIds.length > 0) scopes.add("media.write");
  return [...scopes].sort();
}

export function buildPublishingPayloadPreview(draft: PublishingDraft, connection?: null | SanitizedXConnection) {
  const liveWriteEnabled = connection?.capabilities.can_write_posts === true;

  return {
    account: {
      avatar_url: connection?.avatarUrl ?? null,
      display_name: connection?.displayName ?? "X connection pending",
      username: connection?.username ?? "not_connected",
      x_user_id: connection?.xUserId ?? null,
    },
    capabilities: connection?.capabilities ?? {
      can_delete_posts: false,
      can_read_metrics: false,
      can_read_private_metrics: false,
      can_read_user_posts: false,
      can_upload_media: draft.mediaAssetIds.length === 0,
      can_write_posts: true,
      can_write_quotes: draft.contentType === "quote_post",
      can_write_replies: draft.contentType === "reply",
      dry_run_only: true,
      enterprise_analytics_enabled: false,
      enterprise_quote_post_enabled: false,
      enterprise_streams_enabled: false,
    },
    content_type: draft.contentType,
    live_x_write_enabled: liveWriteEnabled,
    media_asset_ids: draft.mediaAssetIds,
    quote_post_id: draft.quotePostId,
    reply_to_post_id: draft.replyToPostId,
    required_scopes: requiredScopesForDraft(draft),
    text: draft.text,
    thread_items: draft.threadItems,
  } satisfies Record<string, Json>;
}

export function computePublishingPayloadHash(draft: PublishingDraft, connection?: null | SanitizedXConnection) {
  return hashString(stableJsonStringify(buildPublishingPayloadPreview(draft, connection)));
}

function jaccardSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeText(right).split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

async function loadComparisonTexts(admin: AdminContext, excludeDraftId?: string): Promise<TextComparison[]> {
  const { data: draftRows, error: draftsError } = await admin.supabase
    .from("publishing_drafts")
    .select("*")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (draftsError) {
    throw new Error(`Failed to load draft comparison rows: ${draftsError.message}`);
  }

  const { data: postRows, error: postsError } = await admin.supabase
    .from("posts")
    .select("*")
    .eq("user_id", admin.userId)
    .eq("is_owner_post", true)
    .is("deleted_at", null)
    .order("created_at_platform", { ascending: false })
    .limit(200);

  if (postsError) {
    throw new Error(`Failed to load post comparison rows: ${postsError.message}`);
  }

  return [
    ...(draftRows ?? [])
      .filter((row) => row.id !== excludeDraftId)
      .map((row) => ({ id: row.id, text: row.thread_items && Array.isArray(row.thread_items) && row.thread_items.length > 0 ? safeStringArray(row.thread_items).join("\n\n") : row.text, type: "draft" as const })),
    ...(postRows ?? []).map((row) => ({ id: row.id, text: row.text, type: "post" as const })),
  ].filter((item) => item.text.trim().length > 0);
}

function riskCheckForDraft(draft: Pick<PublishingDraft, "contentType" | "quotePostId" | "replyToPostId" | "text" | "threadItems">) {
  const warnings: string[] = [];
  let blocking = false;
  const items = draft.threadItems.length > 0 ? draft.threadItems : draft.text ? [draft.text] : [];
  const xLimitedTypes = ["single_post", "reply", "quote_post", "thread", "blog_to_x_thread", "blog_to_x_series", "campaign_sequence"];

  if (xLimitedTypes.includes(draft.contentType)) {
    items.forEach((item, index) => {
      if (item.length > 280) {
        warnings.push(`Item ${index + 1} is over 280 characters.`);
        blocking = true;
      }
    });
  }

  if (draft.contentType === "reply" && !draft.replyToPostId) warnings.push("Reply target is missing.");
  if (draft.contentType === "quote_post" && !draft.quotePostId) warnings.push("Quote target is missing.");

  return {
    blocking,
    checked_at: nowIso(),
    warnings,
  } satisfies Record<string, Json>;
}

async function runDraftGuardrails(admin: AdminContext, draft: PublishingDraft, excludeDraftId?: string) {
  const comparisons = await loadComparisonTexts(admin, excludeDraftId);
  const text = textForDraft(draft);
  const normalized = normalizeText(text);
  const normalizedHash = hashString(normalized);
  const duplicateMatches = comparisons
    .filter((comparison) => normalizeText(comparison.text) === normalized)
    .map((comparison) => ({ id: comparison.id, score: 1, type: comparison.type } satisfies Record<string, Json>));
  const similarityMatches = comparisons
    .map((comparison) => ({ id: comparison.id, score: Number(jaccardSimilarity(text, comparison.text).toFixed(3)), type: comparison.type } satisfies Record<string, Json>))
    .filter((match) => typeof match.score === "number" && match.score >= 0.72)
    .sort((left, right) => Number(right.score) - Number(left.score))
    .slice(0, 5);
  const highestSimilarity = similarityMatches[0]?.score;

  return {
    duplicateCheck: {
      checked_at: nowIso(),
      matches: duplicateMatches,
      normalized_hash: normalizedHash,
      status: duplicateMatches.length > 0 ? "duplicate" : "clear",
    } satisfies Record<string, Json>,
    riskCheck: riskCheckForDraft(draft),
    similarityCheck: {
      checked_at: nowIso(),
      highest_score: typeof highestSimilarity === "number" ? highestSimilarity : 0,
      matches: similarityMatches,
      status: typeof highestSimilarity === "number" && highestSimilarity >= 0.86 ? "high_similarity" : "clear",
    } satisfies Record<string, Json>,
  };
}

function isPublishingSourceType(value: unknown): value is PublishingDraftCreateInput["sourceType"] {
  return typeof value === "string" && publishingSourceTypes.includes(value as PublishingDraftCreateInput["sourceType"]);
}

function normalizeCreateInput(input: PublishingDraftCreateServiceInput): PublishingDraftCreateInput {
  const runtimeInput = input as PublishingDraftCreateServiceInput & Partial<Record<keyof PublishingDraftCreateInput, unknown>>;

  return {
    campaignId: typeof runtimeInput.campaignId === "string" ? runtimeInput.campaignId : null,
    contentType: input.contentType,
    experimentId: typeof runtimeInput.experimentId === "string" ? runtimeInput.experimentId : null,
    mediaAssetIds: Array.isArray(runtimeInput.mediaAssetIds) ? runtimeInput.mediaAssetIds.filter((item): item is string => typeof item === "string") : [],
    metadata: runtimeInput.metadata && typeof runtimeInput.metadata === "object" && !Array.isArray(runtimeInput.metadata) ? (runtimeInput.metadata as Record<string, Json>) : {},
    quotePostId: typeof runtimeInput.quotePostId === "string" ? runtimeInput.quotePostId : null,
    replyToPostId: typeof runtimeInput.replyToPostId === "string" ? runtimeInput.replyToPostId : null,
    sourceId: typeof runtimeInput.sourceId === "string" ? runtimeInput.sourceId : null,
    sourceType: isPublishingSourceType(runtimeInput.sourceType) ? runtimeInput.sourceType : "manual",
    status: runtimeInput.status as PublishingDraftCreateInput["status"],
    text: typeof runtimeInput.text === "string" ? runtimeInput.text : "",
    threadItems: Array.isArray(runtimeInput.threadItems) ? runtimeInput.threadItems.filter((item): item is string => typeof item === "string") : [],
    timezone: typeof runtimeInput.timezone === "string" && runtimeInput.timezone.trim() ? runtimeInput.timezone : "UTC",
  };
}

function candidateToDraft(input: PublishingDraftCreateServiceInput, id = "candidate"): PublishingDraft {
  const normalized = normalizeCreateInput(input);

  return {
    approvalPayloadHash: null,
    approvalStatus: "pending",
    approvedAt: null,
    campaignId: normalized.campaignId,
    contentType: normalized.contentType,
    createdAt: nowIso(),
    duplicateCheck: {},
    experimentId: normalized.experimentId,
    id,
    mediaAssetIds: normalized.mediaAssetIds,
    metadata: normalized.metadata,
    quotePostId: normalized.quotePostId,
    replyToPostId: normalized.replyToPostId,
    riskCheck: {},
    scheduledAt: null,
    similarityCheck: {},
    sourceId: normalized.sourceId,
    sourceType: normalized.sourceType,
    status: normalized.status ?? "draft",
    text: normalized.text,
    threadItems: normalized.threadItems,
    timezone: normalized.timezone,
    updatedAt: nowIso(),
  };
}

function sourceColumns(sourceType: null | string, sourceId: null | string) {
  return {
    source_content_idea_id: sourceType === "content_idea" ? sourceId : null,
    source_generated_output_id: sourceType === "generated_output" ? sourceId : null,
    source_post_id: sourceType === "post" ? sourceId : null,
  };
}

export async function createPublishingDraft(admin: AdminContext, input: PublishingDraftCreateServiceInput) {
  const normalized = normalizeCreateInput(input);
  const candidate = candidateToDraft(normalized);
  const checks = await runDraftGuardrails(admin, candidate);
  const initialStatus = normalized.status ?? (normalized.sourceType === "generated_output" || normalized.metadata.created_by === "ai" ? "ai_generated" : "draft");
  const { data, error } = await admin.supabase
    .from("publishing_drafts")
    .insert({
      ...sourceColumns(normalized.sourceType, normalized.sourceId),
      approval_status: "pending",
      campaign_id: normalized.campaignId,
      content_type: normalized.contentType,
      duplicate_check: checks.duplicateCheck,
      experiment_id: normalized.experimentId,
      media_asset_ids: normalized.mediaAssetIds,
      metadata: metadataWithPhase(normalized.metadata),
      quote_post_id: normalized.quotePostId,
      reply_to_post_id: normalized.replyToPostId,
      risk_check: checks.riskCheck,
      similarity_check: checks.similarityCheck,
      source_id: normalized.sourceId,
      source_type: normalized.sourceType,
      status: initialStatus,
      text: normalized.text,
      thread_items: normalized.threadItems,
      timezone: normalized.timezone,
      user_id: admin.userId,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create publishing draft: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "publishing_draft_created",
    metadata: {
      content_type: normalized.contentType,
      phase: PHASE,
      source_id: normalized.sourceId,
      source_type: normalized.sourceType,
      status: initialStatus,
    },
    success: true,
    targetId: data.id,
    targetType: "publishing_draft",
    userId: admin.userId,
  });

  return rowToDraft(data);
}

function outputContentType(output: GeneratedOutputRow): PublishingContentType {
  if (output.type === "x_thread") return "thread";
  if (output.type === "reply") return "reply";
  if (output.type === "quote_post") return "quote_post";
  if (output.type === "campaign_sequence") return "campaign_sequence";
  return "single_post";
}

function splitGeneratedOutputText(output: GeneratedOutputRow, contentType: PublishingContentType) {
  if (["thread", "blog_to_x_thread", "blog_to_x_series", "campaign_sequence"].includes(contentType)) {
    return output.text
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]*\)/g, (match) => match.replace(/^\[|\]\([^)]*\)$/g, ""))
    .replace(/[#>*_~\-]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampPostText(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 270) return trimmed;
  return `${trimmed.slice(0, 267).trim()}...`;
}

async function loadGeneratedOutputSource(admin: AdminContext, sourceId: string) {
  const { data, error } = await admin.supabase
    .from("generated_outputs")
    .select("*")
    .eq("id", sourceId)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .single();

  if (error || !data) throw new PublishingNotFoundError("Generated output source", `Generated output source not found: ${error?.message ?? "missing row"}`);
  return data;
}

async function loadContentIdeaSource(admin: AdminContext, sourceId: string) {
  const { data, error } = await admin.supabase
    .from("content_ideas")
    .select("*")
    .eq("id", sourceId)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .single();

  if (error || !data) throw new PublishingNotFoundError("Content idea source", `Content idea source not found: ${error?.message ?? "missing row"}`);
  return data;
}

async function loadBlogPostSource(admin: AdminContext, sourceId: string) {
  const { data, error } = await admin.supabase
    .from("blog_posts")
    .select("*")
    .eq("id", sourceId)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .single();

  if (error || !data) throw new PublishingNotFoundError("Blog source", `Blog source not found: ${error?.message ?? "missing row"}`);
  return data;
}

async function loadPostSource(admin: AdminContext, sourceId: string) {
  const { data, error } = await admin.supabase
    .from("posts")
    .select("*")
    .eq("id", sourceId)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .single();

  if (error || !data) throw new PublishingNotFoundError("Post source", `Post source not found: ${error?.message ?? "missing row"}`);
  return data;
}

function draftInputFromGeneratedOutput(output: GeneratedOutputRow, requestedType: null | PublishingContentType): PublishingDraftCreateInput {
  const contentType = requestedType ?? outputContentType(output);
  return {
    campaignId: null,
    contentType,
    experimentId: null,
    mediaAssetIds: [],
    metadata: { created_by: output.provider ? "ai" : "owner", source_prompt_version: output.prompt_version },
    quotePostId: null,
    replyToPostId: null,
    sourceId: output.id,
    sourceType: "generated_output",
    status: "ai_generated",
    text: contentType === "thread" || contentType === "campaign_sequence" ? "" : output.text,
    threadItems: splitGeneratedOutputText(output, contentType),
    timezone: "UTC",
  };
}

function draftInputFromIdea(idea: ContentIdeaRow, requestedType: null | PublishingContentType): PublishingDraftCreateInput {
  return {
    campaignId: null,
    contentType: requestedType ?? "single_post",
    experimentId: null,
    mediaAssetIds: [],
    metadata: { source_title: idea.title },
    quotePostId: null,
    replyToPostId: null,
    sourceId: idea.id,
    sourceType: "content_idea",
    status: "draft",
    text: idea.raw_text,
    threadItems: [],
    timezone: "UTC",
  };
}

function draftInputFromBlog(blog: BlogPostRow, requestedType: null | PublishingContentType): PublishingDraftCreateInput {
  const summary = blog.canonical_summary ?? blog.excerpt ?? stripMarkdown(blog.markdown);
  const threadItems = [clampPostText(blog.title), clampPostText(summary)].filter(Boolean);

  return {
    campaignId: blog.campaign_id,
    contentType: requestedType ?? "blog_to_x_thread",
    experimentId: blog.experiment_id,
    mediaAssetIds: [],
    metadata: { source_title: blog.title, source_type: "blog_post" },
    quotePostId: null,
    replyToPostId: null,
    sourceId: blog.id,
    sourceType: "blog_post",
    status: "owner_edited",
    text: "",
    threadItems,
    timezone: "UTC",
  };
}

function draftInputFromPost(post: PostRow, requestedType: null | PublishingContentType): PublishingDraftCreateInput {
  return {
    campaignId: null,
    contentType: requestedType ?? "single_post",
    experimentId: null,
    mediaAssetIds: [],
    metadata: { source_platform_post_id: post.platform_post_id, source_url: post.url },
    quotePostId: null,
    replyToPostId: null,
    sourceId: post.id,
    sourceType: "post",
    status: "owner_edited",
    text: post.text,
    threadItems: [],
    timezone: "UTC",
  };
}

export async function createPublishingDraftFromSource(admin: AdminContext, input: PublishingDraftFromSourceServiceInput) {
  const requestedContentType = input.contentType ?? null;

  if (input.sourceType === "generated_output") {
    return createPublishingDraft(admin, draftInputFromGeneratedOutput(await loadGeneratedOutputSource(admin, input.sourceId), requestedContentType));
  }

  if (input.sourceType === "content_idea") {
    return createPublishingDraft(admin, draftInputFromIdea(await loadContentIdeaSource(admin, input.sourceId), requestedContentType));
  }

  if (input.sourceType === "blog_post") {
    return createPublishingDraft(admin, draftInputFromBlog(await loadBlogPostSource(admin, input.sourceId), requestedContentType));
  }

  return createPublishingDraft(admin, draftInputFromPost(await loadPostSource(admin, input.sourceId), requestedContentType));
}

async function loadDraft(admin: AdminContext, id: string) {
  const { data, error } = await admin.supabase
    .from("publishing_drafts")
    .select("*")
    .eq("id", id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    throw new PublishingNotFoundError("Publishing draft", `Publishing draft not found: ${error?.message ?? "missing row"}`);
  }

  return rowToDraft(data);
}

function updatePayloadForDraft(input: PublishingDraftUpdateInput, current: PublishingDraft) {
  const payload: PublishingDraftUpdatePayload = {};
  let contentChanged = false;

  // SCA-471 (C-1): use `||=` everywhere so later per-field branches cannot
  // silently reset an earlier change to false. The previous `=` form let an
  // update with mediaAssetIds (→ true) followed by text equal to current
  // (→ false) skip approval invalidation while still shipping the new media.
  if (input.campaignId !== undefined) payload.campaign_id = input.campaignId;
  if (input.contentType !== undefined) {
    payload.content_type = input.contentType;
    contentChanged ||= input.contentType !== current.contentType;
  }
  if (input.experimentId !== undefined) payload.experiment_id = input.experimentId;
  if (input.mediaAssetIds !== undefined) {
    payload.media_asset_ids = input.mediaAssetIds;
    contentChanged ||= true;
  }
  if (input.metadata !== undefined) payload.metadata = metadataWithPhase(input.metadata);
  if (input.quotePostId !== undefined) {
    payload.quote_post_id = input.quotePostId;
    contentChanged ||= true;
  }
  if (input.replyToPostId !== undefined) {
    payload.reply_to_post_id = input.replyToPostId;
    contentChanged ||= true;
  }
  if (input.text !== undefined) {
    payload.text = input.text;
    contentChanged ||= input.text !== current.text;
  }
  if (input.threadItems !== undefined) {
    payload.thread_items = input.threadItems;
    contentChanged ||= true;
  }
  if (input.timezone !== undefined) payload.timezone = input.timezone;

  if (contentChanged) {
    payload.approval_payload_hash = null;
    payload.approval_status = current.approvalStatus === "approved" ? "invalidated" : current.approvalStatus;
    payload.approved_at = null;
    payload.approved_by = null;
    payload.status = input.status ?? "owner_edited";
  } else if (input.status !== undefined) {
    payload.status = input.status;
  }

  return { contentChanged, payload };
}

export async function updatePublishingDraft(admin: AdminContext, input: PublishingDraftUpdateInput) {
  const current = await loadDraft(admin, input.id);
  const { contentChanged, payload } = updatePayloadForDraft(input, current);

  if (Object.keys(payload).length === 0) {
    throw new Error("No publishing draft fields supplied for update.");
  }

  if (contentChanged) {
    const candidate = { ...current, ...rowToDraft({ ...currentRowFromDraft(current), ...payload } as PublishingDraftRow) };
    const checks = await runDraftGuardrails(admin, candidate, current.id);
    payload.duplicate_check = checks.duplicateCheck;
    payload.similarity_check = checks.similarityCheck;
    payload.risk_check = checks.riskCheck;
  }

  const { data, error } = await admin.supabase
    .from("publishing_drafts")
    .update(payload)
    .eq("id", input.id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update publishing draft: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: contentChanged ? "publishing_draft_payload_changed" : "publishing_draft_updated",
    metadata: {
      changed_fields: Object.keys(payload),
      phase: PHASE,
      approval_invalidated: contentChanged && current.approvalStatus === "approved",
    },
    success: true,
    targetId: data.id,
    targetType: "publishing_draft",
    userId: admin.userId,
  });

  return rowToDraft(data);
}

function currentRowFromDraft(draft: PublishingDraft): Partial<PublishingDraftRow> {
  return {
    approval_payload_hash: draft.approvalPayloadHash,
    approval_status: draft.approvalStatus,
    approved_at: draft.approvedAt,
    approved_by: null,
    campaign_id: draft.campaignId,
    content_type: draft.contentType,
    created_at: draft.createdAt,
    deleted_at: null,
    duplicate_check: draft.duplicateCheck,
    experiment_id: draft.experimentId,
    id: draft.id,
    media_asset_ids: draft.mediaAssetIds,
    metadata: draft.metadata,
    quote_post_id: draft.quotePostId,
    reply_to_post_id: draft.replyToPostId,
    risk_check: draft.riskCheck,
    scheduled_at: draft.scheduledAt,
    similarity_check: draft.similarityCheck,
    source_content_idea_id: null,
    source_generated_output_id: null,
    source_id: draft.sourceId,
    source_post_id: null,
    source_type: draft.sourceType,
    status: draft.status,
    text: draft.text,
    thread_items: draft.threadItems,
    timezone: draft.timezone,
    updated_at: draft.updatedAt,
    user_id: "",
  };
}

function guardrailBlocksApproval(checks: { duplicateCheck: Record<string, Json>; riskCheck: Record<string, Json>; similarityCheck: Record<string, Json> }, overrideReason: null | string) {
  const duplicateStatus = checks.duplicateCheck.status;
  const similarityStatus = checks.similarityCheck.status;
  const riskBlocking = checks.riskCheck.blocking === true;

  if (!overrideReason && (duplicateStatus === "duplicate" || similarityStatus === "high_similarity" || riskBlocking)) {
    return true;
  }

  return false;
}

export async function approvePublishingDraft(admin: AdminContext, input: PublishingDraftApprovalServiceInput) {
  const draft = await loadDraft(admin, input.id);

  // SCA-475 (C-5): typed XPublishingGuardError so the API envelope can return
  // 409 with a structured code instead of falling through to the 500 path or
  // matching message substrings.
  if (["archived", "canceled", "published", "publishing"].includes(draft.status)) {
    throw new XPublishingGuardError("status_conflict", `Publishing draft in ${draft.status} status cannot be approved.`);
  }

  const checks = await runDraftGuardrails(admin, draft, draft.id);

  const overrideReason = input.duplicateOverrideReason ?? null;

  if (guardrailBlocksApproval(checks, overrideReason)) {
    throw new XPublishingGuardError("status_conflict", "Publishing draft requires an explicit owner override before approval.");
  }

  const connection = await loadXConnectionStatus(admin);
  const payloadHash = computePublishingPayloadHash(draft, connection);

  if (input.payloadHash && input.payloadHash !== payloadHash) {
    throw new XPublishingGuardError("payload_mismatch", "Approval payload hash does not match the current draft payload.");
  }

  const approvedAt = nowIso();
  const { data, error } = await admin.supabase
    .from("publishing_drafts")
    .update({
      approval_payload_hash: payloadHash,
      approval_status: "approved",
      approved_at: approvedAt,
      approved_by: admin.userId,
      duplicate_check: checks.duplicateCheck,
      metadata: metadataWithPhase({ ...draft.metadata, duplicate_override_reason: overrideReason }),
      risk_check: checks.riskCheck,
      similarity_check: checks.similarityCheck,
      status: "approved",
    })
    .eq("id", draft.id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to approve publishing draft: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "publishing_draft_approved",
    metadata: {
      duplicate_status: checks.duplicateCheck.status,
      payload_hash: payloadHash,
      preview_account_x_user_id: connection?.xUserId ?? null,
      preview_account_username: connection?.username ?? null,
      phase: PHASE,
      risk_blocking: Boolean(checks.riskCheck.blocking),
      similarity_status: checks.similarityCheck.status,
    },
    success: true,
    targetId: data.id,
    targetType: "publishing_draft",
    userId: admin.userId,
  });

  return rowToDraft(data);
}

function assertApprovalPayload(draft: PublishingDraft, suppliedHash?: null | string, connection?: null | SanitizedXConnection) {
  if (draft.approvalStatus !== "approved" || !draft.approvalPayloadHash || !draft.approvedAt) {
    throw new XPublishingGuardError("approval_required", "Publishing draft must be approved before this transition.");
  }

  const currentHash = computePublishingPayloadHash(draft, connection);
  if (currentHash !== draft.approvalPayloadHash) {
    throw new XPublishingGuardError("payload_mismatch", "Approved payload hash is stale. Re-approval is required.");
  }

  if (suppliedHash && suppliedHash !== draft.approvalPayloadHash) {
    throw new XPublishingGuardError("payload_mismatch", "Supplied payload hash does not match the approved payload.");
  }
}

export async function scheduleApprovedDraft(admin: AdminContext, input: PublishingDraftScheduleInput) {
  const draft = await loadDraft(admin, input.id);

  if (draft.status !== "approved") {
    // SCA-475 (C-5): typed guard so the schedule route surfaces 409, not 500.
    throw new XPublishingGuardError("approval_required", "Publishing draft must be approved before scheduling.");
  }

  const connection = await loadXConnectionStatus(admin);
  assertApprovalPayload(draft, null, connection);

  const { data: calendarItem, error: calendarError } = await admin.supabase
    .from("content_calendar_items")
    .insert({
      entity_id: draft.id,
      entity_type: "publishing_draft",
      item_type: "publishing",
      metadata: metadataWithPhase({ content_type: draft.contentType, dry_run_only: true }),
      starts_at: input.scheduledFor,
      status: "scheduled",
      timezone: input.timezone,
      title: `${draft.contentType} draft`,
      user_id: admin.userId,
    })
    .select()
    .single();

  if (calendarError || !calendarItem) {
    throw new Error(`Failed to create publishing calendar item: ${calendarError?.message ?? "missing row"}`);
  }

  const cleanupCalendarItem = async () => {
    await admin.supabase.from("content_calendar_items").delete().eq("id", calendarItem.id).eq("user_id", admin.userId);
  };

  const { data: scheduledPost, error: scheduleError } = await admin.supabase
    .from("scheduled_posts")
    .insert({
      calendar_item_id: calendarItem.id,
      metadata: metadataWithPhase({ approval_payload_hash: draft.approvalPayloadHash, dry_run_only: true }),
      publishing_draft_id: draft.id,
      scheduled_for: input.scheduledFor,
      status: "scheduled",
      timezone: input.timezone,
      user_id: admin.userId,
    })
    .select()
    .single();

  if (scheduleError || !scheduledPost) {
    await cleanupCalendarItem();
    throw new Error(`Failed to schedule publishing draft: ${scheduleError?.message ?? "missing row"}`);
  }

  const cleanupScheduledPost = async () => {
    await admin.supabase.from("scheduled_posts").delete().eq("id", scheduledPost.id).eq("user_id", admin.userId);
    await cleanupCalendarItem();
  };

  const { data: updatedDraft, error: draftError } = await admin.supabase
    .from("publishing_drafts")
    .update({ scheduled_at: input.scheduledFor, status: "scheduled", timezone: input.timezone })
    .eq("id", draft.id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .select()
    .single();

  if (draftError || !updatedDraft) {
    await cleanupScheduledPost();
    throw new Error(`Failed to mark publishing draft scheduled: ${draftError?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "publishing_scheduled",
    metadata: {
      calendar_item_id: calendarItem.id,
      phase: PHASE,
      scheduled_for: input.scheduledFor,
      timezone: input.timezone,
    },
    success: true,
    targetId: draft.id,
    targetType: "publishing_draft",
    userId: admin.userId,
  });

  return { draft: rowToDraft(updatedDraft), scheduledPost: rowToScheduledPost(scheduledPost) };
}

function dryRunShouldFail(draft: PublishingDraft) {
  return textForDraft(draft).toLowerCase().includes(DRY_RUN_FAILURE_MARKER);
}

function dryRunIdempotencyKey(draft: PublishingDraft, payloadHash: string, jobType: "dry_run" | "retry") {
  // Append a per-attempt UUID so repeated dry runs of the same approved payload
  // do not collide with the unique idempotency_key constraint on
  // publishing_jobs. The deterministic prefix preserves observability across
  // retries without trapping the second invocation in a duplicate-key error.
  return `${jobType}:${draft.id}:${payloadHash}:${hashString(textForDraft(draft)).slice(0, 12)}:${randomUUID()}`;
}

async function insertPublishingFailure(admin: AdminContext, job: PublishingJobRow, draft: PublishingDraft, message: string) {
  const { data, error } = await admin.supabase
    .from("publishing_failures")
    .insert({
      failure_type: "dry_run_simulated_failure",
      metadata: metadataWithPhase({ dry_run_only: true }),
      provider_error_code: "dry_run_simulated_failure",
      publishing_draft_id: draft.id,
      publishing_job_id: job.id,
      raw_error_redacted: { dry_run: true, external_call: false, marker: DRY_RUN_FAILURE_MARKER },
      retry_after: null,
      retryable: true,
      sanitized_message: message,
      user_id: admin.userId,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to record publishing failure: ${error?.message ?? "missing row"}`);
  }

  // A failing dry run is intentionally non-destructive: the draft stays in
  // `approved` so the owner can fix the issue and rerun without re-approving.
  // Only live publish failures flip the draft to `failed` (handled via
  // `markDraftAndSchedule` in `runXPublishingJob`).

  await logAuditEvent({
    actorEmail: admin.email,
    error: message,
    eventType: "publishing_failure",
    metadata: { failure_type: "dry_run_simulated_failure", job_id: job.id, phase: PHASE, retryable: true },
    success: false,
    targetId: draft.id,
    targetType: "publishing_draft",
    userId: admin.userId,
  });

  return rowToFailure(data);
}

export async function runDryRunPublishingJob(admin: AdminContext, input: PublishingDraftDryRunServiceInput, options: { jobType?: "dry_run" | "retry" } = {}) {
  const draft = await loadDraft(admin, input.id);
  const connection = await loadXConnectionStatus(admin);
  assertApprovalPayload(draft, input.payloadHash ?? null, connection);

  const payloadHash = draft.approvalPayloadHash;
  if (!payloadHash) throw new XPublishingGuardError("approval_required", "Approved payload hash is missing.");

  const startedAt = nowIso();
  const failed = dryRunShouldFail(draft);
  const payloadPreview = buildPublishingPayloadPreview(draft, connection);
  const responsePayload = {
    deterministic_id: hashString(`${draft.id}:${payloadHash}`).slice(0, 24),
    dry_run: true,
    external_call: false,
    outcome: failed ? "simulated_failure" : "would_publish",
  } satisfies Record<string, Json>;
  const jobType = options.jobType ?? "dry_run";
  const { data: jobRow, error: jobError } = await admin.supabase
    .from("publishing_jobs")
    .insert({
      attempt_count: 1,
      completed_at: startedAt,
      error: failed ? "Dry run failed before external write." : null,
      error_code: failed ? "dry_run_simulated_failure" : null,
      idempotency_key: dryRunIdempotencyKey(draft, payloadHash, jobType),
      job_type: jobType,
      metadata: metadataWithPhase({ dry_run_only: true, payload_hash: payloadHash, source_job: input.id }),
      publishing_draft_id: draft.id,
      scheduled_for: draft.scheduledAt,
      started_at: startedAt,
      status: failed ? "failed" : "succeeded",
      user_id: admin.userId,
      x_request_payload: payloadPreview,
      x_response_payload: responsePayload,
    })
    .select()
    .single();

  if (jobError || !jobRow) {
    throw new Error(`Failed to create dry-run publishing job: ${jobError?.message ?? "missing row"}`);
  }

  let failure: null | PublishingFailure = null;
  if (failed) {
    try {
      failure = await insertPublishingFailure(admin, jobRow, draft, "Dry run failed before external write.");
    } catch (failureError) {
      // SCA-483 (W-4): without cleanup, the publishing_jobs row sits in status
      // 'failed' with no matching publishing_failures row. retryPublishingJob
      // then throws "Publishing failure not found for retry" and the draft is
      // unrecoverable via UI. Compensate by deleting the orphan job row before
      // surfacing the original error.
      const cleanup = await admin.supabase.from("publishing_jobs").delete().eq("id", jobRow.id).eq("user_id", admin.userId);
      if (cleanup.error) {
        console.error("runDryRunPublishingJob: failed to compensate orphan job row", { jobId: jobRow.id, reason: cleanup.error.message });
      }
      throw failureError;
    }
  } else {
    await logAuditEvent({
      actorEmail: admin.email,
      eventType: "publishing_dry_run_succeeded",
      metadata: { job_id: jobRow.id, payload_hash: payloadHash, phase: PHASE },
      success: true,
      targetId: draft.id,
      targetType: "publishing_draft",
      userId: admin.userId,
    });
  }

  return { failure, job: rowToJob(jobRow), payload: payloadPreview };
}

export type XPublishingMode = "dry_run" | "live";

export type XPublishingJobResult = {
  failure: null | PublishingFailure;
  job: PublishingJob;
  mode: XPublishingMode;
  payload: Record<string, Json>;
  publishedPost: null | PublishedPost;
};

type XPublishingJobOptions = {
  client?: XPublishingClient;
  connection?: DecryptedXConnection;
  expectedContentTypes?: string[];
  jobType?: "publish" | "retry";
  mode?: XPublishingMode;
  now?: () => Date;
  // C-1: when retrying a failed job, the caller MUST pass the prior failed job's id
  // so the idempotency key is deterministic and two concurrent retries collide on the
  // publishing_jobs unique index instead of each issuing a real X publish.
  priorFailedJobId?: null | string;
  request?: { headers: Headers; url?: string } | null;
  scheduledPostId?: null | string;
  serviceClient?: ReturnType<typeof createSupabaseServiceRoleClient>;
};

type XPublishFailureDetails = {
  failureType: string;
  message: string;
  providerErrorCode: null | string;
  rawErrorRedacted: Record<string, Json>;
  retryAfter: null | string;
  retryable: boolean;
};

// Exported so app/api/publishing/_utils.ts can classify errors structurally
// instead of substring-matching on `error.message` (L-2).
export class XPublishingGuardError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly retryAfter: null | string = null,
  ) {
    super(message);
    this.name = "XPublishingGuardError";
  }
}

// SCA-475 (C-5): typed sentinel for "publishing draft / source not found" so
// the publishing/_utils.ts and x/publish/_utils.ts response helpers can map
// to 404 via instanceof rather than substring-matching on error.message.
export class PublishingNotFoundError extends Error {
  constructor(readonly entity: string, message?: string) {
    super(message ?? `${entity} not found.`);
    this.name = "PublishingNotFoundError";
  }
}

class XThreadPartialFailure extends Error {
  constructor(
    readonly causeError: unknown,
    readonly createdPosts: XCreatedPost[],
  ) {
    super(causeError instanceof Error ? causeError.message : "Thread publishing partially failed.");
    this.name = "XThreadPartialFailure";
  }
}

function publishNowIso(options: XPublishingJobOptions) {
  return (options.now?.() ?? new Date()).toISOString();
}

function isThreadPublishingType(contentType: string) {
  return ["blog_to_x_series", "blog_to_x_thread", "campaign_sequence", "thread"].includes(contentType);
}

function publishableItems(draft: PublishingDraft) {
  if (isThreadPublishingType(draft.contentType)) {
    return draft.threadItems.length > 0 ? draft.threadItems : draft.text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  }

  return [draft.text].filter((item) => item.trim().length > 0);
}

// Aligns with the schema-side confirmation pattern in
// lib/publishing/validation.ts and lib/x/validation.ts: the value must START
// WITH "confirm" or "approve" followed by a word boundary, after trim+lowercase.
const liveConfirmationPattern = /^(?:confirm|approve)\b/;
function assertLivePublishConfirmation(input: PublishingDraftDryRunServiceInput, options: XPublishingJobOptions) {
  if (options.scheduledPostId || options.jobType === "retry") return;

  const confirmation = input.confirmation?.trim().toLowerCase() ?? "";
  if (!liveConfirmationPattern.test(confirmation)) {
    throw new XPublishingGuardError("confirmation_required", "Explicit owner confirmation is required before live X publishing.");
  }
}

function xPostUrl(username: null | string, platformPostId: string) {
  return username ? `https://x.com/${username}/status/${platformPostId}` : `https://x.com/i/web/status/${platformPostId}`;
}

function liveIdempotencyKey(
  draft: PublishingDraft,
  payloadHash: string,
  jobType: "publish" | "retry",
  options: { priorFailedJobId?: null | string; scheduledPostId?: null | string } = {},
) {
  // C-1: deterministic for the cases where two callers must collide on the
  // publishing_jobs unique index.
  const base = `${jobType}:${draft.id}:${payloadHash}:${hashString(textForDraft(draft)).slice(0, 12)}:${options.scheduledPostId ?? "immediate"}`;

  if (jobType === "retry") {
    // Two concurrent retries of the same prior_failed_job_id MUST collide.
    // If a caller forgot to pass priorFailedJobId, fail closed by hashing the
    // current second window instead of randomising; that still provides some
    // collision pressure but mostly forces callers to wire the id through.
    const retryScope = options.priorFailedJobId ?? `unbound-job-${Math.floor(Date.now() / 1_000)}`;
    return `${base}:retry-of:${retryScope}`;
  }

  if (options.scheduledPostId) {
    // Scheduled re-runs after deferral need a fresh key (the prior cron tick's
    // job is still in publishing_jobs with its own unique key). Concurrency is
    // already prevented by scheduled_posts.lock_token, so a UUID here is safe;
    // the partial unique index on published_posts(publishing_draft_id) provides
    // defense-in-depth if anything slips through.
    return `${base}:run-${randomUUID()}`;
  }

  return base;
}

function xRequestPayloadForDraft(draft: PublishingDraft, connection: null | SanitizedXConnection, mediaIds: string[] = []) {
  const items = publishableItems(draft);
  // For thread previews we cannot know the previous post id ahead of publish,
  // so the audit/preview payload uses the literal `in_reply_to_tweet_id` field
  // name with the placeholder `<previous_thread_post>`. At publish time the
  // adapter (createPostPayload) substitutes the actual id of the just-created
  // prior thread item. Using the same field name as the X API call keeps the
  // preview shape consistent with what is actually sent.
  const payloads = isThreadPublishingType(draft.contentType)
    ? items.map((text, index) => ({
        media: index === 0 && mediaIds.length > 0 ? { media_ids: mediaIds } : undefined,
        reply: index === 0 ? null : { in_reply_to_tweet_id: "<previous_thread_post>" },
        text,
      }))
    : [
        {
          media: mediaIds.length > 0 ? { media_ids: mediaIds } : undefined,
          quote_tweet_id: draft.contentType === "quote_post" ? draft.quotePostId : undefined,
          reply: draft.contentType === "reply" && draft.replyToPostId ? { in_reply_to_tweet_id: draft.replyToPostId } : undefined,
          text: draft.text,
        },
      ];

  return {
    ...buildPublishingPayloadPreview(draft, connection),
    payloads: payloads as unknown as Json,
  } satisfies Record<string, Json>;
}

function assertXPublishingCapabilities(draft: PublishingDraft, connection: DecryptedXConnection) {
  if (connection.status !== "connected" && connection.status !== "degraded") {
    throw new XPublishingGuardError("x_connection_unavailable", "X connection is not available for publishing.");
  }

  if (!connection.capabilities.can_write_posts) {
    throw new XPublishingGuardError("missing_scope", "X connection is missing tweet.write scope.");
  }

  if (draft.contentType === "reply" && !connection.capabilities.can_write_replies) {
    throw new XPublishingGuardError("capability_disabled", "X reply publishing is not enabled for this connection.");
  }

  if (draft.contentType === "quote_post" && !connection.capabilities.can_write_quotes) {
    throw new XPublishingGuardError("capability_disabled", "X quote publishing requires the Enterprise quote-post capability flag.");
  }

  if (draft.mediaAssetIds.length > 0 && !connection.capabilities.can_upload_media) {
    throw new XPublishingGuardError("missing_scope", "X media publishing requires media.write scope.");
  }
}

async function loadXPublishingConnection(admin: AdminContext, options: XPublishingJobOptions) {
  if (options.connection) return options.connection;

  const serviceClient = options.serviceClient ?? createSupabaseServiceRoleClient();
  let connection = await loadDecryptedXConnection(admin, { client: serviceClient });

  if (shouldRefreshXToken(connection.tokenExpiresAt)) {
    connection = await refreshStoredXConnection(admin, connection, { client: serviceClient });
  }

  return connection;
}

async function loadMediaAssets(admin: AdminContext, draft: PublishingDraft) {
  if (draft.mediaAssetIds.length === 0) return [];

  const { data, error } = await admin.supabase
    .from("media_assets")
    .select("*")
    .eq("user_id", admin.userId)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Failed to load media assets: ${error.message}`);
  }

  const wanted = new Set(draft.mediaAssetIds);
  const rows = ((data ?? []) as MediaAssetRow[]).filter((row) => wanted.has(row.id));

  if (rows.length !== wanted.size) {
    throw new XPublishingGuardError("media_asset_missing", "One or more media assets are missing.");
  }

  return rows;
}

function mediaCategoryForAsset(asset: MediaAssetRow): XMediaUploadInput["mediaCategory"] {
  if (asset.mime_type.startsWith("video/")) return "tweet_video";
  if (asset.mime_type === "image/gif") return "tweet_gif";
  return "tweet_image";
}

async function resolveMediaIds(admin: AdminContext, draft: PublishingDraft, client: XPublishingClient, connection: DecryptedXConnection) {
  const assets = await loadMediaAssets(admin, draft);
  const mediaIds: string[] = [];

  for (const asset of assets) {
    if (asset.x_media_id) {
      mediaIds.push(asset.x_media_id);
      continue;
    }

    const metadata = safeObject(asset.metadata);
    const media = typeof metadata.media_base64 === "string" ? metadata.media_base64 : null;

    if (!media || !connection.capabilities.can_upload_media) {
      throw new XPublishingGuardError("media_upload_not_configured", "Media upload is not configured for this asset. Upload it first or remove it from the draft.");
    }

    const uploaded = await client.uploadMedia({
      media,
      mediaCategory: mediaCategoryForAsset(asset),
      mediaType: asset.mime_type,
    });

    await admin.supabase
      .from("media_assets")
      .update({
        metadata: metadataWithPhase({ ...metadata, x_uploaded_at: publishNowIso({}) }),
        x_media_id: uploaded.id,
        x_upload_status: "uploaded",
      })
      .eq("id", asset.id)
      .eq("user_id", admin.userId);

    mediaIds.push(uploaded.id);
  }

  return mediaIds;
}

function createPostPayload(draft: PublishingDraft, text: string, options: { mediaIds?: string[]; replyToPostId?: null | string } = {}): XCreatePostPayload {
  const payload: XCreatePostPayload = { text };

  if (options.mediaIds && options.mediaIds.length > 0) {
    payload.media = { media_ids: options.mediaIds };
  }

  if (options.replyToPostId) {
    payload.reply = { in_reply_to_tweet_id: options.replyToPostId };
  }

  if (draft.contentType === "reply" && draft.replyToPostId) {
    payload.reply = { in_reply_to_tweet_id: draft.replyToPostId };
  }

  if (draft.contentType === "quote_post" && draft.quotePostId) {
    payload.quote_tweet_id = draft.quotePostId;
  }

  return payload;
}

async function publishDraftToX(draft: PublishingDraft, client: XPublishingClient, mediaIds: string[]) {
  const items = publishableItems(draft);

  if (items.length === 0) {
    throw new XPublishingGuardError("validation_error", "Publishing draft has no publishable content.");
  }

  if (isThreadPublishingType(draft.contentType)) {
    const published: XCreatedPost[] = [];

    for (const [index, item] of items.entries()) {
      const previousPostId = published.at(-1)?.id ?? null;
      const payload = createPostPayload(draft, item, {
        mediaIds: index === 0 ? mediaIds : [],
        replyToPostId: previousPostId,
      });
      try {
        published.push(await client.createPost(payload));
      } catch (error) {
        throw new XThreadPartialFailure(error, published);
      }
    }

    return published;
  }

  return [await client.createPost(createPostPayload(draft, items[0] ?? draft.text, { mediaIds }))];
}

async function createLivePublishingJob(admin: AdminContext, draft: PublishingDraft, payload: Record<string, Json>, payloadHash: string, options: XPublishingJobOptions) {
  const startedAt = publishNowIso(options);
  const jobType = options.jobType ?? "publish";
  const { data, error } = await admin.supabase
    .from("publishing_jobs")
    .insert({
      attempt_count: 1,
      idempotency_key: liveIdempotencyKey(draft, payloadHash, jobType, {
        priorFailedJobId: options.priorFailedJobId ?? null,
        scheduledPostId: options.scheduledPostId ?? null,
      }),
      job_type: jobType,
      metadata: metadataWithPhase({ phase: PHASE_17, payload_hash: payloadHash, prior_failed_job_id: options.priorFailedJobId ?? null, scheduled_post_id: options.scheduledPostId ?? null }),
      publishing_draft_id: draft.id,
      scheduled_for: draft.scheduledAt,
      started_at: startedAt,
      status: "running",
      user_id: admin.userId,
      x_request_payload: payload,
      x_response_payload: {},
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create X publishing job: ${error?.message ?? "missing row"}`);
  }
  // Note: draft.status was already CAS'd to 'publishing' in runXPublishingJob.

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "x_publish_requested",
    metadata: {
      content_type: draft.contentType,
      job_id: data.id,
      payload_hash: payloadHash,
      phase: PHASE_17,
      scheduled_post_id: options.scheduledPostId ?? null,
    },
    request: options.request ?? undefined,
    success: true,
    targetId: draft.id,
    targetType: "publishing_draft",
    userId: admin.userId,
  });

  return data;
}

async function updatePublishingJob(admin: AdminContext, job: PublishingJobRow, payload: Database["public"]["Tables"]["publishing_jobs"]["Update"]) {
  const { data, error } = await admin.supabase
    .from("publishing_jobs")
    .update(payload)
    .eq("id", job.id)
    .eq("user_id", admin.userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update X publishing job: ${error?.message ?? "missing row"}`);
  }

  return data;
}

function zeroMetrics() {
  return {
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
}

async function insertPublishedArchivePost(admin: AdminContext, draft: PublishingDraft, connection: DecryptedXConnection, created: XCreatedPost, index: number) {
  const timestamp = publishNowIso({});
  const { data, error } = await admin.supabase
    .from("posts")
    .insert({
      ...zeroMetrics(),
      author_display_name: connection.displayName,
      author_username: connection.username,
      created_at_platform: timestamp,
      engagement_rate: null,
      format: draft.contentType,
      has_link: /https?:\/\//i.test(created.text),
      has_media: draft.mediaAssetIds.length > 0 && index === 0,
      hook_type: null,
      imported_at: timestamp,
      is_owner_post: true,
      media_metadata: { media_asset_ids: draft.mediaAssetIds },
      metadata: {
        phase: PHASE_17,
        publishing_draft_id: draft.id,
        thread_index: index,
      } satisfies Record<string, Json>,
      platform: "x",
      platform_post_id: created.id,
      quality_score: null,
      raw_api_payload: created.raw as Json,
      source: "x_api_publish",
      text: created.text,
      tone: null,
      topic: null,
      url: xPostUrl(connection.username, created.id),
      user_id: admin.userId,
      virality_score: null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to archive published X post: ${error?.message ?? "missing row"}`);
  }

  await admin.supabase.from("post_metric_snapshots").insert({
    ...zeroMetrics(),
    engagement_rate: null,
    heuristic_score: null,
    metadata: { phase: PHASE_17 },
    post_id: data.id,
    quality_score: null,
    raw_api_payload: created.raw as Json,
    score_metadata: { source: "x_api_publish" },
    snapshot_at: timestamp,
    source: "x_api_publish",
    user_id: admin.userId,
    virality_score: null,
  });

  return data as PostRow;
}

async function insertPublishedPost(admin: AdminContext, draft: PublishingDraft, job: PublishingJobRow, connection: DecryptedXConnection, createdPosts: XCreatedPost[], payloadHash: string, partial: boolean) {
  if (createdPosts.length === 0) return null;

  const archivedPosts = [];
  for (const [index, created] of createdPosts.entries()) {
    archivedPosts.push(await insertPublishedArchivePost(admin, draft, connection, created, index));
  }

  const root = createdPosts[0]!;
  const { data, error } = await admin.supabase
    .from("published_posts")
    .insert({
      content_type: draft.contentType,
      metadata: {
        partial,
        payload_hash: payloadHash,
        phase: PHASE_17,
      } satisfies Record<string, Json>,
      platform: "x",
      platform_post_id: root.id,
      post_id: archivedPosts[0]?.id ?? null,
      published_at: publishNowIso({}),
      published_via: "api",
      publishing_draft_id: draft.id,
      publishing_job_id: job.id,
      quote_target_post_id: draft.quotePostId,
      raw_api_payload: { posts: createdPosts.map((post) => post.raw) } as Json,
      reply_target_post_id: draft.replyToPostId,
      thread_post_ids: createdPosts.map((post) => post.id),
      thread_root_post_id: isThreadPublishingType(draft.contentType) ? root.id : null,
      url: xPostUrl(connection.username, root.id),
      user_id: admin.userId,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to record published X post: ${error?.message ?? "missing row"}`);
  }

  return rowToPublishedPost(data as PublishedPostRow);
}

async function markDraftAndSchedule(admin: AdminContext, draft: PublishingDraft, status: "failed" | "published", scheduledPostId?: null | string) {
  // SCA-473 (C-3): always clear lock_token + locked_at on terminal transitions
  // so the row can be re-claimed if it's ever re-scheduled later. The asymmetry
  // with deferScheduledPublish (which already cleared the lock) used to leave
  // failed/published rows visually locked.
  //
  // SCA-482 (W-3): capture errors from each of the three sequential UPDATEs
  // instead of silently discarding them — a silent failure here can leave the
  // draft "publishing" with a successful X post already created, the worst
  // possible inconsistency.
  const calendarStatus = status === "published" ? "published" : "missed";
  const scheduledUpdate = { lock_token: null, locked_at: null, status } as const;

  const draftResult = await admin.supabase.from("publishing_drafts").update({ status }).eq("id", draft.id).eq("user_id", admin.userId);
  if (draftResult.error) {
    console.error("markDraftAndSchedule: publishing_drafts update failed", { draftId: draft.id, reason: draftResult.error.message, scheduledPostId, status });
    throw new Error(`Failed to finalize publishing_drafts.${status}: ${draftResult.error.message}`);
  }

  const scheduledQuery = admin.supabase.from("scheduled_posts").update(scheduledUpdate).eq("user_id", admin.userId);
  const scheduledResult = await (scheduledPostId
    ? scheduledQuery.eq("id", scheduledPostId)
    : scheduledQuery.eq("publishing_draft_id", draft.id));
  if (scheduledResult.error) {
    console.error("markDraftAndSchedule: scheduled_posts update failed", { draftId: draft.id, reason: scheduledResult.error.message, scheduledPostId, status });
    throw new Error(`Failed to finalize scheduled_posts.${status}: ${scheduledResult.error.message}`);
  }

  const calendarResult = await admin.supabase.from("content_calendar_items").update({ status: calendarStatus }).eq("entity_id", draft.id).eq("user_id", admin.userId);
  if (calendarResult.error) {
    console.error("markDraftAndSchedule: content_calendar_items update failed", { draftId: draft.id, reason: calendarResult.error.message, status: calendarStatus });
    throw new Error(`Failed to finalize content_calendar_items.${calendarStatus}: ${calendarResult.error.message}`);
  }
}

async function deferScheduledPublish(admin: AdminContext, draft: PublishingDraft, scheduledPostId: string, retryAfter: string, message: string) {
  // SCA-482 (W-3): each of the three sequential UPDATEs now captures + throws
  // on error so a silent partial failure cannot leave the row in mixed state
  // (e.g. publishing_drafts says scheduled but scheduled_posts still shows
  // publishing, blocking the next cron tick).
  const draftResult = await admin.supabase
    .from("publishing_drafts")
    .update({ scheduled_at: retryAfter, status: "scheduled" })
    .eq("id", draft.id)
    .eq("user_id", admin.userId);
  if (draftResult.error) {
    console.error("deferScheduledPublish: publishing_drafts update failed", { draftId: draft.id, reason: draftResult.error.message, scheduledPostId });
    throw new Error(`Failed to defer publishing_drafts: ${draftResult.error.message}`);
  }

  const scheduledResult = await admin.supabase
    .from("scheduled_posts")
    .update({
      lock_token: null,
      locked_at: null,
      metadata: metadataWithPhase({ deferred_message: message, deferred_reason: "rate_limited", phase: PHASE_17, retry_after: retryAfter }),
      scheduled_for: retryAfter,
      status: "scheduled",
    })
    .eq("id", scheduledPostId)
    .eq("user_id", admin.userId);
  if (scheduledResult.error) {
    console.error("deferScheduledPublish: scheduled_posts update failed", { reason: scheduledResult.error.message, scheduledPostId });
    throw new Error(`Failed to defer scheduled_posts: ${scheduledResult.error.message}`);
  }

  const calendarResult = await admin.supabase
    .from("content_calendar_items")
    .update({
      starts_at: retryAfter,
      status: "scheduled",
    })
    .eq("entity_id", draft.id)
    .eq("user_id", admin.userId);
  if (calendarResult.error) {
    console.error("deferScheduledPublish: content_calendar_items update failed", { draftId: draft.id, reason: calendarResult.error.message });
    throw new Error(`Failed to defer content_calendar_items: ${calendarResult.error.message}`);
  }
}

function failureDetailsForError(error: unknown, partialPosts: XCreatedPost[]): XPublishFailureDetails {
  if (error instanceof XThreadPartialFailure) {
    return failureDetailsForError(error.causeError, error.createdPosts);
  }

  if (partialPosts.length > 0) {
    return {
      failureType: "thread_partial_failure",
      message: error instanceof Error ? error.message.slice(0, 500) : "Thread publishing partially failed.",
      providerErrorCode: "thread_partial_failure",
      rawErrorRedacted: { partial_post_ids: partialPosts.map((post) => post.id) },
      retryAfter: null,
      retryable: false,
    };
  }

  if (error instanceof XPublishingGuardError) {
    return {
      failureType: error.code,
      message: error.message.slice(0, 500),
      providerErrorCode: error.code,
      rawErrorRedacted: { code: error.code },
      retryAfter: error.retryAfter,
      retryable: error.retryable,
    };
  }

  if (error instanceof XApiError) {
    return {
      failureType: error.details.code,
      message: error.message.slice(0, 500),
      providerErrorCode: error.details.code,
      rawErrorRedacted: { code: error.details.code, status: error.details.status },
      retryAfter: error.details.rateLimitResetAt ?? null,
      retryable: error.details.retryable,
    };
  }

  return {
    failureType: "x_api_error",
    message: error instanceof Error ? error.message.slice(0, 500) : "Unknown X publishing failure.",
    providerErrorCode: "x_api_error",
    rawErrorRedacted: {},
    retryAfter: null,
    retryable: false,
  };
}

async function insertXPublishingFailure(admin: AdminContext, job: PublishingJobRow, draft: PublishingDraft, details: XPublishFailureDetails) {
  const { data, error } = await admin.supabase
    .from("publishing_failures")
    .insert({
      failure_type: details.failureType,
      metadata: metadataWithPhase({ phase: PHASE_17 }),
      provider_error_code: details.providerErrorCode,
      publishing_draft_id: draft.id,
      publishing_job_id: job.id,
      raw_error_redacted: details.rawErrorRedacted,
      retry_after: details.retryAfter,
      retryable: details.retryable,
      sanitized_message: details.message,
      user_id: admin.userId,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to record X publishing failure: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    error: details.message,
    eventType: "x_publish_failed",
    metadata: {
      failure_type: details.failureType,
      job_id: job.id,
      phase: PHASE_17,
      retry_after: details.retryAfter,
      retryable: details.retryable,
    },
    success: false,
    targetId: draft.id,
    targetType: "publishing_draft",
    userId: admin.userId,
  });

  return rowToFailure(data);
}

export async function runXPublishingJob(admin: AdminContext, input: PublishingDraftDryRunServiceInput, options: XPublishingJobOptions = {}): Promise<XPublishingJobResult> {
  const mode = options.mode ?? "dry_run";

  // M-2: validate route content-type fit for BOTH modes so a thread draft
  // cannot exercise the /api/x/publish/post route in dry-run either.
  const earlyDraft = await loadDraft(admin, input.id);
  if (options.expectedContentTypes && !options.expectedContentTypes.includes(earlyDraft.contentType)) {
    throw new Error(`Publishing draft type ${earlyDraft.contentType} does not match this X publish route.`);
  }

  if (mode === "dry_run") {
    const result = await runDryRunPublishingJob(admin, input, { jobType: options.jobType === "retry" ? "retry" : "dry_run" });
    return {
      failure: result.failure,
      job: result.job,
      mode,
      payload: result.payload,
      publishedPost: null,
    };
  }

  const draft = earlyDraft;

  assertLivePublishConfirmation(input, options);
  const payloadHash = draft.approvalPayloadHash;
  if (draft.approvalStatus !== "approved" || !payloadHash || !draft.approvedAt) {
    throw new XPublishingGuardError("approval_required", "Publishing draft must be approved before live X publishing.");
  }

  // C-1: claim the draft atomically before any external work. Two concurrent
  // retries (or a retry that races with a deferred-scheduled rerun) collide
  // here so only one proceeds to publish. Combined with the deterministic
  // retry idempotency key and the partial unique index on
  // published_posts(publishing_draft_id), duplicates are blocked at three
  // independent layers.
  const allowedFromStates = options.jobType === "retry" ? ["failed"] : ["approved", "scheduled", "failed"];
  const { data: claimed, error: claimError } = await admin.supabase
    .from("publishing_drafts")
    .update({ status: "publishing" })
    .eq("id", draft.id)
    .eq("user_id", admin.userId)
    .in("status", allowedFromStates)
    .select("id")
    .maybeSingle();

  if (claimError) {
    throw new Error(`Failed to claim publishing draft: ${claimError.message}`);
  }
  if (!claimed) {
    throw new XPublishingGuardError("status_conflict", "Publishing draft is not in a publishable state. Refresh and try again.");
  }

  const connection = await loadXPublishingConnection(admin, options);
  const initialPayload = xRequestPayloadForDraft(draft, connection);
  const job = await createLivePublishingJob(admin, draft, initialPayload, payloadHash, options);
  let createdPosts: XCreatedPost[] = [];
  let publishedPost: null | PublishedPost = null;
  let requestPayload = initialPayload;

  const recordFailure = async (details: XPublishFailureDetails) => {
    const completedAt = publishNowIso(options);
    const updatedJob = await updatePublishingJob(admin, job, {
      completed_at: completedAt,
      error: details.message,
      error_code: details.failureType,
      rate_limit_reset_at: details.retryAfter,
      status: "failed",
      x_response_payload: {
        error: details.rawErrorRedacted,
        partial_post_ids: createdPosts.map((post) => post.id),
      } as Json,
    });

    if (options.scheduledPostId && details.retryable && details.retryAfter) {
      await deferScheduledPublish(admin, draft, options.scheduledPostId, details.retryAfter, details.message);
    } else {
      await markDraftAndSchedule(admin, draft, "failed", options.scheduledPostId);
    }

    const failure = await insertXPublishingFailure(admin, job, draft, details);

    return {
      failure,
      job: rowToJob(updatedJob),
      mode,
      payload: requestPayload,
      publishedPost,
    };
  };

  try {
    assertApprovalPayload(draft, input.payloadHash ?? null, connection);
    assertXPublishingCapabilities(draft, connection);
    const client = options.client ?? createLiveXPublishingClient(connection.accessToken);
    const mediaIds = await resolveMediaIds(admin, draft, client, connection);
    requestPayload = xRequestPayloadForDraft(draft, connection, mediaIds);
    await updatePublishingJob(admin, job, { x_request_payload: requestPayload });

    try {
      createdPosts = await publishDraftToX(draft, client, mediaIds);
    } catch (error) {
      if (error instanceof XThreadPartialFailure) {
        createdPosts = error.createdPosts;
      }

      if (createdPosts.length > 0) {
        try {
          publishedPost = await insertPublishedPost(admin, draft, job, connection, createdPosts, payloadHash, true);
        } catch (reconciliationError) {
          return recordFailure({
            failureType: "local_reconciliation_failed",
            message: reconciliationError instanceof Error ? reconciliationError.message.slice(0, 500) : "X publish succeeded partially, but local reconciliation failed.",
            providerErrorCode: "local_reconciliation_failed",
            rawErrorRedacted: { platform_post_ids: createdPosts.map((post) => post.id) },
            retryAfter: null,
            retryable: false,
          });
        }
      }

      return recordFailure(failureDetailsForError(error, createdPosts));
    }

    try {
      publishedPost = await insertPublishedPost(admin, draft, job, connection, createdPosts, payloadHash, false);
      const completedAt = publishNowIso(options);
      const updatedJob = await updatePublishingJob(admin, job, {
        completed_at: completedAt,
        rate_limit_reset_at: createdPosts.find((post) => post.rateLimitResetAt)?.rateLimitResetAt ?? null,
        status: "succeeded",
        x_response_payload: { posts: createdPosts.map((post) => post.raw) } as Json,
      });
      await markDraftAndSchedule(admin, draft, "published", options.scheduledPostId);
      await logAuditEvent({
        actorEmail: admin.email,
        eventType: "x_publish_succeeded",
        metadata: {
          job_id: updatedJob.id,
          payload_hash: payloadHash,
          phase: PHASE_17,
          platform_post_ids: createdPosts.map((post) => post.id),
        },
        request: options.request ?? undefined,
        success: true,
        targetId: draft.id,
        targetType: "publishing_draft",
        userId: admin.userId,
      });

      return {
        failure: null,
        job: rowToJob(updatedJob),
        mode,
        payload: requestPayload,
        publishedPost,
      };
    } catch (error) {
      return recordFailure({
        failureType: "local_reconciliation_failed",
        message: error instanceof Error ? error.message.slice(0, 500) : "X publish succeeded, but local reconciliation failed.",
        providerErrorCode: "local_reconciliation_failed",
        rawErrorRedacted: { platform_post_ids: createdPosts.map((post) => post.id) },
        retryAfter: null,
        retryable: false,
      });
    }
  } catch (error) {
    return recordFailure(failureDetailsForError(error, createdPosts));
  }
}

async function loadJob(admin: AdminContext, id: string) {
  const { data, error } = await admin.supabase
    .from("publishing_jobs")
    .select("*")
    .eq("id", id)
    .eq("user_id", admin.userId)
    .single();

  if (error || !data) {
    throw new Error(`Publishing job not found: ${error?.message ?? "missing row"}`);
  }

  return data;
}

export async function retryPublishingJob(admin: AdminContext, input: PublishingJobRetryInput) {
  const job = await loadJob(admin, input.id);

  if (job.status !== "failed") {
    throw new Error("Only failed publishing jobs can be retried.");
  }

  // H-2: also assert the draft is in a retryable state. Without this, a draft
  // that was already re-published by a racing call could be re-published a
  // second time even though the failed job row is unchanged.
  const draft = await loadDraft(admin, job.publishing_draft_id);
  if (job.job_type !== "dry_run" && draft.status !== "failed") {
    throw new Error(`Publishing draft is no longer retryable (status=${draft.status}). Re-approve to publish again.`);
  }

  const { data: failure, error: failureError } = await admin.supabase
    .from("publishing_failures")
    .select("*")
    .eq("publishing_job_id", job.id)
    .eq("user_id", admin.userId)
    .single();

  if (failureError || !failure) {
    throw new Error(`Publishing failure not found for retry: ${failureError?.message ?? "missing row"}`);
  }

  if (!failure.retryable) {
    throw new Error("Publishing failure is not retryable.");
  }

  if (failure.retry_after && new Date(failure.retry_after).getTime() > Date.now()) {
    throw new Error("Publishing failure retry window has not opened yet.");
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "publishing_retry",
    metadata: { failed_job_id: job.id, phase: PHASE },
    success: true,
    targetId: job.publishing_draft_id,
    targetType: "publishing_draft",
    userId: admin.userId,
  });

  if (job.job_type === "dry_run") {
    return runDryRunPublishingJob(admin, { confirmation: null, id: job.publishing_draft_id, payloadHash: null }, { jobType: "retry" });
  }

  // C-1: pass the prior failed job id so the idempotency key is deterministic
  // and a second concurrent retry click collides on the unique index.
  return runXPublishingJob(
    admin,
    { confirmation: null, id: job.publishing_draft_id, payloadHash: null },
    { jobType: "retry", mode: "live", priorFailedJobId: job.id },
  );
}

export async function cancelPublishingJob(admin: AdminContext, input: PublishingCancelInput) {
  const job = await loadJob(admin, input.id);

  if (!["queued", "running"].includes(job.status)) {
    throw new Error("Only queued or running publishing jobs can be canceled.");
  }

  const { data, error } = await admin.supabase
    .from("publishing_jobs")
    .update({ completed_at: nowIso(), error: input.reason, status: "canceled" })
    .eq("id", job.id)
    .eq("user_id", admin.userId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to cancel publishing job: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "publishing_canceled",
    metadata: { job_id: job.id, phase: PHASE, reason: input.reason },
    success: true,
    targetId: job.publishing_draft_id,
    targetType: "publishing_draft",
    userId: admin.userId,
  });

  return rowToJob(data);
}

export async function cancelPublishingDraft(admin: AdminContext, input: PublishingCancelInput) {
  const draft = await loadDraft(admin, input.id);
  const timestamp = nowIso();

  const { data, error } = await admin.supabase
    .from("publishing_drafts")
    .update({ approval_status: draft.approvalStatus === "approved" ? "revoked" : draft.approvalStatus, metadata: metadataWithPhase({ ...draft.metadata, cancel_reason: input.reason }), status: "canceled" })
    .eq("id", draft.id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to cancel publishing draft: ${error?.message ?? "missing row"}`);
  }

  // SCA-482 (W-3): capture + log secondary update errors. We don't throw here
  // because the primary publishing_drafts.canceled flip already landed — the
  // owner-visible state is correct. Log the scheduled_posts / calendar drift
  // so an operator can reconcile if it ever happens.
  const cancelScheduledResult = await admin.supabase
    .from("scheduled_posts")
    .update({ canceled_audit_log_id: null, lock_token: null, locked_at: null, metadata: metadataWithPhase({ canceled_at: timestamp, reason: input.reason }), status: "canceled" })
    .eq("publishing_draft_id", draft.id)
    .eq("user_id", admin.userId);
  if (cancelScheduledResult.error) {
    console.error("cancelPublishingDraft: scheduled_posts cancel failed", { draftId: draft.id, reason: cancelScheduledResult.error.message });
  }

  const cancelCalendarResult = await admin.supabase
    .from("content_calendar_items")
    .update({ metadata: metadataWithPhase({ canceled_at: timestamp, reason: input.reason }), status: "canceled" })
    .eq("entity_id", draft.id)
    .eq("user_id", admin.userId);
  if (cancelCalendarResult.error) {
    console.error("cancelPublishingDraft: content_calendar_items cancel failed", { draftId: draft.id, reason: cancelCalendarResult.error.message });
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "publishing_canceled",
    metadata: { phase: PHASE, reason: input.reason },
    success: true,
    targetId: draft.id,
    targetType: "publishing_draft",
    userId: admin.userId,
  });

  return rowToDraft(data);
}

export type ScheduledPublishingExecutorResult = {
  checkedAt: string;
  failed: number;
  processed: number;
  // SCA-473 (C-3): count of stranded `status=publishing` rows reclaimed by the
  // stale-lock reaper pre-pass.
  reaped: number;
  skipped: number;
  succeeded: number;
};

export async function runScheduledPublishingExecutor(admin: AdminContext, options: XPublishingJobOptions & { limit?: number } = {}): Promise<ScheduledPublishingExecutorResult> {
  const checkedAt = publishNowIso(options);

  // M-1: envelope audit at the start so cron invocations are traceable even
  // when there are zero due rows.
  const batchId = randomUUID();
  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "publishing_executor_started",
    metadata: { batch_id: batchId, checked_at: checkedAt, phase: PHASE_17 },
    request: options.request ?? undefined,
    success: true,
    targetType: "publishing_executor",
    userId: admin.userId,
  });

  // SCA-473 (C-3): stale-lock reaper. A Vercel timeout / SIGTERM / unhandled
  // throw during an in-flight publish can strand a scheduled_posts row as
  // status='publishing' with a non-null lock_token. Without this pre-pass the
  // row is permanently unreclaimable because the per-tick CAS at line ~2240
  // filters `.is("lock_token", null)`. Any lock held longer than 15 minutes is
  // treated as orphaned and reset to status='scheduled' for re-claim by this
  // or a subsequent tick.
  const STALE_LOCK_MS = 15 * 60 * 1_000;
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  let reaped = 0;
  const { data: reaperRows, error: reaperError } = await admin.supabase
    .from("scheduled_posts")
    .update({
      lock_token: null,
      locked_at: null,
      metadata: metadataWithPhase({
        phase: PHASE_17,
        reaper_batch_id: batchId,
        reaper_reclaimed_at: checkedAt,
        reaper_reason: "stale_publishing_lock",
      }),
      status: "scheduled",
    })
    .eq("user_id", admin.userId)
    .eq("status", "publishing")
    .lt("locked_at", staleBefore)
    .is("deleted_at", null)
    .select("id");
  if (reaperError) {
    console.error("publishing executor reaper: scheduled_posts update failed", { batchId, reason: reaperError.message });
  } else if (reaperRows && reaperRows.length > 0) {
    reaped = reaperRows.length;
    await logAuditEvent({
      actorEmail: admin.email,
      eventType: "publishing_executor_reaped",
      metadata: { batch_id: batchId, phase: PHASE_17, reaped, reaper_reason: "stale_publishing_lock", stale_before: staleBefore },
      request: options.request ?? undefined,
      success: true,
      targetType: "publishing_executor",
      userId: admin.userId,
    });
  }

  let envelopeError: null | string = null;
  let totalCandidates = 0;

  const { data, error } = await admin.supabase
    .from("scheduled_posts")
    .select("*")
    .eq("user_id", admin.userId)
    .eq("status", "scheduled")
    .lte("scheduled_for", checkedAt)
    .is("deleted_at", null)
    .order("scheduled_for", { ascending: true })
    .limit(options.limit ?? 10);

  if (error) {
    envelopeError = error.message;
    await logAuditEvent({
      actorEmail: admin.email,
      error: envelopeError,
      eventType: "publishing_executor_failed",
      metadata: { batch_id: batchId, phase: PHASE_17, stage: "load_due" },
      request: options.request ?? undefined,
      success: false,
      targetType: "publishing_executor",
      userId: admin.userId,
    });
    throw new Error(`Failed to load due scheduled posts: ${error.message}`);
  }

  totalCandidates = (data ?? []).length;

  let failed = 0;
  let skipped = 0;
  let succeeded = 0;

  for (const scheduled of (data ?? []) as ScheduledPostRow[]) {
    const lockToken = randomUUID();
    const { data: claimed, error: lockError } = await admin.supabase
      .from("scheduled_posts")
      .update({
        lock_token: lockToken,
        locked_at: checkedAt,
        status: "publishing",
      })
      .eq("id", scheduled.id)
      .eq("user_id", admin.userId)
      .eq("status", "scheduled")
      .is("lock_token", null)
      .select("id")
      .maybeSingle();

    if (lockError || !claimed) {
      skipped += 1;
      continue;
    }

    try {
      const result = await runXPublishingJob(
        admin,
        {
          confirmation: "confirm scheduled publish",
          id: scheduled.publishing_draft_id,
          payloadHash: null,
        },
        {
          ...options,
          mode: "live",
          scheduledPostId: scheduled.id,
        },
      );

      if (result.job.status === "succeeded") succeeded += 1;
      else if (result.failure?.retryable && result.failure.retryAfter) skipped += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      // SCA-473 (C-3): also clear lock_token/locked_at on this terminal
      // failure path. Without it, a throw from runXPublishingJob *before* its
      // recordFailure path engages (e.g. token-decrypt failure, transient
      // blip) leaves the row visibly failed but still locked, blocking any
      // future re-claim attempt.
      await admin.supabase
        .from("scheduled_posts")
        .update({
          lock_token: null,
          locked_at: null,
          metadata: metadataWithPhase({
            error: error instanceof Error ? error.message.slice(0, 500) : "unknown scheduled publish failure",
            phase: PHASE_17,
          }),
          status: "failed",
        })
        .eq("id", scheduled.id)
        .eq("user_id", admin.userId);
    }
  }

  // M-1: envelope audit at the end so cron success/failure rate is visible at
  // the batch level, not just per-draft.
  await logAuditEvent({
    actorEmail: admin.email,
    error: envelopeError,
    eventType: "publishing_executor_succeeded",
    metadata: {
      batch_id: batchId,
      candidates: totalCandidates,
      checked_at: checkedAt,
      failed,
      phase: PHASE_17,
      processed: succeeded + failed,
      reaped,
      skipped,
      succeeded,
    },
    request: options.request ?? undefined,
    success: true,
    targetType: "publishing_executor",
    userId: admin.userId,
  });

  return {
    checkedAt,
    failed,
    processed: succeeded + failed,
    reaped,
    skipped,
    succeeded,
  };
}

export async function deleteOwnXPost(admin: AdminContext, input: { confirmation: string; platformPostId: string }, options: XPublishingJobOptions = {}) {
  const connection = await loadXPublishingConnection(admin, options);

  if (!connection.capabilities.can_delete_posts) {
    await logAuditEvent({
      actorEmail: admin.email,
      error: "X delete capability is disabled.",
      eventType: "x_publish_failed",
      metadata: { action: "delete", phase: PHASE_17, platform_post_id: input.platformPostId },
      success: false,
      targetType: "x_post",
      userId: admin.userId,
    });
    throw new XPublishingGuardError("capability_disabled", "X delete-own-post capability is disabled.");
  }

  const client = options.client ?? createLiveXPublishingClient(connection.accessToken);
  const result = await client.deletePost(input.platformPostId);
  const timestamp = publishNowIso(options);

  await admin.supabase
    .from("published_posts")
    .update({
      deleted_at: timestamp,
      metadata: metadataWithPhase({ deleted_external: true, phase: PHASE_17 }),
    })
    .eq("user_id", admin.userId)
    .eq("platform", "x")
    .eq("platform_post_id", input.platformPostId);

  await admin.supabase
    .from("posts")
    .update({
      deleted_at: timestamp,
      metadata: metadataWithPhase({ deleted_external: true, phase: PHASE_17 }),
    })
    .eq("user_id", admin.userId)
    .eq("platform", "x")
    .eq("platform_post_id", input.platformPostId);

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "x_post_deleted",
    metadata: {
      confirmation: input.confirmation ? "present" : "missing",
      phase: PHASE_17,
      platform_post_id: input.platformPostId,
    },
    request: options.request ?? undefined,
    success: result.deleted,
    targetType: "x_post",
    userId: admin.userId,
  });

  return result;
}

function computeMetrics(drafts: PublishingDraft[]) {
  return {
    approved: drafts.filter((draft) => draft.approvalStatus === "approved").length,
    failed: drafts.filter((draft) => draft.status === "failed").length,
    needsApproval: drafts.filter((draft) => !["approved", "scheduled", "publishing", "published", "canceled", "archived"].includes(draft.status) || draft.approvalStatus !== "approved").length,
    scheduled: drafts.filter((draft) => draft.status === "scheduled").length,
  };
}

export async function loadPublishingWorkspace(admin: AdminContext): Promise<PublishingWorkspace> {
  const { data: draftRows, error: draftsError } = await admin.supabase
    .from("publishing_drafts")
    .select("*")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(300);

  if (draftsError) throw new Error(`Failed to load publishing drafts: ${draftsError.message}`);

  const { data: jobRows, error: jobsError } = await admin.supabase
    .from("publishing_jobs")
    .select("*")
    .eq("user_id", admin.userId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (jobsError) throw new Error(`Failed to load publishing jobs: ${jobsError.message}`);

  const { data: scheduledRows, error: scheduledError } = await admin.supabase
    .from("scheduled_posts")
    .select("*")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .order("scheduled_for", { ascending: true })
    .limit(300);

  if (scheduledError) throw new Error(`Failed to load scheduled posts: ${scheduledError.message}`);

  const { data: failureRows, error: failuresError } = await admin.supabase
    .from("publishing_failures")
    .select("*")
    .eq("user_id", admin.userId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (failuresError) throw new Error(`Failed to load publishing failures: ${failuresError.message}`);

  const drafts = (draftRows ?? []).map(rowToDraft);

  return {
    drafts,
    failures: (failureRows ?? []).map(rowToFailure),
    jobs: (jobRows ?? []).map(rowToJob),
    metrics: computeMetrics(drafts),
    scheduledPosts: (scheduledRows ?? []).map(rowToScheduledPost),
  };
}

function dateKeyForTimezone(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function calendarItemFromRows(item: ContentCalendarItemRow, draftsById: Map<string, PublishingDraft>) {
  const draft = item.entity_id ? draftsById.get(item.entity_id) : null;
  const text = draft ? textForDraft(draft) : item.title;
  return {
    draftId: item.entity_id,
    id: item.id,
    scheduledFor: item.starts_at,
    status: item.status,
    text,
    timezone: item.timezone,
    title: item.title,
    type: draft?.contentType ?? item.entity_type,
  } satisfies PublishingCalendarItem;
}

export async function loadPublishingCalendar(admin: AdminContext, options: { timezone?: string } = {}): Promise<PublishingCalendar> {
  const timezone = options.timezone ?? "UTC";
  const { data: calendarRows, error: calendarError } = await admin.supabase
    .from("content_calendar_items")
    .select("*")
    .eq("user_id", admin.userId)
    .eq("item_type", "publishing")
    .is("deleted_at", null)
    .order("starts_at", { ascending: true })
    .limit(500);

  if (calendarError) throw new Error(`Failed to load publishing calendar: ${calendarError.message}`);

  const { data: draftRows, error: draftError } = await admin.supabase
    .from("publishing_drafts")
    .select("*")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .limit(500);

  if (draftError) throw new Error(`Failed to load calendar draft context: ${draftError.message}`);

  const draftsById = new Map((draftRows ?? []).map((row) => [row.id, rowToDraft(row)]));
  const daysByDate = new Map<string, PublishingCalendarItem[]>();

  for (const row of calendarRows ?? []) {
    const key = dateKeyForTimezone(row.starts_at, row.timezone || timezone);
    daysByDate.set(key, [...(daysByDate.get(key) ?? []), calendarItemFromRows(row, draftsById)]);
  }

  const days = [...daysByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, items]) => {
      const load = items.length;
      return {
        date,
        items,
        load,
        warning: load > 3 ? "cadence overload" : null,
      } satisfies PublishingCalendarDay;
    });

  return {
    days,
    timezone,
    totals: {
      failed: days.reduce((sum, day) => sum + day.items.filter((item) => item.status === "failed").length, 0),
      scheduled: days.reduce((sum, day) => sum + day.items.filter((item) => item.status === "scheduled").length, 0),
      warningDays: days.filter((day) => day.warning).length,
    },
  };
}
