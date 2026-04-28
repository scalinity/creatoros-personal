import { describe, expect, it } from "vitest";

import { authorizeAdminIdentity, isAdminEmail, parseAdminEmails } from "@/lib/auth/allowlist";
import { redactAuditMetadata } from "@/lib/audit/redaction";

describe("admin allowlist helpers", () => {
  it("normalizes, validates, and deduplicates configured admin emails", () => {
    expect(parseAdminEmails(" Owner@Example.com, bad-value, second@example.com, owner@example.com ")).toEqual([
      "owner@example.com",
      "second@example.com",
    ]);
  });

  it("authorizes only normalized allowlisted identities", () => {
    expect(isAdminEmail("OWNER@example.com", "owner@example.com")).toBe(true);
    expect(isAdminEmail("other@example.com", "owner@example.com")).toBe(false);

    expect(authorizeAdminIdentity({ email: "OWNER@example.com" }, "owner@example.com")).toEqual({
      email: "owner@example.com",
      ok: true,
    });
    expect(authorizeAdminIdentity({ email: "other@example.com" }, "owner@example.com")).toEqual({
      email: "other@example.com",
      ok: false,
      reason: "email_not_allowlisted",
    });
  });
});

describe("audit metadata redaction", () => {
  it("redacts secret-like and email-like metadata without dropping safe context", () => {
    const redacted = redactAuditMetadata({
      actorEmail: "owner@example.com",
      nested: {
        authorization: "Bearer secret-token",
        path: "/dashboard",
      },
      token: "sk-test-secret",
    });

    expect(redacted).toEqual({
      actorEmail: "[redacted]",
      nested: {
        authorization: "[redacted]",
        path: "/dashboard",
      },
      token: "[redacted]",
    });
  });
});

