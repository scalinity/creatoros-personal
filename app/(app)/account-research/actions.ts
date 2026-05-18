"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { rethrowIfRedirect } from "@/lib/server-only/action-redirect";
import { runAccountResearch, saveAccountResearchIdea } from "@/lib/account-research";
import { accountResearchIdeaSaveSchema, accountResearchInputSchema, formDataToAccountResearchRecord } from "@/lib/account-research/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";

const researchLimiter = createFixedWindowRateLimiter({
  limit: 20,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

const ideaLimiter = createFixedWindowRateLimiter({
  limit: 60,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

function redirectToResearch(params: Record<string, string | undefined>): never {
  const clean = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
  redirect(`/account-research?${new URLSearchParams(clean).toString()}`);
}

async function assertAllowed(userId: string, key: "idea" | "research", id?: string) {
  const decision = await (key === "research" ? researchLimiter : ideaLimiter).check({ id: `${userId}:account-research:${key}${id ? `:${id}` : ""}` });
  if (!decision.allowed) redirectToResearch({ notice: "rate_limited", selected: id });
}

export async function runAccountResearchAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = accountResearchInputSchema.safeParse(formDataToAccountResearchRecord(formData));

  if (!parsed.success) redirectToResearch({ notice: "research_failed" });

  await assertAllowed(admin.userId, "research", parsed.data.targetAccountId ?? parsed.data.username ?? undefined);

  let reportId: string;
  try {
    const result = await runAccountResearch(admin, parsed.data);
    reportId = result.report.id;
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to run account research", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToResearch({ notice: "research_failed" });
  }

  redirectToResearch({ notice: "research_created", selected: reportId });
}

export async function saveAccountResearchIdeaAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = accountResearchIdeaSaveSchema.safeParse(formDataToAccountResearchRecord(formData));

  if (!parsed.success) redirectToResearch({ notice: "idea_failed" });

  await assertAllowed(admin.userId, "idea", parsed.data.reportId);

  try {
    await saveAccountResearchIdea(admin, parsed.data);
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to save account research idea", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToResearch({ notice: "idea_failed", selected: parsed.data.reportId });
  }

  redirectToResearch({ notice: "idea_saved", selected: parsed.data.reportId });
}
