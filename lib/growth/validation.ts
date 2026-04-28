import { z } from "zod";

import type { Json } from "@/types/database";

const campaignStatuses = ["draft", "active", "paused", "completed", "archived"] as const;
const campaignItemStatuses = ["planned", "drafted", "scheduled", "published", "completed", "failed", "canceled", "archived"] as const;
const campaignItemTypes = ["x_post", "x_thread", "reply", "quote_post", "blog_post", "blog_to_x_series"] as const;
const experimentDecisions = ["continue", "stop", "iterate", "scale"] as const;
const experimentStatuses = ["draft", "active", "paused", "completed", "archived"] as const;
const experimentTypes = ["hook", "topic", "format", "posting_time", "cta", "reply_strategy", "blog_repurposing"] as const;
const goalStatuses = ["active", "paused", "completed", "archived", "canceled"] as const;

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
const requiredText = (max: number) => z.preprocess((value) => String(value ?? "").trim(), z.string().min(1).max(max));
const optionalText = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(6_000).nullable());
const shortOptionalText = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(500).nullable());
const optionalDate = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const optionalTimestamp = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : trimmed;
}, z.string().datetime().nullable());
const nullableId = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().min(1).nullable());
const nullableUuid = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().uuid().nullable());
const numberOrNull = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().finite().min(0).nullable());
const integerFromForm = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().int().min(0));
const booleanish = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "on", "true", "yes"].includes(normalized)) return true;
    if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  }
  return false;
}, z.boolean());

const invalidJsonObject = Symbol("invalid-json-object");

function parseJsonObject(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : invalidJsonObject;
  } catch {
    return invalidJsonObject;
  }
}

function parseLineList(value: unknown) {
  const tokens = Array.isArray(value) ? value.flatMap((item) => String(item).split(/[\n,]/)) : String(value ?? "").split(/[\n,]/);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of tokens) {
    const item = token.trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result.slice(0, 24);
}

const jsonObjectFromFormSchema = z.preprocess(parseJsonObject, jsonObjectSchema.default({}));
const examplesSchema = z.preprocess(parseLineList, z.array(z.string().min(1)).max(24));

export const goalCreateSchema = z
  .object({
    description: optionalText.optional(),
    end_date: optionalDate.optional(),
    metadata: jsonObjectFromFormSchema.default({}),
    metric_key: requiredText(120),
    start_date: optionalDate.optional(),
    status: z.enum(goalStatuses).default("active"),
    target_value: numberOrNull.optional(),
    title: requiredText(180),
  })
  .transform((value) => ({
    description: value.description ?? null,
    endDate: value.end_date ?? null,
    metadata: value.metadata,
    metricKey: value.metric_key,
    startDate: value.start_date ?? null,
    status: value.status,
    targetValue: value.target_value ?? null,
    title: value.title,
  }));

export const pillarCreateSchema = z
  .object({
    active: booleanish.default(true),
    description: optionalText.optional(),
    examples: examplesSchema.default([]),
    metadata: jsonObjectFromFormSchema.default({}),
    name: requiredText(180),
    priority: integerFromForm.default(0),
  })
  .transform((value) => ({
    active: value.active,
    description: value.description ?? null,
    examples: value.examples,
    metadata: value.metadata,
    name: value.name,
    priority: value.priority,
  }));

export const campaignCreateSchema = z
  .object({
    end_date: optionalDate.optional(),
    hypothesis: optionalText.optional(),
    metadata: jsonObjectFromFormSchema.default({}),
    name: requiredText(180),
    objective: optionalText.optional(),
    pillar_id: nullableId.optional(),
    start_date: optionalDate.optional(),
    status: z.enum(campaignStatuses).default("active"),
    target_metrics: jsonObjectFromFormSchema.default({}),
  })
  .transform((value) => ({
    endDate: value.end_date ?? null,
    hypothesis: value.hypothesis ?? null,
    metadata: value.metadata,
    name: value.name,
    objective: value.objective ?? null,
    pillarId: value.pillar_id ?? null,
    startDate: value.start_date ?? null,
    status: value.status,
    targetMetrics: value.target_metrics,
  }));

export const campaignItemCreateSchema = z
  .object({
    blog_post_id: nullableId.optional(),
    campaign_id: idSchema,
    entity_id: nullableUuid.optional(),
    entity_type: z.enum(campaignItemTypes),
    metadata: jsonObjectFromFormSchema.default({}),
    published_post_id: nullableId.optional(),
    publishing_draft_id: nullableId.optional(),
    role: shortOptionalText.optional(),
    scheduled_for: optionalTimestamp.optional(),
    sequence_index: integerFromForm.default(0),
    status: z.enum(campaignItemStatuses).default("planned"),
  })
  .transform((value) => ({
    blogPostId: value.blog_post_id ?? null,
    campaignId: value.campaign_id,
    entityId: value.entity_id ?? null,
    entityType: value.entity_type,
    metadata: value.metadata,
    publishedPostId: value.published_post_id ?? null,
    publishingDraftId: value.publishing_draft_id ?? null,
    role: value.role ?? null,
    scheduledFor: value.scheduled_for ?? null,
    sequenceIndex: value.sequence_index,
    status: value.status,
  }));

export const experimentCreateSchema = z
  .object({
    content_filters: jsonObjectFromFormSchema.default({}),
    end_date: optionalDate.optional(),
    experiment_type: z.enum(experimentTypes),
    hypothesis: optionalText.optional(),
    metadata: jsonObjectFromFormSchema.default({}),
    start_date: optionalDate.optional(),
    status: z.enum(experimentStatuses).default("active"),
    success_metric: shortOptionalText.optional(),
    title: requiredText(180),
  })
  .transform((value) => ({
    contentFilters: value.content_filters,
    endDate: value.end_date ?? null,
    experimentType: value.experiment_type,
    hypothesis: value.hypothesis ?? null,
    metadata: value.metadata,
    startDate: value.start_date ?? null,
    status: value.status,
    successMetric: value.success_metric ?? null,
    title: value.title,
  }));

export const experimentResultSchema = z
  .object({
    baseline_metrics: jsonObjectFromFormSchema.default({}),
    decision: z.preprocess((value) => {
      const trimmed = String(value ?? "").trim();
      return trimmed.length > 0 ? trimmed : null;
    }, z.enum(experimentDecisions).nullable()).optional(),
    experiment_id: idSchema,
    metadata: jsonObjectFromFormSchema.default({}),
    metrics: jsonObjectFromFormSchema.default({}),
    result: optionalText.optional(),
    run_ai: booleanish.default(true),
  })
  .transform((value) => ({
    baselineMetrics: value.baseline_metrics,
    decision: value.decision ?? null,
    experimentId: value.experiment_id,
    metadata: value.metadata,
    metrics: value.metrics,
    result: value.result ?? null,
    runAi: value.run_ai,
  }));

export const weeklyReviewSchema = z
  .object({
    owner_notes: optionalText.optional(),
    week_end: optionalDate,
    week_start: optionalDate,
  })
  .transform((value) => ({
    ownerNotes: value.owner_notes ?? null,
    weekEnd: value.week_end ?? null,
    weekStart: value.week_start ?? null,
  }));

export const monthlyReviewSchema = z
  .object({
    month_end: optionalDate,
    month_start: optionalDate,
    owner_notes: optionalText.optional(),
  })
  .transform((value) => ({
    monthEnd: value.month_end ?? null,
    monthStart: value.month_start ?? null,
    ownerNotes: value.owner_notes ?? null,
  }));

export const profileAuditInputSchema = z
  .object({
    avatar_notes: optionalText.optional(),
    bio: optionalText.optional(),
    header_notes: optionalText.optional(),
    link_cta: optionalText.optional(),
    owner_notes: optionalText.optional(),
    pinned_post_text: optionalText.optional(),
    recent_post_grid_notes: optionalText.optional(),
  })
  .transform((value) => ({
    avatarNotes: value.avatar_notes ?? null,
    bio: value.bio ?? null,
    headerNotes: value.header_notes ?? null,
    linkCta: value.link_cta ?? null,
    ownerNotes: value.owner_notes ?? null,
    pinnedPostText: value.pinned_post_text ?? null,
    recentPostGridNotes: value.recent_post_grid_notes ?? null,
  }));

export const archiveRecordSchema = z.object({ id: idSchema });

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
export type CampaignItemCreateInput = z.infer<typeof campaignItemCreateSchema>;
export type ExperimentCreateInput = z.infer<typeof experimentCreateSchema>;
export type ExperimentDecision = (typeof experimentDecisions)[number];
export type ExperimentResultInput = z.infer<typeof experimentResultSchema>;
export type GoalCreateInput = z.infer<typeof goalCreateSchema>;
export type MonthlyReviewInput = z.infer<typeof monthlyReviewSchema>;
export type PillarCreateInput = z.infer<typeof pillarCreateSchema>;
export type ProfileAuditInput = z.infer<typeof profileAuditInputSchema>;
export type WeeklyReviewInput = z.infer<typeof weeklyReviewSchema>;

export function formDataToGrowthRecord(formData: FormData) {
  const record: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    record[key] = typeof value === "string" ? value : value.name;
  }

  return record;
}
