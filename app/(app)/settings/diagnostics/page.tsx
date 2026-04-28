import { SettingsSectionPage } from "@/components/settings";
import { requireAdmin } from "@/lib/auth/admin";
import { getOperationalDiagnosticsForAdmin } from "@/lib/server-only/diagnostics";

export const dynamic = "force-dynamic";

export default async function DiagnosticsSettingsPage() {
  const admin = await requireAdmin();
  const diagnostics = await getOperationalDiagnosticsForAdmin(admin);

  return (
    <SettingsSectionPage
      actions={[
        {
          href: "/api/diagnostics",
          label: "Open JSON diagnostics",
          note: "Protected endpoint returns sanitized config and runtime failure groups.",
          tone: "secondary",
        },
      ]}
      description="Operational diagnostics for auth, database, AI config, X config, publishing, job queues, cron, personal tokens, recent failures, security utilities, and design-system readiness. Secret values and token material are never rendered."
      diagnostics={diagnostics}
      folio="§ 23"
      introRows={[
        { label: "Envelope", value: "Stable JSON response available at /api/diagnostics" },
        { label: "Redaction", value: "Secrets are displayed as present, missing, invalid, or redacted states only" },
        { label: "Runtime", value: "AI jobs, sync jobs, publishing failures, scheduled queue, token lifecycle, and recent failures are summarized" },
      ]}
      title="Diagnostics"
    />
  );
}
