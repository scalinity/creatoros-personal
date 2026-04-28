import { SettingsSectionPage } from "@/components/settings";
import { getOperationalDiagnostics } from "@/lib/server-only/diagnostics";

export const dynamic = "force-dynamic";

export default function XConnectionSettingsPage() {
  const diagnostics = getOperationalDiagnostics();

  return (
    <SettingsSectionPage
      description="X connection readiness, OAuth config presence, and publishing-scope guardrails. Actual X OAuth, sync, token refresh, and write capability flags are intentionally not implemented in this phase."
      diagnostics={diagnostics}
      folio="§ 19"
      groupIds={["x", "security"]}
      introRows={[
        { label: "Connection", value: "Not connected; OAuth flow deferred" },
        { label: "Token storage", value: "Encryption helper implemented; no X token material exists yet" },
        { label: "Publishing", value: "Disabled until OAuth, scope escalation, approval, and audit phases are complete" },
      ]}
      title="X Connection Settings"
    />
  );
}
