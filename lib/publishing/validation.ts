import { z } from "zod";

import type { Json } from "@/types/database";

export const publishingContentTypes = ["single_post", "thread", "reply", "quote_post", "blog_post", "blog_to_x_thread", "blog_to_x_series", "campaign_sequence"] as const;
export const publishingSourceTypes = ["manual", "content_idea", "generated_output", "blog_post", "post", "brain_dump", "algo_analysis_report"] as const;
export const publishingDraftStatuses = ["draft", "ai_generated", "owner_edited", "analyzed", "approved", "scheduled", "publishing", "published", "failed", "canceled", "archived"] as const;

const jsonValueSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
const idSchema = z.string().trim().min(1);
const optionalTrimmedText = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(8_000).nullable());
const requiredConfirmation = z.preprocess((value) => String(value ?? "").trim().toLowerCase(), z.string().refine((value) => value.includes("approve") || value.includes("confirm"), "Explicit owner confirmation is required."));
const nullableUuid = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().uuid().nullable());
const nullableSourceType = z.preprocess((value) => {
  if (value === null || value === undefined) return "manual";
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : "manual";
}, z.enum(publishingSourceTypes));
const nullableContentType = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.enum(publishingContentTypes).nullable());

function parseThreadItems(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      return trimmed
        .split(/\n{2,}|\r?\n\s*[-*]\s+/)
        .map((item) => item.replace(/^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean);
    }
  }

  return [];
}

function splitThreadFromText(text: string) {
  return text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const threadItemsSchema = z.preprocess(parseThreadItems, z.array(z.string().min(1).max(4_000)).max(40).default([]));
const scheduleDateSchema = z.preprocess((value) => String(value ?? "").trim(), z.string().datetime({ offset: true }).refine((value) => new Date(value).getTime() > Date.now(), "Schedule time must be in the future."));

function normalizeDraftBody(value: { content_type: (typeof publishingContentTypes)[number]; text?: null | string; thread_items: string[] }) {
  const text = value.text?.trim() ?? "";
  const threaded = ["thread", "blog_to_x_thread", "blog_to_x_series", "campaign_sequence"].includes(value.content_type);
  const threadItems = value.thread_items.length > 0 ? value.thread_items : threaded && text ? splitThreadFromText(text) : [];

  return { text, threadItems };
}

const draftBodyRefinement = (value: { content_type: (typeof publishingContentTypes)[number]; text?: null | string; thread_items: string[] }, context: z.RefinementCtx) => {
  const { text, threadItems } = normalizeDraftBody(value);

  if (!text && threadItems.length === 0) {
    context.addIssue({ code: "custom", message: "Publishing draft content is required.", path: ["text"] });
  }
};

export const publishingDraftCreateSchema = z
  .object({
    campaign_id: nullableUuid.optional(),
    content_type: z.enum(publishingContentTypes).default("single_post"),
    experiment_id: nullableUuid.optional(),
    media_asset_ids: z.preprocess(parseThreadItems, z.array(z.string().uuid()).default([])),
    metadata: jsonObjectSchema.default({}),
    quote_post_id: optionalTrimmedText.optional(),
    reply_to_post_id: optionalTrimmedText.optional(),
    source_id: nullableUuid.optional(),
    source_type: nullableSourceType.default("manual"),
    status: z.enum(publishingDraftStatuses).optional(),
    text: optionalTrimmedText.optional(),
    thread_items: threadItemsSchema,
    timezone: z.preprocess((value) => String(value ?? "UTC").trim() || "UTC", z.string().min(1).max(80)).default("UTC"),
  })
  .superRefine(draftBodyRefinement)
  .transform((value) => {
    const { text, threadItems } = normalizeDraftBody(value);

    return {
      campaignId: value.campaign_id ?? null,
      contentType: value.content_type,
      experimentId: value.experiment_id ?? null,
      mediaAssetIds: value.media_asset_ids,
      metadata: value.metadata,
      quotePostId: value.quote_post_id ?? null,
      replyToPostId: value.reply_to_post_id ?? null,
      sourceId: value.source_id ?? null,
      sourceType: value.source_type,
      status: value.status,
      text,
      threadItems,
      timezone: value.timezone,
    };
  });

export const publishingDraftFromSourceSchema = z
  .object({
    content_type: nullableContentType.optional(),
    source_id: nullableUuid.pipe(z.string().uuid()),
    source_type: z.enum(["content_idea", "generated_output", "blog_post", "post"]),
  })
  .transform((value) => ({
    contentType: value.content_type ?? null,
    sourceId: value.source_id,
    sourceType: value.source_type,
  }));

const publishingDraftUpdateRawSchema = z.object({
  campaign_id: nullableUuid.optional(),
  content_type: z.enum(publishingContentTypes).optional(),
  experiment_id: nullableUuid.optional(),
  id: idSchema,
  media_asset_ids: z.preprocess(parseThreadItems, z.array(z.string().uuid()).optional()),
  metadata: jsonObjectSchema.optional(),
  quote_post_id: optionalTrimmedText.optional(),
  reply_to_post_id: optionalTrimmedText.optional(),
  status: z.enum(["archived", "canceled", "draft", "owner_edited"]).optional(),
  text: optionalTrimmedText.optional(),
  thread_items: threadItemsSchema.optional(),
  timezone: z.preprocess((value) => (value === undefined ? undefined : String(value ?? "").trim()), z.string().min(1).max(80).optional()),
});

export const publishingDraftUpdateSchema = publishingDraftUpdateRawSchema.transform((value) => {
  const result: {
    campaignId?: null | string;
    contentType?: (typeof publishingContentTypes)[number];
    experimentId?: null | string;
    id: string;
    mediaAssetIds?: string[];
    metadata?: Record<string, Json>;
    quotePostId?: null | string;
    replyToPostId?: null | string;
    status?: "archived" | "canceled" | "draft" | "owner_edited";
    text?: string;
    threadItems?: string[];
    timezone?: string;
  } = { id: value.id };

  if (value.campaign_id !== undefined) result.campaignId = value.campaign_id;
  if (value.content_type !== undefined) result.contentType = value.content_type;
  if (value.experiment_id !== undefined) result.experimentId = value.experiment_id;
  if (value.media_asset_ids !== undefined) result.mediaAssetIds = value.media_asset_ids;
  if (value.metadata !== undefined) result.metadata = value.metadata;
  if (value.quote_post_id !== undefined) result.quotePostId = value.quote_post_id;
  if (value.reply_to_post_id !== undefined) result.replyToPostId = value.reply_to_post_id;
  if (value.status !== undefined) result.status = value.status;
  if (value.text !== undefined) result.text = value.text ?? "";
  if (value.thread_items !== undefined) result.threadItems = value.thread_items;
  if (value.timezone !== undefined) result.timezone = value.timezone;

  return result;
});

export const publishingDraftApprovalSchema = z
  .object({
    confirmation: requiredConfirmation,
    duplicate_override_reason: optionalTrimmedText.optional(),
    id: idSchema,
    payload_hash: optionalTrimmedText.optional(),
  })
  .transform((value) => ({
    confirmation: value.confirmation,
    duplicateOverrideReason: value.duplicate_override_reason ?? null,
    id: value.id,
    payloadHash: value.payload_hash ?? null,
  }));

export const publishingDraftScheduleSchema = z
  .object({
    id: idSchema,
    scheduled_for: scheduleDateSchema,
    timezone: z.preprocess((value) => String(value ?? "UTC").trim() || "UTC", z.string().min(1).max(80)),
  })
  .transform((value) => ({
    id: value.id,
    scheduledFor: value.scheduled_for,
    timezone: value.timezone,
  }));

export const publishingDraftDryRunSchema = z
  .object({
    confirmation: requiredConfirmation.optional(),
    id: idSchema,
    payload_hash: optionalTrimmedText.optional(),
  })
  .transform((value) => ({
    confirmation: value.confirmation ?? null,
    id: value.id,
    payloadHash: value.payload_hash ?? null,
  }));

export const publishingJobRetrySchema = z.object({
  confirmation: requiredConfirmation.optional(),
  id: idSchema,
});

export const publishingCancelSchema = z
  .object({
    id: idSchema,
    reason: optionalTrimmedText.optional(),
  })
  .transform((value) => ({ id: value.id, reason: value.reason ?? null }));

export type PublishingDraftApprovalInput = z.infer<typeof publishingDraftApprovalSchema>;
export type PublishingDraftCreateInput = z.infer<typeof publishingDraftCreateSchema>;
export type PublishingDraftDryRunInput = z.infer<typeof publishingDraftDryRunSchema>;
export type PublishingDraftFromSourceInput = z.infer<typeof publishingDraftFromSourceSchema>;
export type PublishingDraftScheduleInput = z.infer<typeof publishingDraftScheduleSchema>;
export type PublishingDraftUpdateInput = z.infer<typeof publishingDraftUpdateSchema>;
export type PublishingJobRetryInput = z.infer<typeof publishingJobRetrySchema>;
export type PublishingCancelInput = z.infer<typeof publishingCancelSchema>;

export function formDataToPublishingRecord(formData: FormData) {
  const record: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    record[key] = typeof value === "string" ? value : value.name;
  }

  return record;
}
