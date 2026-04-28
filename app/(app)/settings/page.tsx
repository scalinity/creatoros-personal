import { SettingsSectionPage } from "@/components/settings";
import { getOperationalDiagnostics } from "@/lib/server-only/diagnostics";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const diagnostics = getOperationalDiagnostics();

  return (
    <SettingsSectionPage
      description="Private configuration surfaces for connections, AI routing, data controls, save tokens, and operational diagnostics. Values are intentionally redacted to presence-only states."
      diagnostics={diagnostics}
      folio="§ 18"
      introRows={[
        { label: "Access", value: "Protected by Supabase session and ADMIN_EMAILS allowlist" },
        { label: "Secrets", value: "Never rendered to browser; diagnostics show present, missing, or invalid only" },
        { label: "Phase", value: "Settings and diagnostics live; token issuance and X OAuth remain later-phase work" },
      ]}
      title="Settings"
    />
  );
}
