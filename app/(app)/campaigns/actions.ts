"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { rethrowIfRedirect } from "@/lib/server-only/action-redirect";
import { addCampaignItem, createCampaign, createContentPillar, createGrowthGoal, runMonthlyGrowthReview, runWeeklyGrowthReview } from "@/lib/growth";
import { campaignCreateSchema, campaignItemCreateSchema, formDataToGrowthRecord, goalCreateSchema, monthlyReviewSchema, pillarCreateSchema, weeklyReviewSchema } from "@/lib/growth/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";

const mutationLimiter = createFixedWindowRateLimiter({
  limit: 80,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

const aiLimiter = createFixedWindowRateLimiter({
  limit: 20,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

function redirectToCampaigns(params: Record<string, string | undefined>): never {
  const clean = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
  redirect(`/campaigns?${new URLSearchParams(clean).toString()}`);
}

async function assertAllowed(userId: string, key: "ai" | "mutation", id?: string) {
  const decision = await (key === "ai" ? aiLimiter : mutationLimiter).check({ id: `${userId}:growth-campaigns:${key}${id ? `:${id}` : ""}` });
  if (!decision.allowed) redirectToCampaigns({ notice: "rate_limited", selectedCampaign: id });
}

export async function createGrowthGoalAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = goalCreateSchema.safeParse(formDataToGrowthRecord(formData));

  if (!parsed.success) redirectToCampaigns({ notice: "goal_failed" });

  try {
    await createGrowthGoal(admin, parsed.data);
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to save growth goal", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToCampaigns({ notice: "goal_failed" });
  }

  redirectToCampaigns({ notice: "goal_created" });
}

export async function createContentPillarAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = pillarCreateSchema.safeParse(formDataToGrowthRecord(formData));

  if (!parsed.success) redirectToCampaigns({ notice: "pillar_failed" });

  try {
    await createContentPillar(admin, parsed.data);
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to save content pillar", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToCampaigns({ notice: "pillar_failed" });
  }

  redirectToCampaigns({ notice: "pillar_created" });
}

export async function createCampaignAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = campaignCreateSchema.safeParse(formDataToGrowthRecord(formData));

  if (!parsed.success) redirectToCampaigns({ notice: "campaign_failed" });

  // L-9: same pattern as blogs/actions.ts — initialize defensively.
  let campaignId = "";
  try {
    const campaign = await createCampaign(admin, parsed.data);
    campaignId = campaign.id;
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to save campaign", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToCampaigns({ notice: "campaign_failed" });
  }

  redirectToCampaigns({ notice: "campaign_created", selectedCampaign: campaignId });
}

export async function addCampaignItemAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = campaignItemCreateSchema.safeParse(formDataToGrowthRecord(formData));

  if (!parsed.success) redirectToCampaigns({ notice: "campaign_item_failed" });

  await assertAllowed(admin.userId, "mutation", parsed.data.campaignId);

  try {
    await addCampaignItem(admin, parsed.data);
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to link campaign item", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToCampaigns({ notice: "campaign_item_failed", selectedCampaign: parsed.data.campaignId });
  }

  redirectToCampaigns({ notice: "campaign_item_created", selectedCampaign: parsed.data.campaignId });
}

export async function runWeeklyGrowthReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "ai");
  const parsed = weeklyReviewSchema.safeParse(formDataToGrowthRecord(formData));

  if (!parsed.success) redirectToCampaigns({ notice: "weekly_review_failed" });

  try {
    await runWeeklyGrowthReview(admin, parsed.data);
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to generate weekly growth review", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToCampaigns({ notice: "weekly_review_failed" });
  }

  redirectToCampaigns({ notice: "weekly_review_created" });
}

export async function runMonthlyGrowthReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "ai");
  const parsed = monthlyReviewSchema.safeParse(formDataToGrowthRecord(formData));

  if (!parsed.success) redirectToCampaigns({ notice: "monthly_review_failed" });

  try {
    await runMonthlyGrowthReview(admin, parsed.data);
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to generate monthly growth review", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToCampaigns({ notice: "monthly_review_failed" });
  }

  redirectToCampaigns({ notice: "monthly_review_created" });
}
