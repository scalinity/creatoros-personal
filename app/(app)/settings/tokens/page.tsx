import { SettingsSectionPage } from "@/components/settings";
import { getOperationalDiagnostics } from "@/lib/server-only/diagnostics";

export const dynamic = "force-dynamic";

export default function TokenSettingsPage() {
  const diagnostics = getOperationalDiagnostics();

  return (
    <SettingsSectionPage
      actions={[
        {
          disabled: true,
          label: "Issue token later",
          note: "Token issuance, shown-once display, and CRUD are deferred to the extension phase.",
          tone: "secondary",
        },
      ]}
      description="Personal save-token utility status for future extension ingestion. Hashing and prefix helpers exist server-side; token issuance and revocation workflows remain deferred."
      diagnostics={diagnostics}
      folio="§ 22"
      groupIds={["security", "database"]}
      introRows={[
        { label: "Hashing", value: "HMAC-SHA256 with PERSONAL_SAVE_TOKEN_PEPPER" },
        { label: "Stored material", value: "Future rows store hash plus short prefix only" },
        { label: "Allowed scope", value: "Future tokens may create inspiration only" },
      ]}
      title="Save Tokens"
    />
  );
}
