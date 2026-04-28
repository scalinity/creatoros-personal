import { SettingsSectionPage } from "@/components/settings";
import { TokenSettingsClient } from "@/components/settings/tokens";
import { requireAdmin } from "@/lib/auth/admin";
import { getOperationalDiagnostics } from "@/lib/server-only/diagnostics";
import { listPersonalSaveTokens } from "@/lib/tokens/personal-save-tokens";

import { tokenSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TokenSettingsPage() {
  const admin = await requireAdmin();
  const [diagnostics, tokens] = [getOperationalDiagnostics(), await listPersonalSaveTokens(admin)];

  return (
    <SettingsSectionPage
      description="Personal save tokens let the Chrome extension create inspiration records only. Raw tokens are generated server-side, shown once, and stored as peppered hashes."
      diagnostics={diagnostics}
      folio="§ 22"
      groupIds={["security", "database"]}
      introRows={[
        { label: "Hashing", value: "HMAC-SHA256 with PERSONAL_SAVE_TOKEN_PEPPER" },
        { label: "Stored material", value: "hash plus short prefix only" },
        { label: "Allowed scope", value: "inspiration:create" },
      ]}
      title="Save Tokens"
    >
      <TokenSettingsClient action={tokenSettingsAction} tokens={tokens} />
    </SettingsSectionPage>
  );
}
