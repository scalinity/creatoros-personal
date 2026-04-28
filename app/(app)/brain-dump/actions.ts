"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { transformBrainDump, saveBrainDumpGeneratedOutput } from "@/lib/brain-dumps";
import { brainDumpInputSchema, brainDumpSaveOutputSchema } from "@/lib/brain-dumps/validation";
import { formDataToContentRecord } from "@/lib/content/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";

const transformLimiter = createFixedWindowRateLimiter({
  limit: 12,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

const saveLimiter = createFixedWindowRateLimiter({
  limit: 160,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

function redirectWithNotice(params: Record<string, string>): never {
  redirect(`/brain-dump?${new URLSearchParams(params).toString()}`);
}

async function assertAllowed(userId: string, key: "save" | "transform") {
  const limiter = key === "transform" ? transformLimiter : saveLimiter;
  const decision = await limiter.check({ id: `${userId}:brain-dump:${key}` });

  if (!decision.allowed) {
    redirectWithNotice({ notice: "rate_limited" });
  }
}

export async function transformBrainDumpAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "transform");
  const parsed = brainDumpInputSchema.safeParse(formDataToContentRecord(formData));

  if (!parsed.success) {
    redirectWithNotice({ notice: "brain_dump_validation_failed" });
  }

  let dumpId: string;

  try {
    const dump = await transformBrainDump(admin, parsed.data);
    dumpId = dump.id;
  } catch (error) {
    console.error("Brain dump transformation failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectWithNotice({ notice: "brain_dump_failed" });
  }

  redirectWithNotice({ notice: "brain_dump_created", selected: dumpId });
}

export async function saveBrainDumpOutputAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "save");
  const parsed = brainDumpSaveOutputSchema.safeParse(formDataToContentRecord(formData));

  if (!parsed.success) {
    redirectWithNotice({ notice: "brain_dump_output_validation_failed" });
  }

  try {
    await saveBrainDumpGeneratedOutput(admin, parsed.data);
  } catch (error) {
    console.error("Failed to save brain dump generated output", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectWithNotice({ notice: "brain_dump_output_failed", selected: parsed.data.brainDumpId });
  }

  redirectWithNotice({ notice: "brain_dump_output_saved", selected: parsed.data.brainDumpId });
}
