"use server";

import { z } from "zod";
import { redirect } from "next/navigation";

import { logAuditEvent } from "@/lib/audit";

import { authorizeAdminIdentity, normalizeEmail } from "./allowlist";
import { AuthConfigurationError } from "./config";
import { createSupabaseServerClient } from "./supabase";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

function loginRedirect(error: string): never {
  redirect(`/login?${new URLSearchParams({ error }).toString()}`);
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    loginRedirect("invalid_credentials");
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      loginRedirect("auth_unconfigured");
    }

    throw error;
  }

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  const attemptedEmail = normalizeEmail(parsed.data.email);

  if (error || !data.user) {
    await logAuditEvent({
      actorEmail: attemptedEmail,
      error: "invalid_credentials",
      eventType: "login_denied",
      metadata: {
        reason: "invalid_credentials",
      },
      success: false,
    });
    loginRedirect("invalid_credentials");
  }

  const authorization = authorizeAdminIdentity(data.user, process.env.ADMIN_EMAILS);

  if (!authorization.ok) {
    await logAuditEvent({
      actorEmail: authorization.email,
      error: authorization.reason,
      eventType: "login_denied",
      metadata: {
        reason: authorization.reason,
      },
      success: false,
      userId: data.user.id,
    });
    await supabase.auth.signOut();
    loginRedirect("not_allowlisted");
  }

  await logAuditEvent({
    actorEmail: authorization.email,
    eventType: "login_success",
    metadata: {
      method: "password",
    },
    success: true,
    userId: data.user.id,
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await logAuditEvent({
      actorEmail: user.email,
      eventType: "logout",
      metadata: {
        method: "server_action",
      },
      success: true,
      userId: user.id,
    });
  }

  await supabase.auth.signOut();
  redirect("/login?notice=logged_out");
}
