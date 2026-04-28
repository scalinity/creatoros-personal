import "server-only";

import { createHash } from "node:crypto";

import { logAuditEvent } from "@/lib/audit";
import type { AdminContext } from "@/lib/auth/admin";
import type {
  BlogPostRow,
  ContentCalendarItemRow,
  ContentIdeaRow,
  Database,
  GeneratedOutputRow,
  Json,
  PostRow,
  PublishingDraftRow,
  PublishingFailureRow,
  PublishingJobRow,
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

const PHASE = "15-publishing-state-machine-dry-run-calendar";
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

export function buildPublishingPayloadPreview(draft: PublishingDraft) {
  return {
    account: {
      avatar_url: null,
      display_name: "X connection pending",
      username: "not_connected",
    },
    capabilities: {
      can_upload_media: draft.mediaAssetIds.length === 0,
      can_write_posts: true,
      can_write_quotes: draft.contentType === "quote_post",
      can_write_replies: draft.contentType === "reply",
      dry_run_only: true,
      live_x_write_enabled: false,
    },
    content_type: draft.contentType,
    media_asset_ids: draft.mediaAssetIds,
    quote_post_id: draft.quotePostId,
    reply_to_post_id: draft.replyToPostId,
    required_scopes: requiredScopesForDraft(draft),
    text: draft.text,
    thread_items: draft.threadItems,
  } satisfies Record<string, Json>;
}

export function computePublishingPayloadHash(draft: PublishingDraft) {
  return hashString(stableJsonStringify(buildPublishingPayloadPreview(draft)));
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

  if (error || !data) throw new Error(`Generated output source not found: ${error?.message ?? "missing row"}`);
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

  if (error || !data) throw new Error(`Content idea source not found: ${error?.message ?? "missing row"}`);
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

  if (error || !data) throw new Error(`Blog source not found: ${error?.message ?? "missing row"}`);
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

  if (error || !data) throw new Error(`Post source not found: ${error?.message ?? "missing row"}`);
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
    throw new Error(`Publishing draft not found: ${error?.message ?? "missing row"}`);
  }

  return rowToDraft(data);
}

function updatePayloadForDraft(input: PublishingDraftUpdateInput, current: PublishingDraft) {
  const payload: PublishingDraftUpdatePayload = {};
  let contentChanged = false;

  if (input.campaignId !== undefined) payload.campaign_id = input.campaignId;
  if (input.contentType !== undefined) {
    payload.content_type = input.contentType;
    contentChanged = input.contentType !== current.contentType;
  }
  if (input.experimentId !== undefined) payload.experiment_id = input.experimentId;
  if (input.mediaAssetIds !== undefined) {
    payload.media_asset_ids = input.mediaAssetIds;
    contentChanged = true;
  }
  if (input.metadata !== undefined) payload.metadata = metadataWithPhase(input.metadata);
  if (input.quotePostId !== undefined) {
    payload.quote_post_id = input.quotePostId;
    contentChanged = true;
  }
  if (input.replyToPostId !== undefined) {
    payload.reply_to_post_id = input.replyToPostId;
    contentChanged = true;
  }
  if (input.text !== undefined) {
    payload.text = input.text;
    contentChanged = input.text !== current.text;
  }
  if (input.threadItems !== undefined) {
    payload.thread_items = input.threadItems;
    contentChanged = true;
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

  if (["archived", "canceled", "published", "publishing"].includes(draft.status)) {
    throw new Error(`Publishing draft in ${draft.status} status cannot be approved.`);
  }

  const checks = await runDraftGuardrails(admin, draft, draft.id);

  const overrideReason = input.duplicateOverrideReason ?? null;

  if (guardrailBlocksApproval(checks, overrideReason)) {
    throw new Error("Publishing draft requires an explicit owner override before approval.");
  }

  const payloadHash = computePublishingPayloadHash(draft);

  if (input.payloadHash && input.payloadHash !== payloadHash) {
    throw new Error("Approval payload hash does not match the current draft payload.");
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

function assertApprovalPayload(draft: PublishingDraft, suppliedHash?: null | string) {
  if (draft.approvalStatus !== "approved" || !draft.approvalPayloadHash || !draft.approvedAt) {
    throw new Error("Publishing draft must be approved before this transition.");
  }

  const currentHash = computePublishingPayloadHash(draft);
  if (currentHash !== draft.approvalPayloadHash) {
    throw new Error("Approved payload hash is stale. Re-approval is required.");
  }

  if (suppliedHash && suppliedHash !== draft.approvalPayloadHash) {
    throw new Error("Supplied payload hash does not match the approved payload.");
  }
}

export async function scheduleApprovedDraft(admin: AdminContext, input: PublishingDraftScheduleInput) {
  const draft = await loadDraft(admin, input.id);

  if (draft.status !== "approved") {
    throw new Error("Publishing draft must be approved before scheduling.");
  }

  assertApprovalPayload(draft);

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
  return `${jobType}:${draft.id}:${payloadHash}:${hashString(textForDraft(draft)).slice(0, 12)}`;
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

  await admin.supabase
    .from("publishing_drafts")
    .update({ status: "failed" })
    .eq("id", draft.id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null);

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
  assertApprovalPayload(draft, input.payloadHash ?? null);

  const payloadHash = draft.approvalPayloadHash;
  if (!payloadHash) throw new Error("Approved payload hash is missing.");

  const startedAt = nowIso();
  const failed = dryRunShouldFail(draft);
  const payloadPreview = buildPublishingPayloadPreview(draft);
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
    failure = await insertPublishingFailure(admin, jobRow, draft, "Dry run failed before external write.");
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

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "publishing_retry",
    metadata: { failed_job_id: job.id, phase: PHASE },
    success: true,
    targetId: job.publishing_draft_id,
    targetType: "publishing_draft",
    userId: admin.userId,
  });

  return runDryRunPublishingJob(admin, { confirmation: null, id: job.publishing_draft_id, payloadHash: null }, { jobType: "retry" });
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

  await admin.supabase
    .from("scheduled_posts")
    .update({ canceled_audit_log_id: null, metadata: metadataWithPhase({ canceled_at: timestamp, reason: input.reason }), status: "canceled" })
    .eq("publishing_draft_id", draft.id)
    .eq("user_id", admin.userId);

  await admin.supabase
    .from("content_calendar_items")
    .update({ metadata: metadataWithPhase({ canceled_at: timestamp, reason: input.reason }), status: "canceled" })
    .eq("entity_id", draft.id)
    .eq("user_id", admin.userId);

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
