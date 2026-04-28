"use server";

import { redirect } from "next/navigation";

import { refreshEmbeddingsForUser } from "@/lib/embeddings";
import { requireAdmin } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";
import { generateVoiceProfile } from "@/lib/voice";

const voiceLimiter = createFixedWindowRateLimiter({
  limit: 5,
  store: new MemoryRateLimitStore(),
  windowMs: 24 * 60 * 60 * 1_000,
});

const embeddingLimiter = createFixedWindowRateLimiter({
  limit: 10,
  store: new MemoryRateLimitStore(),
  windowMs: 24 * 60 * 60 * 1_000,
});

function redirectWithNotice(notice: string): never {
  redirect(`/settings/ai?notice=${encodeURIComponent(notice)}`);
}

async function assertAllowed(userId: string, key: "embeddings" | "voice") {
  const limiter = key === "voice" ? voiceLimiter : embeddingLimiter;
  const decision = await limiter.check({ id: `${userId}:settings-ai:${key}` });

  if (!decision.allowed) {
    redirectWithNotice("rate_limited");
  }
}

export async function recomputeVoiceProfileAction() {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "voice");
  let profileId: string;

  try {
    const profile = await generateVoiceProfile(admin);
    profileId = profile.id;
  } catch (error) {
    console.error("Voice profile recompute failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    redirectWithNotice("voice_profile_failed");
  }

  redirect(`/settings/ai?notice=voice_profile_generated&profile=${encodeURIComponent(profileId)}`);
}

export async function refreshEmbeddingsAction() {
  const admin = await requireAdmin();
  await assertAllowed(admin.userId, "embeddings");
  let notice = "embedding_refresh_fallback";

  try {
    const result = await refreshEmbeddingsForUser(admin);
    notice = result.mode === "embedding" ? "embedding_refresh_completed" : "embedding_refresh_fallback";
  } catch (error) {
    console.error("Embedding refresh failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }

  redirectWithNotice(notice);
}
