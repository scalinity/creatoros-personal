import { z } from "zod";

import { normalizeTargetUsername, parsePastedTargetPosts } from "@/lib/reply-guy/validation";

const optionalText = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(60_000).nullable());

const idSchema = z.string().trim().min(1);
const booleanish = z.union([z.boolean(), z.string()]).optional().transform((value) => value === true || value === "true" || value === "on");
const usernameSchema = z.preprocess(normalizeTargetUsername, z.string().max(80));

export const accountResearchInputSchema = z.object({
  owner_notes: optionalText.optional(),
  pasted_posts: optionalText.optional(),
  save_target_account: booleanish,
  target_account_id: optionalText.optional(),
  username: usernameSchema.optional().default(""),
}).transform((value) => ({
  ownerNotes: value.owner_notes ?? null,
  pastedPosts: value.pasted_posts ?? null,
  parsedPosts: parsePastedTargetPosts(value.pasted_posts ?? "", 20),
  saveTargetAccount: value.save_target_account,
  targetAccountId: value.target_account_id ?? null,
  username: value.username || null,
})).refine((value) => Boolean(value.username || value.targetAccountId || value.parsedPosts.length > 0), "Username, saved target, or pasted posts are required.");

export const accountResearchIdeaKindSchema = z.enum(["blog", "campaign", "x_post"]);

export const accountResearchIdeaSaveSchema = z.object({
  idea_kind: accountResearchIdeaKindSchema.default("x_post"),
  idea_text: z.string().trim().min(1).max(4_000),
  report_id: idSchema,
}).transform((value) => ({
  ideaKind: value.idea_kind,
  ideaText: value.idea_text,
  reportId: value.report_id,
}));

export function formDataToAccountResearchRecord(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export type AccountResearchInput = z.infer<typeof accountResearchInputSchema>;
export type AccountResearchIdeaKind = z.infer<typeof accountResearchIdeaKindSchema>;
export type AccountResearchIdeaSaveInput = z.infer<typeof accountResearchIdeaSaveSchema>;