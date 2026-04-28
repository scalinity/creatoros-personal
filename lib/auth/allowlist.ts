import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email();

export type AdminIdentity = {
  email?: null | string;
};

export type AdminAuthorization =
  | {
      email: string;
      ok: true;
    }
  | {
      email: null | string;
      ok: false;
      reason: "admin_allowlist_empty" | "email_not_allowlisted" | "missing_email";
    };

export function normalizeEmail(email: null | string | undefined): null | string {
  const parsed = emailSchema.safeParse(email);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export function parseAdminEmails(value: null | readonly string[] | string | undefined): string[] {
  const rawEmails = typeof value === "string" ? value.split(",") : value ?? [];
  const seen = new Set<string>();
  const emails: string[] = [];

  for (const rawEmail of rawEmails) {
    const email = normalizeEmail(rawEmail);

    if (!email || seen.has(email)) {
      continue;
    }

    seen.add(email);
    emails.push(email);
  }

  return emails;
}

export function isAdminEmail(email: null | string | undefined, adminEmails: null | readonly string[] | string | undefined) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return false;
  }

  return parseAdminEmails(adminEmails).includes(normalizedEmail);
}

export function authorizeAdminIdentity(
  identity: AdminIdentity,
  adminEmails: null | readonly string[] | string | undefined,
): AdminAuthorization {
  const email = normalizeEmail(identity.email);

  if (!email) {
    return {
      email: null,
      ok: false,
      reason: "missing_email",
    };
  }

  const allowlist = parseAdminEmails(adminEmails);

  if (allowlist.length === 0) {
    return {
      email,
      ok: false,
      reason: "admin_allowlist_empty",
    };
  }

  if (!allowlist.includes(email)) {
    return {
      email,
      ok: false,
      reason: "email_not_allowlisted",
    };
  }

  return {
    email,
    ok: true,
  };
}
