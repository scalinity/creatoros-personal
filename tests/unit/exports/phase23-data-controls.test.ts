import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DATA_DELETE_TABLE_ORDER, buildDataExportCsv, redactExportRow } from "@/lib/exports";

describe("Phase 23 data export and delete hardening", () => {
  it("redacts token material and secrets from exported rows", () => {
    const redactedX = redactExportRow("x_connections", {
      encrypted_access_token: "access-secret",
      encrypted_refresh_token: "refresh-secret",
      id: "x-1",
      metadata: { nested_token: "Bearer abcdefghijklmnop" },
      username: "owner",
    });
    const redactedToken = redactExportRow("personal_save_tokens", {
      id: "token-1",
      name: "Extension",
      token_hash: "hash-secret",
      token_prefix: "cos_live_1234",
    });

    const serialized = JSON.stringify({ redactedToken, redactedX });

    expect(serialized).not.toContain("access-secret");
    expect(serialized).not.toContain("refresh-secret");
    expect(serialized).not.toContain("hash-secret");
    expect(serialized).not.toContain("cos_live_1234");
    expect(serialized).not.toContain("Bearer abcdefghijklmnop");
    expect(redactedX).toMatchObject({ encrypted_access_token: "[redacted]", encrypted_refresh_token: "[redacted]" });
    expect(redactedToken).toMatchObject({ token_hash: "[redacted]", token_prefix: "[redacted]" });
  });

  it("serializes a multi-table archive to CSV without leaking sensitive values", () => {
    const csv = buildDataExportCsv({
      exported_at: "2026-04-28T12:00:00.000Z",
      include_logs: false,
      owner_user_id: "owner-1",
      phase: "23-hardening-export-delete-observability",
      redaction: "Secrets redacted.",
      tables: {
        x_connections: [
          redactExportRow("x_connections", {
            encrypted_access_token: "access-secret",
            id: "x-1",
            status: "connected",
            user_id: "owner-1",
          }),
        ],
      },
    });

    expect(csv).toContain("table,row_index,record_json");
    expect(csv).toContain("x_connections");
    expect(csv).not.toContain("access-secret");
    expect(csv).toContain("[redacted]");
  });

  it("clears token tables before deleting dependent owner data", () => {
    expect(DATA_DELETE_TABLE_ORDER[0]).toBe("personal_save_tokens");
    expect(DATA_DELETE_TABLE_ORDER[1]).toBe("x_connections");
    expect(DATA_DELETE_TABLE_ORDER.indexOf("publishing_failures")).toBeLessThan(DATA_DELETE_TABLE_ORDER.indexOf("publishing_jobs"));
    expect(DATA_DELETE_TABLE_ORDER.indexOf("publishing_jobs")).toBeLessThan(DATA_DELETE_TABLE_ORDER.indexOf("publishing_drafts"));
    expect(DATA_DELETE_TABLE_ORDER.indexOf("blog_versions")).toBeLessThan(DATA_DELETE_TABLE_ORDER.indexOf("blog_posts"));
    expect(DATA_DELETE_TABLE_ORDER.indexOf("account_research_reports")).toBeLessThan(DATA_DELETE_TABLE_ORDER.indexOf("target_accounts"));
    expect(DATA_DELETE_TABLE_ORDER.at(-1)).toBe("audit_logs");
  });
});
