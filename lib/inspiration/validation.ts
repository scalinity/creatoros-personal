import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const optionalText = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().trim().min(1).optional());
const optionalUrl = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().trim().url().optional());

export const inspirationTransformModeSchema = z.enum([
  "structure",
  "hook_pattern",
  "argument_pattern",
  "original_version",
  "counterpoint",
  "voice_profile_version",
  "ten_unrelated_posts",
]);

export type InspirationTransformMode = z.infer<typeof inspirationTransformModeSchema>;

export function parseTagInput(value: unknown): string[] {
  const rawItems = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const item of rawItems) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/^#/, "").toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }

  return tags.slice(0, 20);
}

function normalizeUsername(value: string | undefined) {
  return value?.replace(/^@+/, "").trim() || null;
}

function optionalIsoDate(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : trimmed;
}

const baseInspirationSaveSchema = z.object({
  author_display_name: optionalText,
  author_username: optionalText,
  captured_at: z.preprocess(optionalIsoDate, z.string().datetime().optional()),
  notes: optionalText,
  platform: z.string().trim().min(1).optional().default("x"),
  platform_post_id: optionalText,
  post_id: optionalText,
  post_url: optionalUrl,
  tags: z.preprocess(parseTagInput, z.array(z.string()).default([])),
  text: nonEmptyString.max(12_000),
  url: optionalUrl,
});

export const inspirationSaveSchema = baseInspirationSaveSchema
  .superRefine((value, context) => {
    if (!value.post_url && !value.url && !value.post_id && !value.platform_post_id) {
      context.addIssue({
        code: "custom",
        message: "A post URL or platform post id is required.",
        path: ["post_url"],
      });
    }
  })
  .transform((value) => ({
    authorDisplayName: value.author_display_name ?? null,
    authorUsername: normalizeUsername(value.author_username),
    capturedAt: value.captured_at ?? null,
    notes: value.notes ?? null,
    platform: value.platform,
    platformPostId: value.platform_post_id ?? value.post_id ?? null,
    tags: value.tags,
    text: value.text.trim(),
    url: value.post_url ?? value.url ?? null,
  }));

export const inspirationUpdateSchema = z.object({
  author_display_name: optionalText,
  author_username: optionalText,
  id: nonEmptyString,
  notes: optionalText,
  platform_post_id: optionalText,
  post_id: optionalText,
  post_url: optionalUrl,
  tags: z.preprocess(parseTagInput, z.array(z.string()).default([])),
  text: nonEmptyString.max(12_000),
  url: optionalUrl,
}).transform((value) => ({
  authorDisplayName: value.author_display_name ?? null,
  authorUsername: normalizeUsername(value.author_username),
  id: value.id,
  notes: value.notes ?? null,
  platformPostId: value.platform_post_id ?? value.post_id ?? null,
  tags: value.tags,
  text: value.text.trim(),
  url: value.post_url ?? value.url ?? null,
}));

export const inspirationDeleteSchema = z.object({
  id: nonEmptyString,
});

export const inspirationTransformSchema = z.object({
  count: z.coerce.number().int().min(1).max(10).optional(),
  id: nonEmptyString,
  mode: inspirationTransformModeSchema,
}).transform((value) => ({
  count: value.mode === "ten_unrelated_posts" ? 10 : value.count ?? 1,
  id: value.id,
  mode: value.mode,
}));

export function formDataToInspirationRecord(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export type InspirationSaveInput = z.infer<typeof inspirationSaveSchema>;
export type InspirationUpdateInput = z.infer<typeof inspirationUpdateSchema>;
export type InspirationDeleteInput = z.infer<typeof inspirationDeleteSchema>;
export type InspirationTransformInput = z.infer<typeof inspirationTransformSchema>;