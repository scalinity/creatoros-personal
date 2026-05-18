import type { Metadata } from "next";

import { Card, Input, SubmitButton, Switch } from "@/components/design-system";
import { SettingsSectionPage } from "@/components/settings";
import { requireAdmin } from "@/lib/auth/admin";
import { getOperationalDiagnosticsForAdmin } from "@/lib/server-only/diagnostics";

import { deleteWorkspaceDataAction } from "./actions";

export const metadata: Metadata = {
  title: "Data · Settings · CreatorOS Personal",
};

export const dynamic = "force-dynamic";

type DataSettingsPageProps = {
  searchParams?: Promise<{ notice?: string }>;
};

const notices: Record<string, string> = {
  data_deleted: "Workspace data deletion completed and was audited.",
  delete_confirmation_invalid: "Deletion was rejected because the exact confirmation did not match.",
  delete_failed: "Deletion could not be completed safely; no unconfirmed browser-side deletion occurred.",
  delete_rate_limited: "Deletion is rate-limited. Wait before trying another destructive request.",
};

export default async function DataSettingsPage({ searchParams }: DataSettingsPageProps) {
  const admin = await requireAdmin();
  const diagnostics = await getOperationalDiagnosticsForAdmin(admin);
  const params = searchParams ? await searchParams : {};
  const notice = params.notice ? notices[params.notice] : null;

  return (
    <SettingsSectionPage
      actions={[
        {
          href: "/api/data/export?format=json",
          label: "Export JSON",
          note: "Downloads a redacted owner archive without token material or secret values.",
          tone: "secondary",
        },
        {
          href: "/api/data/export?format=csv",
          label: "Export CSV",
          note: "Downloads a table-indexed CSV archive with the same redaction rules.",
          tone: "secondary",
        },
      ]}
      description="Data export and deletion controls for the private workspace. Exports are live and redacted; deletion is protected by exact confirmation, rate limit, token clearing, and audit logging."
      diagnostics={diagnostics}
      folio="§ 23"
      groupIds={["database", "security", "tokens", "recent-failures"]}
      introRows={[
        ...(notice ? [{ label: "Notice", value: notice }] : []),
        { label: "JSON export", mono: true, value: "GET /api/data/export?format=json" },
        { label: "CSV export", mono: true, value: "GET /api/data/export?format=csv" },
        { label: "Delete confirmation", mono: true, value: "DELETE_CREATOROS_PERSONAL_DATA" },
        { label: "Redaction", value: "OAuth tokens, save-token hashes/prefixes, provider keys, service-role keys, auth headers, and secret-like values are excluded or redacted" },
      ]}
      title="Data Settings"
    >
      <Card className="token-form" variant="inset">
        <Card.Header>
          <span className="settings-card-title smallcaps">Destructive Data Control</span>
        </Card.Header>
        <Card.Body>
          <p className="settings-card-copy">
            This clears owner workspace rows through a transactional database function after token material is revoked or nulled. Supabase auth-user deletion is optional and also requires the same exact confirmation.
          </p>
          <form action={deleteWorkspaceDataAction} className="token-form-grid">
            <Input
              autoComplete="off"
              helper="Required exact phrase: DELETE_CREATOROS_PERSONAL_DATA"
              label="Exact confirmation"
              mono
              name="confirmation"
              pattern="DELETE_CREATOROS_PERSONAL_DATA"
              required
              type="text"
            />
            <Switch label="Also delete Supabase auth user" name="delete_auth_user" />
            <SubmitButton size="sm" variant="destructive">
              Delete workspace data
            </SubmitButton>
          </form>
        </Card.Body>
      </Card>
    </SettingsSectionPage>
  );
}
