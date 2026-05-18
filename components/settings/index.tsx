import type { ReactNode } from "react";
import Link from "next/link";

import { Badge, Card, KeyValueRow, RuleHeader, Table, cn } from "@/components/design-system";
import type { DiagnosticGroup, DiagnosticGroupId, DiagnosticStatus, OperationalDiagnostics } from "@/lib/server-only/diagnostics";

type BadgeVariant = "danger" | "neutral" | "outline" | "success" | "warning";

type SettingsAction = {
  disabled?: boolean;
  href?: string;
  label: ReactNode;
  note?: ReactNode;
  tone?: "destructive" | "primary" | "secondary" | "tertiary";
};

type SettingsIntroRow = {
  label: ReactNode;
  mono?: boolean;
  value: ReactNode;
};

type SettingsSectionPageProps = {
  actions?: SettingsAction[];
  children?: ReactNode;
  description: ReactNode;
  diagnostics: OperationalDiagnostics;
  folio: ReactNode;
  groupIds?: DiagnosticGroupId[];
  introRows?: SettingsIntroRow[];
  title: ReactNode;
};

const settingsLinks = [
  { href: "/settings", label: "Overview" },
  { href: "/settings/x-connection", label: "X Connection" },
  { href: "/settings/ai", label: "AI" },
  { href: "/settings/data", label: "Data" },
  { href: "/settings/tokens", label: "Tokens" },
  { href: "/settings/diagnostics", label: "Diagnostics" },
] as const;

export function statusBadgeVariant(status: DiagnosticStatus): BadgeVariant {
  if (status === "ready") return "success";
  if (status === "degraded") return "warning";
  if (status === "missing") return "danger";
  return "outline";
}

function SettingsNav() {
  return (
    <nav aria-label="Settings sections" className="settings-nav">
      {settingsLinks.map((link) => (
        <Link className="settings-nav-link smallcaps" href={link.href} key={link.href}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function settingsActionVariant(tone: SettingsAction["tone"] = "secondary") {
  if (tone === "destructive") return "destructive" as const;
  if (tone === "primary") return "primary" as const;
  if (tone === "tertiary") return "tertiary" as const;
  return "secondary" as const;
}

function SettingsActions({ actions = [] }: { actions?: SettingsAction[] }) {
  if (actions.length === 0) return null;

  return (
    <div className="settings-actions">
      {actions.map((action) => {
        const variant = settingsActionVariant(action.tone);
        const className = cn("btn", `btn-${variant}`, "btn-sm", action.disabled && "settings-action-disabled");

        return (
          <div className="settings-action" key={String(action.label)}>
            {action.href && !action.disabled ? (
              <a className={className} href={action.href}>
                <span className="btn-label">{action.label}</span>
              </a>
            ) : (
              <button
                aria-disabled={action.disabled || undefined}
                className={className}
                disabled={action.disabled}
                type="button"
              >
                <span className="btn-label">{action.label}</span>
              </button>
            )}
            {action.note ? <span className="settings-action-note">{action.note}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

function itemRows(group: DiagnosticGroup) {
  return group.items.map((item) => ({
    id: `${group.id}-${item.key}`,
    signal: item.required === false ? `${item.label} (optional)` : item.label,
    state: <Badge variant={item.state === "present" ? "success" : item.state === "invalid" ? "warning" : "danger"}>{item.state}</Badge>,
    handling: item.secret ? (item.required === false ? "optional secret presence" : "secret presence only") : "presence only",
  }));
}

function DiagnosticGroupCard({ group }: { group: DiagnosticGroup }) {
  return (
    <Card className="settings-diagnostic-card">
      <Card.Header>
        <span className="settings-card-title smallcaps">{group.label}</span>
        <Badge variant={statusBadgeVariant(group.status)}>{group.status}</Badge>
      </Card.Header>
      <Card.Body>
        <p className="settings-card-copy">{group.summary}</p>
        <Table
          columns={[
            { key: "signal", header: "Signal" },
            { key: "state", header: "State" },
            { key: "handling", header: "Handling" },
          ]}
          rows={itemRows(group)}
        />
      </Card.Body>
    </Card>
  );
}

function selectGroups(diagnostics: OperationalDiagnostics, groupIds?: DiagnosticGroupId[]) {
  if (!groupIds) {
    return diagnostics.groups;
  }

  return diagnostics.groups.filter((group) => groupIds.includes(group.id));
}

export function SettingsSectionPage({
  actions,
  children,
  description,
  diagnostics,
  folio,
  groupIds,
  introRows = [],
  title,
}: SettingsSectionPageProps) {
  const groups = selectGroups(diagnostics, groupIds);

  return (
    <main aria-labelledby="settings-page-title" className="settings-page">
      <RuleHeader
        actions={<Badge variant={statusBadgeVariant(diagnostics.overall)}>{diagnostics.overall}</Badge>}
        as="h1"
        folio={folio}
        id="settings-page-title"
        label={title}
        sub="settings"
      />
      <section aria-labelledby="settings-status-title" className="settings-hero">
        <RuleHeader className="visually-hidden" folio="§" id="settings-status-title" label="Settings status" />
        <div>
          <p className="route-kicker smallcaps">private system console</p>
          <p className="route-description">{description}</p>
        </div>
        <Card className="settings-summary" variant="inset">
          <Card.Body>
            <KeyValueRow label="Diagnostics" value={diagnostics.overall} />
            <KeyValueRow label="Checked" mono value={diagnostics.checkedAt} />
            <KeyValueRow label="Secrets" value="secret presence only" />
          </Card.Body>
        </Card>
      </section>
      <SettingsNav />
      {introRows.length > 0 ? (
        <Card className="settings-intro-card" variant="inset">
          <Card.Body>
            {introRows.map((row) => (
              <KeyValueRow key={String(row.label)} label={row.label} mono={row.mono} value={row.value} />
            ))}
          </Card.Body>
        </Card>
      ) : null}
      <SettingsActions actions={actions} />
      {children}
      <div className="settings-diagnostics-grid">
        {groups.map((group) => (
          <DiagnosticGroupCard group={group} key={group.id} />
        ))}
      </div>
    </main>
  );
}
