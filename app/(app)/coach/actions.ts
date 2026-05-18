"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { rethrowIfRedirect } from "@/lib/server-only/action-redirect";
import { answerCoachQuestion, coachQuestionSchema, generateContentPlaybook } from "@/lib/coach";
import { formDataToContentRecord } from "@/lib/content/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";

const coachChatLimiter = createFixedWindowRateLimiter({
  limit: 30,
  store: new MemoryRateLimitStore(),
  windowMs: 24 * 60 * 60 * 1_000,
});

const playbookLimiter = createFixedWindowRateLimiter({
  limit: 10,
  store: new MemoryRateLimitStore(),
  windowMs: 24 * 60 * 60 * 1_000,
});

function redirectToCoach(params: Record<string, string>): never {
  redirect(`/coach?${new URLSearchParams(params).toString()}`);
}

async function assertAllowed(userId: string, key: "chat" | "playbook") {
  const limiter = key === "chat" ? coachChatLimiter : playbookLimiter;
  const decision = await limiter.check({ id: `${userId}:coach:${key}` });

  if (!decision.allowed) {
    redirectToCoach({ notice: "rate_limited" });
  }
}

export async function askCoachAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "chat");
  const parsed = coachQuestionSchema.safeParse(formDataToContentRecord(formData));

  if (!parsed.success) {
    redirectToCoach({ notice: "coach_validation_failed" });
  }

  try {
    const result = await answerCoachQuestion(admin, parsed.data);
    redirectToCoach({ notice: "coach_generated", selected: result.report.id });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Coach question failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToCoach({ notice: "coach_failed" });
  }
}

export async function generateCoachPlaybookAction() {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "playbook");

  try {
    const result = await generateContentPlaybook(admin);
    redirectToCoach({ notice: "playbook_generated", selected: result.report.id });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Coach playbook generation failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToCoach({ notice: "coach_failed" });
  }
}
