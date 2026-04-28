import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SettingsSectionPage, statusBadgeVariant } from "@/components/settings";
import type { OperationalDiagnostics } from "@/lib/server-only/diagnostics";

const diagnostics = {
  checkedAt: "2026-04-28T00:00:00.000Z",
  env: {
    checked: [],
    invalid: [],
    missing: [],
    valid: true,
  },
  groups: [
    {
      id: "auth",
      label: "Auth",
      status: "ready",
      summary: "Supabase auth and ADMIN_EMAILS are configured.",
      items: [
        { key: "SUPABASE_URL", label: "Supabase URL", state: "present", secret: false },
        { key: "ADMIN_EMAILS", label: "Admin allowlist", state: "present", secret: true },
      ],
    },
    {
      id: "x",
      label: "X Config",
      status: "degraded",
      summary: "X OAuth is not implemented in Phase 08.",
      items: [{ key: "X_CLIENT_SECRET", label: "Client secret", state: "missing", secret: true }],
    },
  ],
  overall: "degraded",
  phase: "23-hardening-export-delete-observability",
  runtime: null,
  service: "creatoros-personal",
} satisfies OperationalDiagnostics;

describe("settings components", () => {
  it("maps diagnostics statuses to safe badge variants", () => {
    expect(statusBadgeVariant("ready")).toBe("success");
    expect(statusBadgeVariant("degraded")).toBe("warning");
    expect(statusBadgeVariant("missing")).toBe("danger");
    expect(statusBadgeVariant("scaffolded")).toBe("outline");
  });

  it("renders dense settings pages without secret values", () => {
    const markup = renderToStaticMarkup(
      React.createElement(SettingsSectionPage, {
        actions: [
          { href: "/api/data/export?format=json", label: "Export scaffold", tone: "secondary" },
          { disabled: true, label: "Delete disabled", tone: "destructive" },
        ],
        description: "Safe settings surface for Phase 08.",
        diagnostics,
        folio: "§ 21",
        title: "Data Settings",
      }),
    );

    expect(markup).toContain("settings-page");
    expect(markup).toContain("Data Settings");
    expect(markup).toContain("kv-row");
    expect(markup).toContain("table-wrap");
    expect(markup).toContain("Client secret");
    expect(markup).toContain("secret presence only");
    expect(markup).not.toContain("service-role-placeholder");
    expect(markup).not.toContain("x-client-secret-placeholder");
  });
});
