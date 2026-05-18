"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { rethrowIfRedirect } from "@/lib/server-only/action-redirect";
import {
  archiveTargetAccount,
  createReplyPublishingDraft,
  createTargetAccount,
  generateReplyDrafts,
  importParsedTargetPosts,
  importTargetAccountPost,
  markReplyDraftCopied,
  markReplyDraftUsed,
} from "@/lib/reply-guy";
import {
  formDataToReplyRecord,
  replyDraftActionSchema,
  replyGenerationSchema,
  replyPublishingHandoffSchema,
  targetAccountArchiveSchema,
  targetAccountCreateSchema,
  targetPostImportSchema,
  targetPostPasteSchema,
} from "@/lib/reply-guy/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";

const mutationLimiter = createFixedWindowRateLimiter({
  limit: 80,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

const aiLimiter = createFixedWindowRateLimiter({
  limit: 30,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

function redirectToReplyGuy(params: Record<string, string | undefined>): never {
  const clean = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
  redirect(`/reply-guy?${new URLSearchParams(clean).toString()}`);
}

async function assertAllowed(userId: string, key: "ai" | "mutation", id?: string) {
  const decision = await (key === "ai" ? aiLimiter : mutationLimiter).check({ id: `${userId}:reply-guy:${key}${id ? `:${id}` : ""}` });
  if (!decision.allowed) redirectToReplyGuy({ notice: "rate_limited", selected: id });
}

export async function createTargetAccountAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = targetAccountCreateSchema.safeParse(formDataToReplyRecord(formData));

  if (!parsed.success) redirectToReplyGuy({ notice: "target_failed" });

  let accountId: string;
  try {
    const account = await createTargetAccount(admin, parsed.data);
    accountId = account.id;
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to save target account", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToReplyGuy({ notice: "target_failed" });
  }

  redirectToReplyGuy({ notice: "target_saved", selected: accountId });
}

export async function archiveTargetAccountAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = targetAccountArchiveSchema.safeParse(formDataToReplyRecord(formData));

  if (!parsed.success) redirectToReplyGuy({ notice: "target_archive_failed" });

  await assertAllowed(admin.userId, "mutation", parsed.data.id);

  try {
    await archiveTargetAccount(admin, parsed.data);
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to archive target account", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToReplyGuy({ notice: "target_archive_failed", selected: parsed.data.id });
  }

  redirectToReplyGuy({ notice: "target_archived" });
}

export async function importTargetPostAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = targetPostImportSchema.safeParse(formDataToReplyRecord(formData));

  if (!parsed.success) redirectToReplyGuy({ notice: "post_failed" });

  await assertAllowed(admin.userId, "mutation", parsed.data.targetAccountId);

  let postId: string;
  let selectedAccountId: string;
  try {
    const post = await importTargetAccountPost(admin, parsed.data);
    postId = post.id;
    selectedAccountId = post.targetAccountId;
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to import target post", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToReplyGuy({ notice: "post_failed", selected: parsed.data.targetAccountId });
  }

  redirectToReplyGuy({ notice: "post_saved", post: postId, selected: selectedAccountId });
}

export async function pasteTargetPostsAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = targetPostPasteSchema.safeParse(formDataToReplyRecord(formData));

  if (!parsed.success) redirectToReplyGuy({ notice: "post_failed" });

  await assertAllowed(admin.userId, "mutation", parsed.data.targetAccountId);

  let postId: string | undefined;
  try {
    const posts = await importParsedTargetPosts(admin, { posts: parsed.data.posts, targetAccountId: parsed.data.targetAccountId });
    postId = posts[0]?.id;
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to import pasted target posts", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToReplyGuy({ notice: "post_failed", selected: parsed.data.targetAccountId });
  }

  redirectToReplyGuy({ notice: "posts_imported", post: postId, selected: parsed.data.targetAccountId });
}

export async function generateReplyDraftsAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = replyGenerationSchema.safeParse(formDataToReplyRecord(formData));

  if (!parsed.success) redirectToReplyGuy({ notice: "reply_failed" });

  await assertAllowed(admin.userId, "ai", parsed.data.targetAccountId ?? parsed.data.targetPostId ?? undefined);

  let draftId: string | undefined;
  try {
    const result = await generateReplyDrafts(admin, parsed.data);
    draftId = result.drafts[0]?.id;
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to generate reply drafts", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToReplyGuy({ notice: "reply_failed", post: parsed.data.targetPostId ?? undefined, selected: parsed.data.targetAccountId ?? undefined });
  }

  redirectToReplyGuy({ notice: "reply_generated", post: parsed.data.targetPostId ?? undefined, selected: parsed.data.targetAccountId ?? undefined, draft: draftId });
}

export async function markReplyCopiedAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = replyDraftActionSchema.safeParse(formDataToReplyRecord(formData));

  if (!parsed.success) redirectToReplyGuy({ notice: "reply_action_failed" });

  await assertAllowed(admin.userId, "mutation", parsed.data.id);

  let selectedAccountId: string | undefined;
  let targetPostId: string | undefined;
  try {
    const draft = await markReplyDraftCopied(admin, parsed.data);
    selectedAccountId = draft.targetAccountId ?? undefined;
    targetPostId = draft.targetPostId ?? undefined;
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to mark reply copied", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToReplyGuy({ notice: "reply_action_failed" });
  }

  redirectToReplyGuy({ notice: "reply_copied", selected: selectedAccountId, post: targetPostId });
}

export async function markReplyUsedAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = replyDraftActionSchema.safeParse(formDataToReplyRecord(formData));

  if (!parsed.success) redirectToReplyGuy({ notice: "reply_action_failed" });

  await assertAllowed(admin.userId, "mutation", parsed.data.id);

  let selectedAccountId: string | undefined;
  let targetPostId: string | undefined;
  try {
    const draft = await markReplyDraftUsed(admin, parsed.data);
    selectedAccountId = draft.targetAccountId ?? undefined;
    targetPostId = draft.targetPostId ?? undefined;
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to mark reply used", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToReplyGuy({ notice: "reply_action_failed" });
  }

  redirectToReplyGuy({ notice: "reply_used", selected: selectedAccountId, post: targetPostId });
}

export async function createReplyPublishingDraftAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = replyPublishingHandoffSchema.safeParse(formDataToReplyRecord(formData));

  if (!parsed.success) redirectToReplyGuy({ notice: "handoff_failed" });

  await assertAllowed(admin.userId, "mutation", parsed.data.id);

  let selectedAccountId: string | undefined;
  let targetPostId: string | undefined;
  try {
    const result = await createReplyPublishingDraft(admin, parsed.data);
    selectedAccountId = result.replyDraft.targetAccountId ?? undefined;
    targetPostId = result.replyDraft.targetPostId ?? undefined;
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to create reply publishing handoff", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToReplyGuy({ notice: "handoff_failed" });
  }

  redirectToReplyGuy({ notice: "handoff_created", selected: selectedAccountId, post: targetPostId });
}
