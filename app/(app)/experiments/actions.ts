"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { rethrowIfRedirect } from "@/lib/server-only/action-redirect";
import { createExperiment, recordExperimentResult, runProfileAudit } from "@/lib/growth";
import { experimentCreateSchema, experimentResultSchema, formDataToGrowthRecord, profileAuditInputSchema } from "@/lib/growth/validation";
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

function redirectToExperiments(params: Record<string, string | undefined>): never {
  const clean = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
  redirect(`/experiments?${new URLSearchParams(clean).toString()}`);
}

async function assertAllowed(userId: string, key: "ai" | "mutation", id?: string) {
  const bucketId = key === "ai" ? `${userId}:growth-experiments:ai` : `${userId}:growth-experiments:mutation${id ? `:${id}` : ""}`;
  const decision = await (key === "ai" ? aiLimiter : mutationLimiter).check({ id: bucketId });
  if (!decision.allowed) redirectToExperiments({ notice: "rate_limited", selectedExperiment: id });
}

export async function createExperimentAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = experimentCreateSchema.safeParse(formDataToGrowthRecord(formData));

  if (!parsed.success) redirectToExperiments({ notice: "experiment_failed" });

  let experimentId: string;
  try {
    const experiment = await createExperiment(admin, parsed.data);
    experimentId = experiment.id;
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to save experiment", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToExperiments({ notice: "experiment_failed" });
  }

  redirectToExperiments({ notice: "experiment_created", selectedExperiment: experimentId });
}

export async function recordExperimentResultAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = experimentResultSchema.safeParse(formDataToGrowthRecord(formData));

  if (!parsed.success) redirectToExperiments({ notice: "experiment_result_failed" });

  await assertAllowed(admin.userId, parsed.data.runAi ? "ai" : "mutation", parsed.data.experimentId);

  try {
    await recordExperimentResult(admin, parsed.data);
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to record experiment result", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToExperiments({ notice: "experiment_result_failed", selectedExperiment: parsed.data.experimentId });
  }

  redirectToExperiments({ notice: "experiment_result_recorded", selectedExperiment: parsed.data.experimentId });
}

export async function runProfileAuditAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "ai");
  const parsed = profileAuditInputSchema.safeParse(formDataToGrowthRecord(formData));

  if (!parsed.success) redirectToExperiments({ notice: "profile_audit_failed" });

  try {
    await runProfileAudit(admin, parsed.data);
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to generate profile audit", { reason: error instanceof Error ? error.message : "unknown" });
    redirectToExperiments({ notice: "profile_audit_failed" });
  }

  redirectToExperiments({ notice: "profile_audit_created" });
}
