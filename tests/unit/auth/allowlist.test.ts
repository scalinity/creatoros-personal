import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { authorizeAdminIdentity, isAdminEmail, parseAdminEmails } from "@/lib/auth/allowlist";
import { redactAuditMetadata, redactAuditString } from "@/lib/audit/redaction";

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

  it("redacts standalone error strings that look like secrets", () => {
    expect(redactAuditString("provider failed with client_secret=abc123")).toBe("[redacted]");
    expect(redactAuditString("database postgresql://user:pass@localhost/db refused connection")).toBe("[redacted]");
    expect(redactAuditString("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature12345 failed")).toBe("[redacted]");
  });
});

