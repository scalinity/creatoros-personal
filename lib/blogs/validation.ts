import { z } from "zod";

import type { Json } from "@/types/database";

export const blogStatuses = ["idea", "outlining", "drafting", "editing", "ready", "exported", "published_externally", "archived"] as const;
export const blogSourceTypes = ["manual", "content_idea", "post", "brain_dump", "generated_output"] as const;
export const blogExportFormats = ["markdown", "html", "json", "mdx"] as const;
export const blogAiModes = ["outline", "draft", "editor", "seo", "blog_to_x"] as const;

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
const titleSchema = z.preprocess((value) => String(value ?? "").trim(), z.string().min(1).max(220));
const optionalText = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(8_000).nullable());
const optionalSlug = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(160).nullable());
const markdownSchema = z.preprocess((value) => String(value ?? "").trim(), z.string().max(120_000));
const requiredMarkdownSchema = markdownSchema.pipe(z.string().min(1));
const nullableUuid = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().uuid().nullable());
const nullableSourceType = z.preprocess((value) => {
  if (value === null || value === undefined) return "manual";
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : "manual";
}, z.enum(blogSourceTypes));

export function parseListInput(value: unknown) {
  const tokens = Array.isArray(value) ? value.flatMap((item) => String(item).split(/[\n,]/)) : String(value ?? "").split(/[\n,]/);
  const seen = new Set<string>();
  const items: string[] = [];

  for (const token of tokens) {
    const item = token.trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  return items.slice(0, 32);
}

const listSchema = z.preprocess(parseListInput, z.array(z.string()).max(32));

export const blogCreateSchema = z
  .object({
    canonical_summary: optionalText.optional(),
    categories: listSchema.default([]),
    markdown: requiredMarkdownSchema.default("# Untitled blog"),
    meta_description: optionalText.optional(),
    metadata: jsonObjectSchema.default({}),
    seo_title: optionalText.optional(),
    slug: optionalSlug.optional(),
    source_id: nullableUuid.optional(),
    source_type: nullableSourceType.default("manual"),
    status: z.enum(blogStatuses).default("idea"),
    tags: listSchema.default([]),
    title: titleSchema,
  })
  .transform((value) => ({
    canonicalSummary: value.canonical_summary ?? null,
    categories: value.categories,
    markdown: value.markdown,
    metaDescription: value.meta_description ?? null,
    metadata: value.metadata,
    seoTitle: value.seo_title ?? null,
    slug: value.slug ?? null,
    sourceId: value.source_id ?? null,
    sourceType: value.source_type,
    status: value.status,
    tags: value.tags,
    title: value.title,
  }));

const blogUpdateRawSchema = z.object({
  canonical_summary: optionalText.optional(),
  categories: listSchema.optional(),
  change_reason: optionalText.optional(),
  id: idSchema,
  markdown: markdownSchema.optional(),
  meta_description: optionalText.optional(),
  metadata: jsonObjectSchema.optional(),
  seo_title: optionalText.optional(),
  slug: optionalSlug.optional(),
  status: z.enum(blogStatuses).optional(),
  tags: listSchema.optional(),
  title: titleSchema.optional(),
});

export const blogUpdateSchema = blogUpdateRawSchema.transform((value) => {
  const result: {
    canonicalSummary?: null | string;
    categories?: string[];
    changeReason?: null | string;
    id: string;
    markdown?: string;
    metaDescription?: null | string;
    metadata?: Record<string, Json>;
    seoTitle?: null | string;
    slug?: null | string;
    status?: (typeof blogStatuses)[number];
    tags?: string[];
    title?: string;
  } = { id: value.id };

  if (value.canonical_summary !== undefined) result.canonicalSummary = value.canonical_summary;
  if (value.categories !== undefined) result.categories = value.categories;
  if (value.change_reason !== undefined) result.changeReason = value.change_reason;
  if (value.markdown !== undefined) result.markdown = value.markdown;
  if (value.meta_description !== undefined) result.metaDescription = value.meta_description;
  if (value.metadata !== undefined) result.metadata = value.metadata;
  if (value.seo_title !== undefined) result.seoTitle = value.seo_title;
  if (value.slug !== undefined) result.slug = value.slug;
  if (value.status !== undefined) result.status = value.status;
  if (value.tags !== undefined) result.tags = value.tags;
  if (value.title !== undefined) result.title = value.title;

  return result;
});

export const blogArchiveSchema = z.object({ id: idSchema });

export const blogExportSchema = z.object({
  format: z.enum(blogExportFormats).default("markdown"),
});

export const blogAiActionSchema = z
  .object({
    blog_id: idSchema,
    mode: z.enum(blogAiModes),
    owner_notes: optionalText.optional(),
  })
  .transform((value) => ({
    blogId: value.blog_id,
    mode: value.mode,
    ownerNotes: value.owner_notes ?? null,
  }));

export type BlogAiActionInput = z.infer<typeof blogAiActionSchema>;
export type BlogCreateInput = z.infer<typeof blogCreateSchema>;
export type BlogExportInput = z.infer<typeof blogExportSchema>;
export type BlogUpdateInput = z.infer<typeof blogUpdateSchema>;

export function formDataToBlogRecord(formData: FormData) {
  const record: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    record[key] = typeof value === "string" ? value : value.name;
  }

  return record;
}
