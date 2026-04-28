"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { TokenSettingsActionState } from "@/components/settings/tokens";
import { logAuditEvent } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/admin";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";
import {
  createPersonalSaveToken,
  revokePersonalSaveToken,
  rotatePersonalSaveToken,
} from "@/lib/tokens/personal-save-tokens";

const tokenLimiter = createFixedWindowRateLimiter({
  limit: 10,
  store: new MemoryRateLimitStore(),
  windowMs: 24 * 60 * 60 * 1_000,
});

const tokenActionSchema = z.discriminatedUnion("operation", [
  z.object({
    expires_at: z.string().trim().optional(),
    name: z.string().trim().min(1).max(120),
    operation: z.literal("create"),
    rate_limit_per_hour: z.coerce.number().int().min(1).max(240).optional(),
  }),
  z.object({
    id: z.string().trim().min(1),
    operation: z.literal("revoke"),
    reason: z.string().trim().optional(),
  }),
  z.object({
    id: z.string().trim().min(1),
    operation: z.literal("rotate"),
  }),
]);

function formRecord(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function assertAllowed(userId: string) {
  const decision = await tokenLimiter.check({ id: `${userId}:settings:tokens` });
  if (!decision.allowed) {
    return false;
  }
  return true;
}

function sanitizeAuditReason(error: unknown) {
  const reason = error instanceof Error ? error.message : "unknown";
  return reason.replace(/cos_live_[A-Za-z0-9_-]+/g, "[redacted_token]").replace(/pst_v1\$\S+/g, "[redacted_hash]").slice(0, 300);
}

function tokenOperationTarget(input: z.infer<typeof tokenActionSchema>) {
  return input.operation === "create" ? null : input.id;
}

export async function tokenSettingsAction(_state: TokenSettingsActionState, formData: FormData): Promise<TokenSettingsActionState> {
  const admin = await requireAdmin();
  const parsed = tokenActionSchema.safeParse(formRecord(formData));

  if (!parsed.success) {
    return { message: "Token request failed validation.", ok: false };
  }

  const allowed = await assertAllowed(admin.userId);
  if (!allowed) {
    return { message: "Token settings rate limit reached.", ok: false };
  }

  try {
    if (parsed.data.operation === "create") {
      const result = await createPersonalSaveToken(admin, {
        expiresAt: parsed.data.expires_at || null,
        name: parsed.data.name,
        rateLimitPerHour: parsed.data.rate_limit_per_hour,
      });
      revalidatePath("/settings/tokens");
      return {
        message: "Personal save token created. Store it now; the raw token will not be shown again.",
        ok: true,
        rawToken: result.rawToken,
        tokenPrefix: result.token.tokenPrefix,
      };
    }

    if (parsed.data.operation === "revoke") {
      await revokePersonalSaveToken(admin, { id: parsed.data.id, reason: parsed.data.reason });
      revalidatePath("/settings/tokens");
      return { message: "Personal save token revoked.", ok: true };
    }

    const result = await rotatePersonalSaveToken(admin, { id: parsed.data.id });
    revalidatePath("/settings/tokens");
    return {
      message: "Personal save token rotated. Store the new raw token now; it will not be shown again.",
      ok: true,
      rawToken: result.rawToken,
      tokenPrefix: result.token.tokenPrefix,
    };
  } catch (error) {
    const reason = sanitizeAuditReason(error);
    await logAuditEvent({
      actorEmail: admin.email,
      error: reason,
      eventType: "personal_save_token_operation_failed",
      metadata: {
        operation: parsed.data.operation,
        phase: "20-inspiration-library-and-extension-save-token",
        reason,
      },
      success: false,
      targetId: tokenOperationTarget(parsed.data),
      targetType: "personal_save_token",
      userId: admin.userId,
    });
    console.error("Token settings action failed", {
      operation: parsed.data.operation,
      reason,
    });
    return { message: "Token operation could not be completed safely.", ok: false };
  }
}
