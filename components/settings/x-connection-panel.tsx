import type { ReactNode } from "react";

import { Badge, Card, KeyValueRow, LinkButton, SubmitButton, Table } from "@/components/design-system";
import type { SanitizedXConnection, XCapabilities } from "@/lib/x/oauth";

type XConnectionPanelProps = {
  connection: null | SanitizedXConnection;
  disconnectAction: (formData: FormData) => Promise<void>;
  notice?: null | string;
  syncAction: (formData: FormData) => Promise<void>;
};

type BadgeVariant = "danger" | "neutral" | "outline" | "success" | "warning";

const capabilityLabels: Array<[keyof XCapabilities, string]> = [
  ["can_read_user_posts", "Read owner posts"],
  ["can_read_metrics", "Read metrics"],
  ["can_read_private_metrics", "Private metrics"],
  ["can_write_posts", "Write posts"],
  ["can_write_replies", "Write replies"],
  ["can_write_quotes", "Write quotes"],
  ["can_upload_media", "Upload media"],
  ["can_delete_posts", "Delete posts"],
  ["enterprise_quote_post_enabled", "Enterprise quote posts"],
  ["enterprise_analytics_enabled", "Enterprise analytics"],
  ["enterprise_streams_enabled", "Enterprise streams"],
];

const noticeCopy: Record<string, string> = {
  disconnect_failed: "Disconnect failed; token material was not changed.",
  live_sync_complete: "Live X sync finished. Inspect the sync job status below.",
  live_sync_failed: "Live X sync failed safely; imported posts and drafts were preserved.",
  mock_sync_complete: "Mock X sync finished using explicit dry-run input.",
  mock_sync_failed: "Mock X sync failed; inspect the sync job status before retrying.",
  rate_limited: "Action rate limit reached. Wait for the reset window before retrying.",
  x_config_missing: "X OAuth configuration is incomplete. Check diagnostics before connecting.",
  x_connect_degraded: "X connected with a degraded capability state. Review scopes and diagnostics.",
  x_connect_failed: "X OAuth failed before token storage. Reconnect when configuration is correct.",
  x_connected: "X connected. Tokens are encrypted at rest and never shown here.",
  x_disconnected: "X disconnected. Token material was removed; imported posts remain unless deleted later.",
  x_scope_escalation_started: "Publishing scope escalation started. Complete the X authorization screen to enable write capabilities.",
};

function statusVariant(status: null | string): BadgeVariant {
  if (status === "connected") return "success";
  if (status === "degraded") return "warning";
  if (status === "revoked") return "danger";
  if (status === "disconnected") return "outline";
  return "neutral";
}

function valueOrDash(value: null | string | undefined) {
  return value && value.length > 0 ? value : "—";
}

function capabilityRows(capabilities: XCapabilities | null) {
  return capabilityLabels.map(([key, label]) => {
    const enabled = capabilities?.[key] === true;

    return {
      id: key,
      capability: label,
      state: <Badge variant={enabled ? "success" : "outline"}>{enabled ? "enabled" : "disabled"}</Badge>,
    };
  });
}

function Notice({ notice }: { notice?: null | string }) {
  if (!notice) return null;
  const copy = noticeCopy[notice];

  if (!copy) return null;

  return (
    <Card className="settings-intro-card" variant="inset">
      <Card.Body>
        <KeyValueRow label="Notice" value={copy} />
      </Card.Body>
    </Card>
  );
}

function ConnectAction({ connected }: { connected: boolean }) {
  return (
    <div className="x-connection-link-actions">
      {/* SCA-527 (S-21): migrated from hand-rolled <a className="btn ...">
          to LinkButton. prefetch={false} because /api/x/oauth/start is a
          server route that redirects to X.com — there's no benefit to
          Next prefetching it. */}
      <LinkButton href="/api/x/oauth/start?mode=read&return_to=/settings/x-connection" prefetch={false} size="sm">
        {connected ? "Reconnect read access" : "Connect X read access"}
      </LinkButton>
      <LinkButton href="/api/x/oauth/start?mode=publishing&return_to=/settings/x-connection" prefetch={false} size="sm" variant="secondary">
        Enable publishing scopes
      </LinkButton>
    </div>
  );
}

function SyncForm({ action, disabled = false, mode }: { action: (formData: FormData) => Promise<void>; disabled?: boolean; mode: "live" | "mock" }) {
  return (
    <form action={action} className="x-connection-inline-form">
      <input name="mode" type="hidden" value={mode} />
      <input name="include_metrics" type="hidden" value="true" />
      <input name="max_posts" type="hidden" value="25" />
      <SubmitButton disabled={disabled} size="sm" variant={mode === "live" ? "primary" : "secondary"}>
        {mode === "live" ? "Run live read sync" : "Run mock sync"}
      </SubmitButton>
    </form>
  );
}

function DisconnectForm({ action, disabled }: { action: (formData: FormData) => Promise<void>; disabled: boolean }) {
  return (
    <form action={action} className="x-connection-inline-form">
      <input name="delete_imported_posts" type="hidden" value="false" />
      <input name="delete_snapshots" type="hidden" value="false" />
      <SubmitButton disabled={disabled} size="sm" variant="destructive">
        Disconnect X
      </SubmitButton>
    </form>
  );
}

export function XConnectionPanel({ connection, disconnectAction, notice, syncAction }: XConnectionPanelProps) {
  const connected = connection?.status === "connected" || connection?.status === "degraded";
  const liveSyncAvailable = connected && connection?.capabilities.can_read_user_posts === true;
  const scopes = connection?.scopes.join(" ") || "—";

  return (
    <div className="x-connection-panel">
      <Notice notice={notice} />

      <Card className="x-connection-card">
        <Card.Header>
          <span className="settings-card-title smallcaps">Connection Ledger</span>
          <Badge variant={statusVariant(connection?.status ?? null)}>{connection?.status ?? "not connected"}</Badge>
        </Card.Header>
        <Card.Body>
          <div className="settings-actions x-connection-actions">
            <div className="settings-action">
              <ConnectAction connected={connected} />
              <span className="settings-action-note">Read access stays least-privilege; publishing scopes are requested only through the separate escalation action.</span>
            </div>
            <div className="settings-action">
              <DisconnectForm action={disconnectAction} disabled={!connection || connection.status === "disconnected"} />
              <span className="settings-action-note">Clears encrypted access and refresh tokens.</span>
            </div>
          </div>
          <KeyValueRow label="Username" mono value={connection?.username ? `@${connection.username}` : "—"} />
          <KeyValueRow label="X user id" mono value={valueOrDash(connection?.xUserId)} />
          <KeyValueRow label="Display name" value={valueOrDash(connection?.displayName)} />
          <KeyValueRow label="Scopes" mono value={scopes} />
          <KeyValueRow label="Token expires" mono value={valueOrDash(connection?.tokenExpiresAt)} />
          <KeyValueRow label="Last synced" mono value={valueOrDash(connection?.lastSyncedAt)} />
          <KeyValueRow label="Last error" value={valueOrDash(connection?.lastError)} />
        </Card.Body>
      </Card>

      <Card className="x-connection-card">
        <Card.Header>
          <span className="settings-card-title smallcaps">Read Sync</span>
          <Badge variant="outline">no write actions</Badge>
        </Card.Header>
        <Card.Body>
          <p className="settings-card-copy">Manual sync imports owner posts and metric snapshots when X permits the requested fields. Missing metrics are stored as unknown/zero with source metadata rather than treated as hard failure.</p>
          <div className="settings-actions x-connection-actions">
            <div className="settings-action">
              <SyncForm action={syncAction} disabled={!liveSyncAvailable} mode="live" />
              <span className="settings-action-note">Requires a connected X account and valid read scopes.</span>
            </div>
            <div className="settings-action">
              <SyncForm action={syncAction} mode="mock" />
              <span className="settings-action-note">Explicit dry-run path for local verification without X credentials.</span>
            </div>
          </div>
        </Card.Body>
      </Card>

      <Card className="x-connection-card">
        <Card.Header>
          <span className="settings-card-title smallcaps">Capability Flags</span>
          <Badge variant="neutral">scope derived</Badge>
        </Card.Header>
        <Card.Body>
          <Table
            aria-label="X capability flags"
            columns={[
              { key: "capability", header: "Capability" },
              { key: "state", header: "State" },
            ]}
            rows={capabilityRows(connection?.capabilities ?? null) as Array<{ id: string; capability: ReactNode; state: ReactNode }>}
          />
        </Card.Body>
      </Card>
    </div>
  );
}
