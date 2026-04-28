"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";
import { disconnectXConnection } from "@/lib/x/oauth";
import { runXReadSync } from "@/lib/x/sync";
import { formDataToXRecord, xDisconnectSchema, xReadSyncSchema } from "@/lib/x/validation";

const xConnectionMutationLimiter = createFixedWindowRateLimiter({
  limit: 10,
  store: new MemoryRateLimitStore(),
  windowMs: 60_000,
});

const xSyncLimiter = createFixedWindowRateLimiter({
  limit: 5,
  store: new MemoryRateLimitStore(),
  windowMs: 60 * 60 * 1_000,
});

function redirectToXSettings(notice: string): never {
  redirect(`/settings/x-connection?notice=${encodeURIComponent(notice)}`);
}

async function assertAllowed(userId: string, key: "disconnect" | "sync") {
  const limiter = key === "sync" ? xSyncLimiter : xConnectionMutationLimiter;
  const decision = await limiter.check({ id: `${userId}:settings-x:${key}` });

  if (!decision.allowed) {
    redirectToXSettings("rate_limited");
  }
}

export async function disconnectXConnectionAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "disconnect");
  const parsed = xDisconnectSchema.safeParse(formDataToXRecord(formData));

  if (!parsed.success) {
    redirectToXSettings("disconnect_failed");
  }

  try {
    await disconnectXConnection(admin, {
      deleteImportedPosts: parsed.data.delete_imported_posts,
      deleteSnapshots: parsed.data.delete_snapshots,
    });
    redirectToXSettings("x_disconnected");
  } catch (error) {
    console.error("Settings X disconnect failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToXSettings("disconnect_failed");
  }
}

export async function syncXConnectionAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "sync");
  const parsed = xReadSyncSchema.safeParse(formDataToXRecord(formData));

  if (!parsed.success) {
    redirectToXSettings("live_sync_failed");
  }

  try {
    const result = await runXReadSync(admin, {
      includeMetrics: parsed.data.include_metrics,
      maxPosts: parsed.data.max_posts,
      mode: parsed.data.mode,
    });
    const prefix = parsed.data.mode === "mock" ? "mock" : "live";
    redirectToXSettings(result.status === "succeeded" ? `${prefix}_sync_complete` : `${prefix}_sync_failed`);
  } catch (error) {
    console.error("Settings X sync failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectToXSettings(parsed.data.mode === "mock" ? "mock_sync_failed" : "live_sync_failed");
  }
}
