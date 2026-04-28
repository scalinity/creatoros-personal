import { SettingsSectionPage } from "@/components/settings";
import { getOperationalDiagnostics } from "@/lib/server-only/diagnostics";

export const dynamic = "force-dynamic";

export default function DiagnosticsSettingsPage() {
  const diagnostics = getOperationalDiagnostics();

  return (
    <SettingsSectionPage
      actions={[
        {
          href: "/api/diagnostics",
          label: "Open JSON diagnostics",
          note: "Protected endpoint returns the same sanitized presence groups.",
          tone: "secondary",
        },
      ]}
      description="Operational diagnostics for auth, database, AI config, X config, cron secret, security utilities, and design-system readiness. Secret values and token material are never rendered."
      diagnostics={diagnostics}
      folio="§ 23"
      introRows={[
        { label: "Envelope", value: "Stable JSON response available at /api/diagnostics" },
        { label: "Redaction", value: "Only present, missing, or invalid states are displayed" },
        { label: "Design system", value: "Card, KeyValueRows, Table, and Badge primitives are active" },
      ]}
      title="Diagnostics"
    />
  );
}
