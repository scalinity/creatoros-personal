import { z } from "zod";

import type { Json } from "@/types/database";

const ideaStatuses = ["inbox", "active", "drafted", "used", "archived"] as const;
const sourceEntityTypes = ["post", "brain_dump", "inspiration", "account_research", "manual"] as const;
const generatedOutputTypes = ["x_post", "x_thread", "reply", "quote_post", "blog_outline", "blog_draft", "campaign_sequence", "content_pack", "manual"] as const;
const generatedInputTypes = ["content_idea", "post", "brain_dump", "inspiration", "account_research", "manual"] as const;

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

const optionalTrimmedText = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(500).nullable());

const requiredText = z.preprocess((value) => String(value ?? "").trim(), z.string().min(1).max(12_000));
const idSchema = z.string().trim().min(1);
const uuidOrNull = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().uuid().nullable());

const nullableSourceEntityTypeSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.enum(sourceEntityTypes).nullable());

const nullableGeneratedInputTypeSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.enum(generatedInputTypes).nullable());

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

export function parseTagInput(value: unknown) {
  const tokens = Array.isArray(value) ? value.flatMap((item) => String(item).split(/[\n,]/)) : String(value ?? "").split(/[\n,]/);
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const token of tokens) {
    const tag = token.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags.slice(0, 24);
}

const tagsSchema = z.preprocess(parseTagInput, z.array(z.string()).max(24));

function parseJsonArray(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      return JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  return value ?? [];
}

const variantsSchema = z.preprocess(parseJsonArray, z.array(jsonValueSchema).default([]));

export const contentIdeaCreateSchema = z
  .object({
    favorite: booleanish.default(false),
    linked_post_id: uuidOrNull.optional(),
    metadata: jsonObjectSchema.default({}),
    raw_text: requiredText,
    source: z.preprocess((value) => String(value ?? "manual").trim() || "manual", z.string().min(1).max(80)).default("manual"),
    source_entity_id: uuidOrNull.optional(),
    source_entity_type: nullableSourceEntityTypeSchema.optional(),
    status: z.enum(ideaStatuses).default("inbox"),
    tags: tagsSchema.default([]),
    title: optionalTrimmedText.optional(),
  })
  .transform((value) => ({
    favorite: value.favorite,
    linkedPostId: value.linked_post_id ?? null,
    metadata: value.metadata,
    rawText: value.raw_text,
    source: value.source,
    sourceEntityId: value.source_entity_id ?? null,
    sourceEntityType: value.source_entity_type ?? null,
    status: value.status,
    tags: value.tags,
    title: value.title ?? null,
  }));

const contentIdeaUpdateRawSchema = z.object({
  favorite: booleanish.optional(),
  id: idSchema,
  linked_post_id: uuidOrNull.optional(),
  metadata: jsonObjectSchema.optional(),
  raw_text: requiredText.optional(),
  source: z.preprocess((value) => String(value ?? "").trim(), z.string().min(1).max(80)).optional(),
  source_entity_id: uuidOrNull.optional(),
  source_entity_type: nullableSourceEntityTypeSchema.optional(),
  status: z.enum(ideaStatuses).optional(),
  tags: tagsSchema.optional(),
  title: optionalTrimmedText.optional(),
});

export const contentIdeaUpdateSchema = contentIdeaUpdateRawSchema.transform((value) => {
  const result: {
    favorite?: boolean;
    id: string;
    linkedPostId?: null | string;
    metadata?: Record<string, Json>;
    rawText?: string;
    source?: string;
    sourceEntityId?: null | string;
    sourceEntityType?: null | (typeof sourceEntityTypes)[number];
    status?: (typeof ideaStatuses)[number];
    tags?: string[];
    title?: null | string;
  } = { id: value.id };

  if (value.favorite !== undefined) result.favorite = value.favorite;
  if (value.linked_post_id !== undefined) result.linkedPostId = value.linked_post_id;
  if (value.metadata !== undefined) result.metadata = value.metadata;
  if (value.raw_text !== undefined) result.rawText = value.raw_text;
  if (value.source !== undefined) result.source = value.source;
  if (value.source_entity_id !== undefined) result.sourceEntityId = value.source_entity_id;
  if (value.source_entity_type !== undefined) result.sourceEntityType = value.source_entity_type;
  if (value.status !== undefined) result.status = value.status;
  if (value.tags !== undefined) result.tags = value.tags;
  if (value.title !== undefined) result.title = value.title;

  return result;
});

export const contentIdeaArchiveSchema = z.object({ id: idSchema });

export const generatedOutputCreateSchema = z
  .object({
    favorite: booleanish.default(false),
    input_id: uuidOrNull.optional(),
    input_type: nullableGeneratedInputTypeSchema.optional(),
    metadata: jsonObjectSchema.default({}),
    model: optionalTrimmedText.optional(),
    prompt_version: optionalTrimmedText.optional(),
    provider: optionalTrimmedText.optional(),
    saved: booleanish.default(false),
    text: requiredText,
    type: z.enum(generatedOutputTypes),
    variants: variantsSchema,
  })
  .transform((value) => ({
    favorite: value.favorite,
    inputId: value.input_id ?? null,
    inputType: value.input_type ?? null,
    metadata: value.metadata,
    model: value.model ?? null,
    promptVersion: value.prompt_version ?? null,
    provider: value.provider ?? null,
    saved: value.saved,
    text: value.text,
    type: value.type,
    variants: value.variants,
  }));

export const generatedOutputStatusActionSchema = z.object({
  action: z.enum(["saved", "unsaved", "favorite", "unfavorite", "copied", "archived", "restored"]),
  id: idSchema,
});

export type ContentIdeaCreateInput = z.infer<typeof contentIdeaCreateSchema>;
export type ContentIdeaUpdateInput = z.infer<typeof contentIdeaUpdateSchema>;
export type GeneratedOutputCreateInput = z.infer<typeof generatedOutputCreateSchema>;
export type GeneratedOutputStatusActionInput = z.infer<typeof generatedOutputStatusActionSchema>;

export function formDataToContentRecord(formData: FormData) {
  const record: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    record[key] = typeof value === "string" ? value : value.name;
  }

  return record;
}
