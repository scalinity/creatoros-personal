"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { rethrowIfRedirect } from "@/lib/server-only/action-redirect";
import {
  createInspiration,
  deleteInspiration,
  transformInspiration,
  updateInspiration,
} from "@/lib/inspiration";
import {
  formDataToInspirationRecord,
  inspirationDeleteSchema,
  inspirationSaveSchema,
  inspirationTransformSchema,
  inspirationUpdateSchema,
} from "@/lib/inspiration/validation";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";

const mutationLimiter = createFixedWindowRateLimiter({
  limit: 80,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

const transformLimiter = createFixedWindowRateLimiter({
  limit: 20,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

function redirectToInspiration(params: Record<string, string>): never {
  redirect(`/inspiration?${new URLSearchParams(params).toString()}`);
}

async function assertAllowed(userId: string, key: "mutation" | "transform", id?: string) {
  const limiter = key === "transform" ? transformLimiter : mutationLimiter;
  const decision = await limiter.check({ id: `${userId}:inspiration:${key}${id ? `:${id}` : ""}` });

  if (!decision.allowed) {
    redirectToInspiration({ notice: "rate_limited", ...(id ? { selected: id } : {}) });
  }
}

export async function createInspirationAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "mutation");
  const parsed = inspirationSaveSchema.safeParse(formDataToInspirationRecord(formData));

  if (!parsed.success) {
    redirectToInspiration({ notice: "save_failed" });
  }

  try {
    const result = await createInspiration(admin, parsed.data, { source: "in_app" });
    redirectToInspiration({ notice: result.duplicate ? "duplicate" : "saved", selected: result.inspiration.id });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to create inspiration", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToInspiration({ notice: "save_failed" });
  }
}

export async function updateInspirationAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = inspirationUpdateSchema.safeParse(formDataToInspirationRecord(formData));

  if (!parsed.success) {
    redirectToInspiration({ notice: "update_failed" });
  }

  await assertAllowed(admin.userId, "mutation", parsed.data.id);

  try {
    const item = await updateInspiration(admin, parsed.data);
    redirectToInspiration({ notice: "updated", selected: item.id });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to update inspiration", {
      id: parsed.data.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToInspiration({ notice: "update_failed", selected: parsed.data.id });
  }
}

export async function deleteInspirationAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = inspirationDeleteSchema.safeParse(formDataToInspirationRecord(formData));

  if (!parsed.success) {
    redirectToInspiration({ notice: "delete_failed" });
  }

  await assertAllowed(admin.userId, "mutation", parsed.data.id);

  try {
    await deleteInspiration(admin, parsed.data);
    redirectToInspiration({ notice: "deleted" });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to delete inspiration", {
      id: parsed.data.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToInspiration({ notice: "delete_failed", selected: parsed.data.id });
  }
}

export async function transformInspirationAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = inspirationTransformSchema.safeParse(formDataToInspirationRecord(formData));

  if (!parsed.success) {
    redirectToInspiration({ notice: "transform_failed" });
  }

  await assertAllowed(admin.userId, "transform", parsed.data.id);

  try {
    const result = await transformInspiration(admin, parsed.data);
    redirectToInspiration({ notice: "transformed", selected: result.inspiration.id });
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Failed to transform inspiration", {
      id: parsed.data.id,
      mode: parsed.data.mode,
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToInspiration({ notice: "transform_failed", selected: parsed.data.id });
  }
}
