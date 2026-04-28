import Link from "next/link";

import { Badge, Card, EmptyState, KeyValueRow, MetricBlock, RuleHeader, Table } from "@/components/design-system";
import type { DashboardSummary } from "@/lib/analytics";

export type DashboardViewProps = {
  summary: DashboardSummary;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: null | string) {
  if (!value) return "unscheduled";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function shortText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 90 ? `${normalized.slice(0, 87).trim()}...` : normalized;
}

function queueKindLabel(kind: DashboardSummary["queueRows"][number]["kind"]) {
  return kind.replaceAll("_", " ");
}

function queueVariant(kind: DashboardSummary["queueRows"][number]["kind"]) {
  if (kind === "failed") return "danger";
  if (kind === "due_today" || kind === "needs_approval") return "warning";
  if (kind === "publishing") return "accent";
  return "outline";
}

function statusVariant(status: string) {
  if (["connected", "enabled", "ready"].includes(status)) return "success";
  if (["degraded", "disabled"].includes(status)) return "warning";
  if (["failed", "revoked"].includes(status)) return "danger";
  return "outline";
}

function StatusPanel({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="dashboard-section" aria-label="Status">
      <RuleHeader folio="§ 01" label="Status" sub="connection and permissions" />
      <div className="dashboard-card-grid dashboard-card-grid-three">
        <Card>
          <Card.Header>
            <h2 className="dashboard-card-title smallcaps">X connection</h2>
            <Badge variant={statusVariant(summary.status.xStatus)}>{summary.status.xStatus}</Badge>
          </Card.Header>
          <Card.Body>
            <KeyValueRow label="Account" mono value={summary.status.xUsername ? `@${summary.status.xUsername}` : "none"} />
            <KeyValueRow label="Last sync" mono value={summary.status.lastSync ?? "unknown"} />
            <KeyValueRow label="Error" value={summary.status.xError ?? "none"} />
          </Card.Body>
        </Card>
        <Card>
          <Card.Header>
            <h2 className="dashboard-card-title smallcaps">Publishing</h2>
            <Badge variant={statusVariant(summary.status.publishingStatus)}>{summary.status.publishingStatus}</Badge>
          </Card.Header>
          <Card.Body>
            <KeyValueRow label="Can publish" value={summary.status.canPublish ? "yes" : "no"} />
            <KeyValueRow label="Needs approval" mono value={summary.queue.needsApproval} />
            <KeyValueRow label="Failed jobs" mono value={summary.queue.failedJobs} />
          </Card.Body>
        </Card>
        <Card>
          <Card.Header>
            <h2 className="dashboard-card-title smallcaps">Archive</h2>
            <Badge variant="outline">real counts</Badge>
          </Card.Header>
          <Card.Body>
            <KeyValueRow label="Posts" mono value={summary.archive.posts} />
            <KeyValueRow label="Ideas" mono value={summary.archive.ideas} />
            <KeyValueRow label="Blogs" mono value={summary.archive.blogs} />
          </Card.Body>
        </Card>
      </div>
    </section>
  );
}

function QueuePanel({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="dashboard-section" aria-label="Queue">
      <RuleHeader folio="§ 02" label="Queue" sub="publishing workload" />
      <div className="dashboard-metrics">
        <MetricBlock label="Needs approval" value={summary.queue.needsApproval} />
        <MetricBlock label="Scheduled" value={summary.queue.scheduled} />
        <MetricBlock label="Failed jobs" tone={summary.queue.failedJobs > 0 ? "down" : "neutral"} value={summary.queue.failedJobs} />
        <MetricBlock label="Failures" tone={summary.queue.failureTotal > 0 ? "down" : "neutral"} value={summary.queue.failureTotal} />
      </div>
      {summary.queueRows.length > 0 ? (
        <Table
          aria-label="Dashboard publishing queue detail"
          columns={[
            { header: "Item", key: "item", rowHeader: true },
            { header: "State", key: "state" },
            { header: "Scheduled", key: "scheduled" },
            { header: "Detail", key: "detail" },
          ]}
          rows={summary.queueRows.map((row) => ({
            detail: `${row.status.replaceAll("_", " ")} / ${row.detail}`,
            id: row.id,
            item: (
              <Link aria-label={`Open publishing draft: ${row.label}`} href={`/publishing?selected=${row.id}`} title={row.label}>
                {shortText(row.label)}
              </Link>
            ),
            scheduled: formatDate(row.scheduledFor),
            state: <Badge variant={queueVariant(row.kind)}>{queueKindLabel(row.kind)}</Badge>,
          }))}
        />
      ) : (
        <EmptyState message="Approved, scheduled, failed, or pending publishing drafts will appear here." title="No queue items" />
      )}
    </section>
  );
}

function ArchivePanel({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="dashboard-section" aria-label="Archive counts">
      <RuleHeader folio="§ 03" label="Archive" sub="local source inventory" />
      <div className="dashboard-metrics">
        <MetricBlock label="Posts imported" value={formatNumber(summary.archive.posts)} />
        <MetricBlock label="Ideas" value={formatNumber(summary.archive.ideas)} />
        <MetricBlock label="Generated drafts" value={formatNumber(summary.archive.generatedOutputs)} />
        <MetricBlock label="Blogs" value={formatNumber(summary.archive.blogs)} />
      </div>
    </section>
  );
}

function PerformancePanel({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="dashboard-section" aria-label="Performance">
      <RuleHeader actions={<Link className="btn btn-secondary btn-sm" href="/analytics"><span className="btn-label">Open analytics</span></Link>} folio="§ 04" label="Performance" sub="recent archive" />
      <div className="dashboard-metrics dashboard-metrics-three">
        <MetricBlock label="Views" value={formatNumber(summary.performance.totalImpressions)} />
        <MetricBlock label="Engagements" value={formatNumber(summary.performance.totalEngagements)} />
        <MetricBlock label="Top posts" value={summary.performance.topPosts.length} />
      </div>
      {summary.performance.topPosts.length > 0 ? (
        <Table
          aria-label="Dashboard top posts"
          columns={[
            { header: "Post", key: "post", rowHeader: true },
            { header: "Views", key: "views", numeric: true },
            { header: "Score", key: "score", numeric: true },
          ]}
          rows={summary.performance.topPosts.map((post) => ({
            id: post.id,
            post: (
              <Link aria-label={`Open post history for: ${post.text}`} href={`/post-history?selected=${post.id}`} title={post.text}>
                {shortText(post.text)}
              </Link>
            ),
            score: post.heuristicScore?.toFixed(2).replace(/\.00$/, "") ?? "unknown",
            views: formatNumber(post.impressions),
          }))}
        />
      ) : (
        <EmptyState message="Import posts or sync X to surface top-performing content here." title="No top posts yet" />
      )}
    </section>
  );
}

function StrategyPanel({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="dashboard-section" aria-label="Strategy">
      <RuleHeader actions={<Link className="btn btn-secondary btn-sm" href="/campaigns"><span className="btn-label">Open campaigns</span></Link>} folio="§ 05" label="Strategy" sub="growth objects" />
      <div className="dashboard-metrics">
        <MetricBlock label="Active campaigns" value={summary.strategy.activeCampaigns} />
        <MetricBlock label="Active experiments" value={summary.strategy.activeExperiments} />
        <MetricBlock label="Active goals" value={summary.strategy.activeGoals} />
        <MetricBlock label="Active pillars" value={summary.strategy.activePillars} />
        <MetricBlock label="Profile score" value={summary.strategy.latestProfileScore ?? "unknown"} />
      </div>
      {summary.strategy.latestReviewStrategy ? (
        <Card variant="inset">
          <Card.Header>
            <h2 className="dashboard-card-title smallcaps">Latest growth strategy</h2>
            <Badge variant="warning">inference</Badge>
          </Card.Header>
          <Card.Body>
            <p className="dashboard-muted">{shortText(summary.strategy.latestReviewStrategy)}</p>
          </Card.Body>
        </Card>
      ) : null}
    </section>
  );
}

function SuggestionsPanel({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="dashboard-section" aria-label="Daily suggestions">
      <RuleHeader folio="§ 06" label="Daily suggestions" sub="coach placeholder" />
      <div className="dashboard-suggestion-list">
        {summary.recommendedNextActions.map((action) => (
          <Card key={action.label} variant="inset">
            <Card.Header>
              <h2 className="dashboard-card-title smallcaps">{action.label}</h2>
              <Badge variant={action.confidence === "inference" ? "warning" : "outline"}>{action.confidence}</Badge>
            </Card.Header>
            <Card.Body>
              <p className="dashboard-muted">{action.reason}</p>
            </Card.Body>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function DashboardView({ summary }: DashboardViewProps) {
  return (
    <main className="dashboard-page" aria-labelledby="dashboard-title">
      <h1 className="workflow-title" id="dashboard-title">Dashboard</h1>
      <RuleHeader actions={<Badge variant="outline">private cockpit</Badge>} folio="§ 01" label="Dashboard" sub="real data overview" />
      <StatusPanel summary={summary} />
      <QueuePanel summary={summary} />
      <ArchivePanel summary={summary} />
      <PerformancePanel summary={summary} />
      <StrategyPanel summary={summary} />
      <SuggestionsPanel summary={summary} />
    </main>
  );
}
