"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import {
  approvePublishingDraft,
  cancelPublishingDraft,
  createPublishingDraft,
  createPublishingDraftFromSource,
  retryPublishingJob,
  runDryRunPublishingJob,
  scheduleApprovedDraft,
  updatePublishingDraft,
} from "@/lib/publishing";
import {
  formDataToPublishingRecord,
  publishingCancelSchema,
  publishingDraftApprovalSchema,
  publishingDraftCreateSchema,
  publishingDraftDryRunSchema,
  publishingDraftFromSourceSchema,
  publishingDraftScheduleSchema,
  publishingDraftUpdateSchema,
  publishingJobRetrySchema,
} from "@/lib/publishing/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";

const publishingMutationLimiter = createFixedWindowRateLimiter({
  limit: 80,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

const publishingExecutionLimiter = createFixedWindowRateLimiter({
  limit: 20,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

function redirectToPublishing(params: Record<string, string>): never {
  redirect(`/publishing?${new URLSearchParams(params).toString()}`);
}

async function assertAllowed(userId: string, key: "execute" | "mutation") {
  const limiter = key === "execute" ? publishingExecutionLimiter : publishingMutationLimiter;
  const decision = await limiter.check({ id: `${userId}:publishing:${key}` });

  if (!decision.allowed) {
    redirectToPublishing({ notice: "rate_limited" });
  }
}

export async function createPublishingDraftAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = publishingDraftCreateSchema.safeParse(formDataToPublishingRecord(formData));

  if (!parsed.success) {
    redirectToPublishing({ notice: "draft_create_failed" });
  }

  try {
    const draft = await createPublishingDraft(admin, parsed.data);
    redirectToPublishing({ notice: "draft_created", selected: draft.id });
  } catch (error) {
    console.error("Failed to create publishing draft", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToPublishing({ notice: "draft_create_failed" });
  }
}

export async function createPublishingDraftFromSourceAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = publishingDraftFromSourceSchema.safeParse(formDataToPublishingRecord(formData));

  if (!parsed.success) {
    redirectToPublishing({ notice: "source_handoff_failed" });
  }

  try {
    const draft = await createPublishingDraftFromSource(admin, parsed.data);
    redirectToPublishing({ notice: "draft_created", selected: draft.id });
  } catch (error) {
    console.error("Failed to create publishing draft from source", {
      reason: error instanceof Error ? error.message : "unknown",
      sourceId: parsed.data.sourceId,
      sourceType: parsed.data.sourceType,
    });
    redirectToPublishing({ notice: "source_handoff_failed" });
  }
}

export async function updatePublishingDraftAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = publishingDraftUpdateSchema.safeParse(formDataToPublishingRecord(formData));

  if (!parsed.success) {
    redirectToPublishing({ notice: "draft_update_failed" });
  }

  try {
    const draft = await updatePublishingDraft(admin, parsed.data);
    redirectToPublishing({ notice: "draft_updated", selected: draft.id });
  } catch (error) {
    console.error("Failed to update publishing draft", {
      draftId: parsed.data.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToPublishing({ notice: "draft_update_failed", selected: parsed.data.id });
  }
}

export async function approvePublishingDraftAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = publishingDraftApprovalSchema.safeParse(formDataToPublishingRecord(formData));

  if (!parsed.success) {
    redirectToPublishing({ notice: "draft_approval_failed" });
  }

  try {
    const draft = await approvePublishingDraft(admin, parsed.data);
    redirectToPublishing({ notice: "draft_approved", selected: draft.id });
  } catch (error) {
    console.error("Failed to approve publishing draft", {
      draftId: parsed.data.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToPublishing({ notice: "draft_approval_failed", selected: parsed.data.id });
  }
}

export async function schedulePublishingDraftAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = publishingDraftScheduleSchema.safeParse(formDataToPublishingRecord(formData));

  if (!parsed.success) {
    redirectToPublishing({ notice: "draft_schedule_failed" });
  }

  try {
    const result = await scheduleApprovedDraft(admin, parsed.data);
    redirectToPublishing({ notice: "draft_scheduled", selected: result.draft.id });
  } catch (error) {
    console.error("Failed to schedule publishing draft", {
      draftId: parsed.data.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToPublishing({ notice: "draft_schedule_failed", selected: parsed.data.id });
  }
}

export async function runDryRunPublishingAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "execute");
  const parsed = publishingDraftDryRunSchema.safeParse(formDataToPublishingRecord(formData));

  if (!parsed.success) {
    redirectToPublishing({ notice: "dry_run_failed" });
  }

  try {
    const result = await runDryRunPublishingJob(admin, parsed.data);
    redirectToPublishing({ notice: "dry_run_complete", selected: result.job.draftId });
  } catch (error) {
    console.error("Failed to run dry-run publishing job", {
      draftId: parsed.data.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToPublishing({ notice: "dry_run_failed", selected: parsed.data.id });
  }
}

export async function retryPublishingJobAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "execute");
  const parsed = publishingJobRetrySchema.safeParse(formDataToPublishingRecord(formData));

  if (!parsed.success) {
    redirectToPublishing({ notice: "retry_failed" });
  }

  try {
    const result = await retryPublishingJob(admin, parsed.data);
    redirectToPublishing({ notice: "retry_complete", selected: result.job.draftId });
  } catch (error) {
    console.error("Failed to retry publishing job", {
      jobId: parsed.data.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToPublishing({ notice: "retry_failed" });
  }
}

export async function cancelPublishingDraftAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = publishingCancelSchema.safeParse(formDataToPublishingRecord(formData));

  if (!parsed.success) {
    redirectToPublishing({ notice: "cancel_failed" });
  }

  try {
    const draft = await cancelPublishingDraft(admin, parsed.data);
    redirectToPublishing({ notice: "canceled", selected: draft.id });
  } catch (error) {
    console.error("Failed to cancel publishing draft", {
      draftId: parsed.data.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToPublishing({ notice: "cancel_failed", selected: parsed.data.id });
  }
}
