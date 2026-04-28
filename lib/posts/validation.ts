import { z } from "zod";

import type { PostMetricUpdateInput } from "@/lib/posts";

const metricSchema = z.coerce.number().int().nonnegative().default(0);
const nullableStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().nullable());

export const importModeSchema = z.enum(["csv", "json", "single"]);

export const postsImportRouteSchema = z.object({
  is_owner_post: z.boolean().optional(),
  mode: importModeSchema,
  payload: z.unknown(),
});

export const postsImportFormSchema = z.object({
  mode: z.enum(["csv", "json"]),
  payload: z.string().trim().min(1),
});

export const postMetricUpdateFormSchema = z
  .object({
    bookmark_count: metricSchema,
    content_pillar: nullableStringSchema.optional(),
    format: nullableStringSchema.optional(),
    has_link: z.coerce.boolean().optional(),
    has_media: z.coerce.boolean().optional(),
    hook_type: nullableStringSchema.optional(),
    id: z.string().trim().min(1),
    impression_count: metricSchema,
    like_count: metricSchema,
    media_view_count: metricSchema.optional(),
    profile_click_count: metricSchema.optional(),
    quote_count: metricSchema,
    reply_count: metricSchema,
    repost_count: metricSchema,
    tone: nullableStringSchema.optional(),
    topic: nullableStringSchema.optional(),
    url_link_click_count: metricSchema.optional(),
    video_view_count: metricSchema.optional(),
  })
  .transform(
    (value): PostMetricUpdateInput => ({
      bookmarkCount: value.bookmark_count,
      contentPillar: value.content_pillar,
      format: value.format,
      hasLink: value.has_link,
      hasMedia: value.has_media,
      hookType: value.hook_type,
      id: value.id,
      impressionCount: value.impression_count,
      likeCount: value.like_count,
      mediaViewCount: value.media_view_count,
      profileClickCount: value.profile_click_count,
      quoteCount: value.quote_count,
      replyCount: value.reply_count,
      repostCount: value.repost_count,
      tone: value.tone,
      topic: value.topic,
      urlLinkClickCount: value.url_link_click_count,
      videoViewCount: value.video_view_count,
    }),
  );

export function formDataToRecord(formData: FormData) {
  const record: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    record[key] = typeof value === "string" ? value : value.name;
  }

  return record;
}
