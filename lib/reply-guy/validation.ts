import { z } from "zod";

const optionalText = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(8_000).nullable());

const idSchema = z.string().trim().min(1);
const booleanish = z.union([z.boolean(), z.string()]).optional().transform((value) => value === true || value === "true" || value === "on");
const countSchema = z.coerce.number().int().min(1).max(3).default(2);
const metricSchema = z.coerce.number().int().min(0).default(0);
const optionalStatusId = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().regex(/^\d{1,40}$/).nullable());

export const replyTypes = [
  "thoughtful_value_add",
  "question",
  "respectful_disagreement",
  "concise_punchy",
  "friendly_support",
  "technical_expansion",
  "personal_anecdote",
] as const;

export type ReplyType = (typeof replyTypes)[number];

export type ParsedTargetPost = {
  authorUsername: null | string;
  platformPostId: null | string;
  text: string;
  url: null | string;
};

function cleanUsername(value: string) {
  const trimmed = value.trim();
  const urlMatch = /(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)/i.exec(trimmed);
  const candidate = urlMatch?.[1] ?? trimmed;
  return candidate.replace(/^@+/, "").replace(/[^a-z0-9_]/gi, "").toLowerCase();
}

export function normalizeXStatusId(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return /^\d{1,40}$/.test(normalized) ? normalized : null;
}

export function parseXStatusUrl(value: unknown) {
  if (typeof value !== "string") {
    return { authorUsername: null, platformPostId: null, url: null };
  }

  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || (hostname !== "x.com" && hostname !== "twitter.com")) {
      return { authorUsername: null, platformPostId: null, url: null };
    }

    const [username, statusSegment, postId] = url.pathname.split("/").filter(Boolean);
    const normalizedId = normalizeXStatusId(postId);
    if (!username || statusSegment?.toLowerCase() !== "status" || !normalizedId) {
      return { authorUsername: null, platformPostId: null, url: null };
    }

    const normalizedUsername = cleanUsername(username);
    if (!normalizedUsername) return { authorUsername: null, platformPostId: null, url: null };

    return {
      authorUsername: normalizedUsername,
      platformPostId: normalizedId,
      url: `https://x.com/${normalizedUsername}/status/${normalizedId}`,
    };
  } catch {
    return { authorUsername: null, platformPostId: null, url: null };
  }
}

export function normalizeTargetUsername(value: unknown) {
  if (typeof value !== "string") return "";
  return cleanUsername(value);
}

function parsePostUrl(value: string) {
  const match = /(https:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s/]+\/status\/\d+[^\s]*)/i.exec(value);
  return parseXStatusUrl(match?.[1] ?? value);
}

export function parsePastedTargetPosts(value: unknown, limit = 20): ParsedTargetPost[] {
  if (typeof value !== "string") return [];

  return value
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => {
      const parsedUrl = parsePostUrl(block);
      const text = block
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && parseXStatusUrl(line).url !== parsedUrl.url)
        .join("\n")
        .replace(/https:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s/]+\/status\/\d+[^\s]*/gi, "")
        .trim();

      const normalizedText = text || (parsedUrl.url ? "" : block);
      if (!normalizedText) return [];

      return [
        {
          authorUsername: parsedUrl.authorUsername,
          platformPostId: parsedUrl.platformPostId,
          text: normalizedText.slice(0, 8_000),
          url: parsedUrl.url,
        } satisfies ParsedTargetPost,
      ];
    })
    .slice(0, limit);
}

const usernameSchema = z.preprocess(normalizeTargetUsername, z.string().min(1).max(80));
const optionalXStatusUrl = optionalText.refine((value) => !value || Boolean(parseXStatusUrl(value).url), "URL must be an HTTPS x.com or twitter.com status URL.");

export const targetAccountCreateSchema = z.object({
  display_name: optionalText.optional(),
  list_name: optionalText.optional(),
  niche: optionalText.optional(),
  notes: optionalText.optional(),
  priority: z.coerce.number().int().min(0).max(5).default(0),
  username: usernameSchema,
}).transform((value) => ({
  displayName: value.display_name ?? null,
  listName: value.list_name ?? null,
  niche: value.niche ?? null,
  notes: value.notes ?? null,
  priority: value.priority,
  username: value.username,
}));

export const targetAccountArchiveSchema = z.object({ id: idSchema }).transform((value) => ({ id: value.id }));

export const targetPostImportSchema = z.object({
  author_username: optionalText.optional(),
  bookmark_count: metricSchema.optional(),
  created_at_platform: optionalText.optional(),
  impression_count: metricSchema.optional(),
  like_count: metricSchema.optional(),
  platform_post_id: optionalStatusId.optional(),
  quote_count: metricSchema.optional(),
  reply_count: metricSchema.optional(),
  repost_count: metricSchema.optional(),
  target_account_id: idSchema,
  text: z.string().trim().min(1).max(8_000),
  url: optionalXStatusUrl.optional(),
}).superRefine((value, ctx) => {
  const parsedUrl = parseXStatusUrl(value.url);
  if (value.platform_post_id && parsedUrl.platformPostId && value.platform_post_id !== parsedUrl.platformPostId) {
    ctx.addIssue({ code: "custom", message: "Platform post id does not match the supplied X status URL.", path: ["platform_post_id"] });
  }
}).transform((value) => {
  const parsedUrl = parseXStatusUrl(value.url);
  const normalizedPlatformPostId = value.platform_post_id ?? parsedUrl.platformPostId;

  return {
    authorUsername: value.author_username ?? parsedUrl.authorUsername ?? null,
    bookmarkCount: value.bookmark_count ?? 0,
    createdAtPlatform: value.created_at_platform ?? null,
    impressionCount: value.impression_count ?? 0,
    likeCount: value.like_count ?? 0,
    platformPostId: normalizedPlatformPostId ?? null,
    quoteCount: value.quote_count ?? 0,
    replyCount: value.reply_count ?? 0,
    repostCount: value.repost_count ?? 0,
    targetAccountId: value.target_account_id,
    text: value.text,
    url: parsedUrl.url ?? null,
  };
});

export const targetPostPasteSchema = z.object({
  pasted_posts: z.string().trim().min(1).max(60_000),
  target_account_id: idSchema,
}).transform((value) => ({
  targetAccountId: value.target_account_id,
  posts: parsePastedTargetPosts(value.pasted_posts),
})).refine((value) => value.posts.length > 0, "At least one pasted target post is required.");

export const replyGenerationSchema = z.object({
  count: countSchema,
  original_post_text: optionalText.optional(),
  owner_notes: optionalText.optional(),
  reply_type: z.enum(replyTypes).default("thoughtful_value_add"),
  target_account_id: optionalText.optional(),
  target_post_id: optionalText.optional(),
}).transform((value) => ({
  count: value.count,
  originalPostText: value.original_post_text ?? null,
  ownerNotes: value.owner_notes ?? null,
  replyType: value.reply_type,
  targetAccountId: value.target_account_id ?? null,
  targetPostId: value.target_post_id ?? null,
})).refine((value) => Boolean(value.targetPostId || value.originalPostText), "Choose a target post or paste original post text.");

export const replyDraftActionSchema = z.object({ id: idSchema }).transform((value) => ({ id: value.id }));

export const replyPublishingHandoffSchema = z.object({
  confirm_single_reply: booleanish,
  id: idSchema,
}).transform((value) => ({ confirmSingleReply: value.confirm_single_reply, id: value.id })).refine((value) => value.confirmSingleReply, "Confirm that this is one reply handoff only.");

export function formDataToReplyRecord(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export type TargetAccountCreateInput = z.infer<typeof targetAccountCreateSchema>;
export type TargetPostImportInput = z.infer<typeof targetPostImportSchema>;
export type TargetPostPasteInput = z.infer<typeof targetPostPasteSchema>;
export type ReplyGenerationInput = z.infer<typeof replyGenerationSchema>;
export type ReplyDraftActionInput = z.infer<typeof replyDraftActionSchema>;
export type ReplyPublishingHandoffInput = z.infer<typeof replyPublishingHandoffSchema>;
