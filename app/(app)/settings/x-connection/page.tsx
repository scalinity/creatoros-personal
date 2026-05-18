import type { Metadata } from "next";

import { XConnectionPanel } from "@/components/settings/x-connection-panel";
import { SettingsSectionPage } from "@/components/settings";
import { requireAdmin } from "@/lib/auth/admin";
import { getOperationalDiagnostics } from "@/lib/server-only/diagnostics";
import { loadXConnectionStatus } from "@/lib/x/oauth";

import { disconnectXConnectionAction, syncXConnectionAction } from "./actions";

export const metadata: Metadata = {
  title: "X Connection · Settings · CreatorOS Personal",
};

export const dynamic = "force-dynamic";

type XConnectionPageProps = {
  searchParams?: Promise<{ notice?: string }>;
};

export default async function XConnectionSettingsPage({ searchParams }: XConnectionPageProps) {
  const admin = await requireAdmin();
  const diagnostics = getOperationalDiagnostics();
  const params = searchParams ? await searchParams : {};
  const connection = await loadXConnectionStatus(admin);

  return (
    <SettingsSectionPage
      description="Official X OAuth read connection, encrypted token storage, scope-derived capability flags, manual read sync, metric snapshots, and safe fallback handling. Publishing scopes and X writes remain disabled until Phase 17."
      diagnostics={diagnostics}
      folio="§ 19"
      groupIds={["x", "cron", "security"]}
      introRows={[
        { label: "Connection", value: connection ? `${connection.status}${connection.username ? ` as @${connection.username}` : ""}` : "Not connected" },
        { label: "Token storage", value: "Encrypted server-side only; token values are never rendered" },
        { label: "Publishing", value: "Write scopes are not requested by default and write routes remain disabled" },
        { label: "Fallback", value: "Explicit mock sync is available for dry-run verification without X credentials" },
      ]}
      title="X Connection Settings"
    >
      <XConnectionPanel
        connection={connection}
        disconnectAction={disconnectXConnectionAction}
        notice={params.notice ?? null}
        syncAction={syncXConnectionAction}
      />
    </SettingsSectionPage>
  );
}
