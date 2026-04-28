import { SettingsSectionPage } from "@/components/settings";
import { getOperationalDiagnostics } from "@/lib/server-only/diagnostics";

export const dynamic = "force-dynamic";

export default function DataSettingsPage() {
  const diagnostics = getOperationalDiagnostics();

  return (
    <SettingsSectionPage
      actions={[
        {
          href: "/api/data/export?format=json",
          label: "Export scaffold",
          note: "Returns a protected JSON envelope only; no full archive is generated yet.",
          tone: "secondary",
        },
        {
          disabled: true,
          label: "Delete disabled",
          note: "The DELETE endpoint is a guarded no-op scaffold that requires exact confirmation.",
          tone: "destructive",
        },
      ]}
      description="Data export and deletion controls for the private workspace. This phase adds protected scaffold endpoints only; no destructive database delete is exposed in the UI."
      diagnostics={diagnostics}
      folio="§ 21"
      groupIds={["database", "security"]}
      introRows={[
        { label: "Export endpoint", mono: true, value: "GET /api/data/export?format=json" },
        { label: "Delete endpoint", mono: true, value: "DELETE /api/data/delete" },
        { label: "Live behavior", value: "Safe scaffold: audit attempt, no decrypted tokens, no secret values, no destructive UI action" },
      ]}
      title="Data Settings"
    />
  );
}
