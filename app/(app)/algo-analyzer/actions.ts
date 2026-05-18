"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { rethrowIfRedirect } from "@/lib/server-only/action-redirect";
import { formDataToContentRecord } from "@/lib/content/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";
import { runAlgoAnalysis, saveAnalyzerRewriteAsIdea, saveAnalyzerRewriteAsOutput } from "@/lib/algo-analyzer";
import { algoAnalyzerInputSchema, analyzerSaveIdeaSchema, analyzerSaveOutputSchema } from "@/lib/algo-analyzer/validation";

const analyzeLimiter = createFixedWindowRateLimiter({
  limit: 20,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

const saveLimiter = createFixedWindowRateLimiter({
  limit: 120,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

function redirectWithNotice(params: Record<string, string>): never {
  redirect(`/algo-analyzer?${new URLSearchParams(params).toString()}`);
}

async function assertAllowed(userId: string, key: string, notice: string) {
  const decision = await (key === "analyze" ? analyzeLimiter : saveLimiter).check({ id: `${userId}:algo-analyzer:${key}` });

  if (!decision.allowed) {
    redirectWithNotice({ notice });
  }
}

export async function analyzeDraftAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "analyze", "rate_limited");
  const parsed = algoAnalyzerInputSchema.safeParse(formDataToContentRecord(formData));

  if (!parsed.success) {
    redirectWithNotice({ notice: "analysis_validation_failed" });
  }

  let reportId: string;

  try {
    const report = await runAlgoAnalysis(admin, parsed.data);
    reportId = report.id;
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Algorithm analysis failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectWithNotice({ notice: "analysis_failed" });
  }

  redirectWithNotice({ notice: "analysis_created", selected: reportId });
}

export async function saveAnalyzerRewriteOutputAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "save-output", "rate_limited");
  const parsed = analyzerSaveOutputSchema.safeParse(formDataToContentRecord(formData));

  if (!parsed.success) {
    redirectWithNotice({ notice: "rewrite_output_validation_failed" });
  }

  try {
    await saveAnalyzerRewriteAsOutput(admin, parsed.data);
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to save analyzer rewrite output", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectWithNotice({ notice: "rewrite_output_failed", selected: parsed.data.reportId });
  }

  redirectWithNotice({ notice: "rewrite_output_saved", selected: parsed.data.reportId });
}

export async function saveAnalyzerRewriteIdeaAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "save-idea", "rate_limited");
  const parsed = analyzerSaveIdeaSchema.safeParse(formDataToContentRecord(formData));

  if (!parsed.success) {
    redirectWithNotice({ notice: "rewrite_idea_validation_failed" });
  }

  try {
    await saveAnalyzerRewriteAsIdea(admin, parsed.data);
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to save analyzer rewrite idea", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectWithNotice({ notice: "rewrite_idea_failed", selected: parsed.data.reportId });
  }

  redirectWithNotice({ notice: "rewrite_idea_saved", selected: parsed.data.reportId });
}
