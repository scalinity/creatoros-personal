"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { redactAuditString } from "@/lib/audit/redaction";
import { requireAdmin } from "@/lib/auth/admin";
import { rethrowIfRedirect } from "@/lib/server-only/action-redirect";
import { deleteOwnerData } from "@/lib/exports";
import { createFixedWindowRateLimiter, MemoryRateLimitStore } from "@/lib/rate-limit";

const dataDeleteActionLimiter = createFixedWindowRateLimiter({
  limit: 1,
  store: new MemoryRateLimitStore(),
  windowMs: 24 * 60 * 60 * 1_000,
});

const deleteDataActionSchema = z.object({
  confirmation: z.literal("DELETE_CREATOROS_PERSONAL_DATA"),
  delete_auth_user: z.union([z.literal("on"), z.literal("true")]).optional().transform(Boolean),
});

function formRecord(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function redirectToDataSettings(notice: string): never {
  redirect(`/settings/data?notice=${encodeURIComponent(notice)}`);
}

export async function deleteWorkspaceDataAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = deleteDataActionSchema.safeParse(formRecord(formData));

  if (!parsed.success) {
    redirectToDataSettings("delete_confirmation_invalid");
  }

  const decision = await dataDeleteActionLimiter.check({ id: `${admin.userId}:settings-data-delete` });
  if (!decision.allowed) {
    redirectToDataSettings("delete_rate_limited");
  }

  try {
    const requestHeaders = new Headers(await headers());
    await deleteOwnerData(
      admin,
      {
        confirmation: parsed.data.confirmation,
        deleteAuthUser: parsed.data.delete_auth_user,
      },
      {
        request: {
          headers: requestHeaders,
          url: "/settings/data",
        },
      },
    );
  } catch (error) {
    rethrowIfRedirect(error);
    console.error("Settings data delete failed", {
      reason: redactAuditString(error instanceof Error ? error.message : "unknown data delete failure"),
    });
    redirectToDataSettings("delete_failed");
  }

  redirectToDataSettings("data_deleted");
}
