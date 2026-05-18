import Link from "next/link";

import { AssumptionFlag, Badge, Card, EmptyState, KeyValueRow, LinkButton, MetricBlock, RuleHeader, ScoreGauge, Table } from "@/components/design-system";
import type { AnalyticsAggregate, AnalyticsPostSummary, AnalyticsReport, VelocityPostSummary } from "@/lib/analytics";

export type AnalyticsViewProps = {
  report: AnalyticsReport;
};

function formatNumber(value: null | number | undefined) {
  if (value === null || value === undefined) return "unknown";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatScore(value: null | number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  return value.toFixed(2).replace(/\.00$/, "");
}

function formatPercentish(value: null | number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  return `${formatScore(value)}%`;
}

function shortText(value: string, max = 96) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3).trim()}...` : normalized;
}

function badgeForScore(score: null | number | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "outline";
  if (score >= 75) return "success";
  if (score >= 50) return "accent";
  if (score >= 25) return "warning";
  return "danger";
}

function AggregateTable({ groups, title }: { groups: AnalyticsAggregate[]; title: string }) {
  return (
    <section className="analytics-panel" aria-label={`${title} aggregate`}>
      <RuleHeader folio="§" label={title} sub="average score" />
      {groups.length > 0 ? (
        <Table
          aria-label={`${title} aggregate table`}
          columns={[
            { header: "Group", key: "group", rowHeader: true },
            { header: "Count", key: "count", numeric: true },
            { header: "Views", key: "views", numeric: true },
            { header: "Eng", key: "engagement", numeric: true },
            { header: "Score", key: "score", numeric: true },
          ]}
          rows={groups.slice(0, 8).map((group) => ({
            count: group.count,
            engagement: formatPercentish(group.averageEngagementRate),
            group: group.label,
            id: `${title}-${group.key}`,
            score: formatScore(group.averageHeuristicScore),
            views: formatNumber(group.totalImpressions),
          }))}
        />
      ) : (
        <EmptyState message="Import or sync posts to populate this aggregate." title="No aggregate rows" />
      )}
    </section>
  );
}

function PostTable({ empty, posts, title }: { empty: string; posts: AnalyticsPostSummary[]; title: string }) {
  return (
    <section className="analytics-panel" aria-label={title}>
      <RuleHeader folio="§" label={title} sub="scored posts" />
      {posts.length > 0 ? (
        <Table
          aria-label={`${title} table`}
          columns={[
            { header: "Post", key: "post", rowHeader: true },
            { header: "Topic", key: "topic" },
            { header: "Views", key: "views", numeric: true },
            { header: "Eng", key: "engagement", numeric: true },
            { header: "Score", key: "score", numeric: true },
          ]}
          rows={posts.map((post) => ({
            engagement: formatPercentish(post.engagementRate),
            id: post.id,
            post: (
              <Link aria-label={`Open post history for: ${post.text}`} href={{ pathname: "/post-history", query: { selected: post.id } }} title={post.text}>
                {shortText(post.text)}
              </Link>
            ),
            score: <Badge variant={badgeForScore(post.heuristicScore)}>{formatScore(post.heuristicScore)}</Badge>,
            topic: post.topic ?? "unknown",
            views: formatNumber(post.impressions),
          }))}
        />
      ) : (
        <EmptyState message={empty} title="No scored posts" />
      )}
    </section>
  );
}

function VelocityTable({ rows }: { rows: VelocityPostSummary[] }) {
  return (
    <section className="analytics-panel" aria-label="Post-publish velocity">
      <RuleHeader folio="§" label="Velocity" sub="latest two snapshots" />
      {rows.length > 0 ? (
        <Table
          aria-label="Post velocity table"
          columns={[
            { header: "Post", key: "post", rowHeader: true },
            { header: "Views/hr", key: "views", numeric: true },
            { header: "Eng/hr", key: "engagement", numeric: true },
            { header: "Likes/hr", key: "likes", numeric: true },
            { header: "Window", key: "window", numeric: true },
          ]}
          rows={rows.map((row) => ({
            engagement: formatScore(row.engagementVelocityPerHour),
            id: row.postId,
            likes: formatScore(row.likeVelocityPerHour),
            post: (
              <Link aria-label={`Open post history for: ${row.text}`} href={{ pathname: "/post-history", query: { selected: row.postId } }} title={row.text}>
                {shortText(row.text)}
              </Link>
            ),
            views: formatScore(row.impressionVelocityPerHour),
            window: `${formatScore(row.hoursElapsed)}h`,
          }))}
        />
      ) : (
        <EmptyState message="Velocity needs at least two snapshots for the same post." title="Velocity unknown" />
      )}
    </section>
  );
}

function ExplanationPanel({ report }: { report: AnalyticsReport }) {
  return (
    <section aria-label="Analytics explanation" className="analytics-inspector">
      {report.performance.averageHeuristicScore === null ? (
        <EmptyState message="Import scored posts or edit metrics to calculate an average heuristic score." title="Average heuristic unknown" />
      ) : (
        <ScoreGauge label="Average heuristic" value={Math.round(report.performance.averageHeuristicScore)} />
      )}
      <Card variant="inset">
        <Card.Header>
          <h2 className="analytics-card-title smallcaps">Score explanations</h2>
        </Card.Header>
        <Card.Body>
          {report.scoreExplanations.map((item) => (
            <div className="analytics-explanation" key={item.label}>
              <div className="analytics-explanation-head">
                <span className="smallcaps">{item.label}</span>
                <Badge variant={item.confidence === "fact" ? "success" : "warning"}>{item.confidence}</Badge>
              </div>
              <p className="mono analytics-formula">{item.formula}</p>
              <p>{item.notes}</p>
            </div>
          ))}
        </Card.Body>
      </Card>
      <Card variant="inset">
        <Card.Header>
          <h2 className="analytics-card-title smallcaps">Unknowns</h2>
        </Card.Header>
        <Card.Body>
          <div className="analytics-unknowns">
            {report.unknowns.map((item) => (
              <AssumptionFlag key={item.key} label={item.label}>
                {item.reason}
              </AssumptionFlag>
            ))}
          </div>
        </Card.Body>
      </Card>
      <Card variant="inset">
        <Card.Header>
          <h2 className="analytics-card-title smallcaps">Cadence</h2>
        </Card.Header>
        <Card.Body>
          <KeyValueRow label="Posts / 30d" mono value={report.cadence.postsLast30Days} />
          <KeyValueRow label="Active days" mono value={report.cadence.activePostingDaysLast30} />
          <KeyValueRow label="Posts / active day" mono value={formatScore(report.cadence.averagePostsPerActiveDay)} />
          <KeyValueRow label="Posts / week" mono value={formatScore(report.cadence.averagePostsPerWeek)} />
          <KeyValueRow label="Longest gap" mono value={report.cadence.longestGapDays === null ? "unknown" : `${report.cadence.longestGapDays}d`} />
        </Card.Body>
      </Card>
    </section>
  );
}

function MetricSummary({ report }: { report: AnalyticsReport }) {
  return (
    <section className="analytics-metrics" aria-label="Analytics summary">
      <MetricBlock label="Posts" value={formatNumber(report.performance.totalPosts)} />
      <MetricBlock label="Views" value={formatNumber(report.performance.totalImpressions)} />
      <MetricBlock label="Engagements" value={formatNumber(report.performance.totalEngagements)} />
      <MetricBlock label="Avg heuristic" value={formatScore(report.performance.averageHeuristicScore)} />
      <MetricBlock delta={`${report.performance.metricCoverage.impressionsUnknown} unknown`} label="Metric coverage" value={`${report.performance.metricCoverage.impressionsKnown}/${report.performance.totalPosts}`} />
      <MetricBlock label="Scheduled" value={formatNumber(report.publishing.scheduled)} />
      <MetricBlock label="Active goals" value={formatNumber(report.growth.activeGoals)} />
      <MetricBlock label="Profile audit" value={formatScore(report.growth.latestProfileAudit?.score)} />
    </section>
  );
}

function OperatingMetrics({ report }: { report: AnalyticsReport }) {
  return (
    <section className="analytics-operating-grid" aria-label="Publishing, blog, campaign, and experiment metrics">
      <Card>
        <Card.Header>
          <h2 className="analytics-card-title smallcaps">Publishing</h2>
        </Card.Header>
        <Card.Body>
          <KeyValueRow label="Drafts" mono value={report.publishing.totalDrafts} />
          <KeyValueRow label="Needs approval" mono value={report.publishing.needsApproval} />
          <KeyValueRow label="Scheduled" mono value={report.publishing.scheduled} />
          <KeyValueRow label="Failed jobs" mono value={report.publishing.failedJobs} />
        </Card.Body>
      </Card>
      <Card>
        <Card.Header>
          <h2 className="analytics-card-title smallcaps">Blogs</h2>
        </Card.Header>
        <Card.Body>
          <KeyValueRow label="Total" mono value={report.blogs.total} />
          <KeyValueRow label="Ready/exported" mono value={report.blogs.readyOrExported} />
          <KeyValueRow label="Published external" mono value={report.blogs.publishedExternally} />
          <KeyValueRow label="Words" mono value={formatNumber(report.blogs.totalWords)} />
        </Card.Body>
      </Card>
      <Card>
        <Card.Header>
          <h2 className="analytics-card-title smallcaps">Campaigns</h2>
        </Card.Header>
        <Card.Body>
          <KeyValueRow label="Total" mono value={report.campaigns.total} />
          <KeyValueRow label="Active" mono value={report.campaigns.active} />
          <KeyValueRow label="Items" mono value={report.campaigns.itemCount} />
          {report.campaigns.summaries.length > 0 ? (
            report.campaigns.summaries.slice(0, 3).map((campaign) => <KeyValueRow key={campaign.id} label="Campaign" value={`${shortText(campaign.name, 48)} / ${campaign.itemCount} items / ${campaign.status}`} />)
          ) : (
            <KeyValueRow label="Performance" value="unknown until campaign items link to scored posts" />
          )}
        </Card.Body>
      </Card>
      <Card>
        <Card.Header>
          <h2 className="analytics-card-title smallcaps">Experiments</h2>
        </Card.Header>
        <Card.Body>
          <KeyValueRow label="Total" mono value={report.experiments.total} />
          <KeyValueRow label="Active" mono value={report.experiments.active} />
          <KeyValueRow label="With results" mono value={report.experiments.withResults} />
          {report.experiments.summaries.length > 0 ? (
            report.experiments.summaries.slice(0, 3).map((experiment) => <KeyValueRow key={experiment.id} label="Experiment" value={`${shortText(experiment.title, 48)} / ${experiment.decision ?? "undecided"} / ${experiment.latestResult ?? "no result"}`} />)
          ) : (
            <KeyValueRow label="Decisions" value={Object.keys(report.experiments.byDecision).join(", ") || "unknown"} />
          )}
        </Card.Body>
      </Card>
      <Card>
        <Card.Header>
          <h2 className="analytics-card-title smallcaps">Growth layer</h2>
        </Card.Header>
        <Card.Body>
          <KeyValueRow label="Goals" mono value={`${report.growth.activeGoals}/${report.growth.totalGoals} active`} />
          <KeyValueRow label="Pillars" mono value={`${report.growth.activePillars}/${report.growth.totalPillars} active`} />
          <KeyValueRow label="Weekly strategy" value={report.growth.latestWeeklyReview?.strategy ? shortText(report.growth.latestWeeklyReview.strategy) : "no generated review"} />
          <KeyValueRow label="Profile findings" value={report.growth.latestProfileAudit?.findings[0] ? shortText(report.growth.latestProfileAudit.findings[0]) : "no profile audit"} />
        </Card.Body>
      </Card>
    </section>
  );
}

export function AnalyticsView({ report }: AnalyticsViewProps) {
  return (
    <main aria-labelledby="analytics-title" className="analytics-page">
      <RuleHeader
        actions={<Badge variant="outline">deterministic</Badge>}
        as="h1"
        folio="§ 18"
        id="analytics-title"
        label="Analytics"
        sub="explainable reports"
      />
      <MetricSummary report={report} />
      {report.performance.totalPosts === 0 ? (
        <EmptyState
          action={<LinkButton href="/post-history" size="sm" variant="secondary">Import posts</LinkButton>}
          message="Manual imports and X sync snapshots feed every post-level report here."
          title="No analytics source data"
        />
      ) : null}
      <section className="analytics-workbench">
        <div className="analytics-main">
          <section aria-labelledby="analytics-rankings-title" className="analytics-table-grid">
            <RuleHeader className="visually-hidden" folio="§" id="analytics-rankings-title" label="Post ranking tables" />
            <PostTable empty="Scored posts appear after manual import, sync, or metric edits." posts={report.topPosts} title="Top posts" />
            <PostTable empty="Bottom posts appear once at least one post has a known score." posts={report.bottomPosts} title="Bottom posts" />
          </section>
          <section aria-labelledby="analytics-aggregates-title" className="analytics-aggregate-grid">
            <RuleHeader className="visually-hidden" folio="§" id="analytics-aggregates-title" label="Post aggregate tables" />
            <AggregateTable groups={report.aggregates.topic} title="Topics" />
            <AggregateTable groups={report.aggregates.format} title="Formats" />
            <AggregateTable groups={report.aggregates.hook} title="Hooks" />
            <AggregateTable groups={report.aggregates.dayOfWeek} title="Days" />
            <AggregateTable groups={report.aggregates.hour} title="Hours" />
          </section>
          <VelocityTable rows={report.velocity.topPosts} />
          <OperatingMetrics report={report} />
        </div>
        <ExplanationPanel report={report} />
      </section>
    </main>
  );
}
