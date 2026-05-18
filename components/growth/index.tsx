import Link from "next/link";
import type { ComponentProps } from "react";

import { AssumptionFlag, Badge, Card, Checkbox, EmptyState, Input, KeyValueRow, LinkButton, MetricBlock, RuleHeader, ScoreGauge, Select, SubmitButton, Table, Textarea, cn } from "@/components/design-system";
import type { Campaign, CampaignItem, Experiment, GrowthReview, GrowthWorkspace, ProfileAudit } from "@/lib/growth";

export type FormAction = ComponentProps<"form">["action"];

export type GrowthCampaignsViewProps = {
  addCampaignItemAction?: FormAction;
  createCampaignAction?: FormAction;
  createGoalAction?: FormAction;
  createPillarAction?: FormAction;
  notice?: string;
  runMonthlyReviewAction?: FormAction;
  runWeeklyReviewAction?: FormAction;
  workspace: GrowthWorkspace;
};

export type GrowthExperimentsViewProps = {
  createExperimentAction?: FormAction;
  notice?: string;
  recordExperimentResultAction?: FormAction;
  runProfileAuditAction?: FormAction;
  workspace: GrowthWorkspace;
};

const noticeCopy: Record<string, { tone: "error" | "success"; text: string }> = {
  campaign_created: { text: "Campaign saved.", tone: "success" },
  campaign_failed: { text: "Campaign save failed. Check required fields and dates.", tone: "error" },
  campaign_item_created: { text: "Campaign item linked.", tone: "success" },
  campaign_item_failed: { text: "Campaign item could not be linked.", tone: "error" },
  experiment_created: { text: "Experiment saved.", tone: "success" },
  experiment_failed: { text: "Experiment save failed. Check required fields and dates.", tone: "error" },
  experiment_result_recorded: { text: "Experiment result recorded with interpretation.", tone: "success" },
  experiment_result_failed: { text: "Experiment result analysis failed. Preserve the metrics and try again.", tone: "error" },
  goal_created: { text: "Growth goal saved.", tone: "success" },
  goal_failed: { text: "Growth goal save failed.", tone: "error" },
  monthly_review_created: { text: "Monthly strategy review generated.", tone: "success" },
  monthly_review_failed: { text: "Monthly review generation failed.", tone: "error" },
  pillar_created: { text: "Content pillar saved.", tone: "success" },
  pillar_failed: { text: "Content pillar save failed.", tone: "error" },
  profile_audit_created: { text: "Profile audit generated.", tone: "success" },
  profile_audit_failed: { text: "Profile audit generation failed.", tone: "error" },
  rate_limited: { text: "Growth action rate limit reached. Wait a bit before retrying.", tone: "error" },
  weekly_review_created: { text: "Weekly review generated.", tone: "success" },
  weekly_review_failed: { text: "Weekly review generation failed.", tone: "error" },
};

function NoticeBanner({ notice }: { notice?: string }) {
  if (!notice) return null;
  const copy = noticeCopy[notice];
  if (!copy) return null;
  return <div className={cn("network-notice", copy.tone === "error" && "network-notice-error")} role={copy.tone === "error" ? "alert" : "status"}>{copy.text}</div>;
}

function formatDate(value: null | string | undefined) {
  if (!value) return "undated";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatNumber(value: null | number | undefined) {
  if (value === null || value === undefined) return "unknown";
  return new Intl.NumberFormat("en-US").format(value);
}

function shortText(value: null | string | undefined, max = 110) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "none";
  return normalized.length > max ? `${normalized.slice(0, max - 3).trim()}...` : normalized;
}

function badgeForStatus(status: string) {
  if (["active", "published", "completed", "ready"].includes(status)) return "success";
  if (["draft", "planned", "paused", "scheduled"].includes(status)) return "warning";
  if (["failed", "canceled"].includes(status)) return "danger";
  if (["archived"].includes(status)) return "outline";
  return "neutral";
}

function badgeForDecision(decision: null | string | undefined) {
  if (decision === "scale" || decision === "continue") return "success";
  if (decision === "iterate") return "warning";
  if (decision === "stop") return "danger";
  return "outline";
}

function JsonPreview({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).slice(0, 4);
  if (entries.length === 0) return <span>none</span>;
  return <span>{entries.map(([key, item]) => `${key}: ${String(item)}`).join(" / ")}</span>;
}

function MetricSummary({ workspace }: { workspace: GrowthWorkspace }) {
  return (
    <section className="network-metrics" aria-label="Growth metrics">
      <MetricBlock label="Active goals" value={workspace.metrics.activeGoals} />
      <MetricBlock label="Active pillars" value={workspace.metrics.activePillars} />
      <MetricBlock label="Active campaigns" value={workspace.metrics.activeCampaigns} />
      <MetricBlock label="Active experiments" value={workspace.metrics.activeExperiments} />
    </section>
  );
}

function GoalForm({ action }: { action?: FormAction }) {
  return (
    <Card className="network-create" variant="inset">
      <Card.Body>
        <form action={action} className="network-form">
          <RuleHeader folio="§ 01" label="Growth goal" sub="target outcome" />
          <div className="network-form-grid">
            <Input label="Title" name="title" placeholder="Qualified replies" required />
            <Input label="Metric key" name="metric_key" placeholder="qualified_replies" required />
            <Input inputMode="decimal" label="Target" name="target_value" placeholder="80" />
            <Select label="Status" name="status" options={["active", "paused", "completed", "archived", "canceled"].map((status) => ({ label: status, value: status }))} />
          </div>
          <div className="network-form-grid">
            <Input label="Start" name="start_date" type="date" />
            <Input label="End" name="end_date" type="date" />
          </div>
          <Textarea label="Description" name="description" rows={3} />
          <SubmitButton size="sm">Save goal</SubmitButton>
        </form>
      </Card.Body>
    </Card>
  );
}

function PillarForm({ action }: { action?: FormAction }) {
  return (
    <Card className="network-create" variant="inset">
      <Card.Body>
        <form action={action} className="network-form">
          <RuleHeader folio="§ 02" label="Content pillar" sub="strategy spine" />
          <div className="network-form-grid">
            <Input label="Name" name="name" placeholder="Creator systems" required />
            <Input inputMode="numeric" label="Priority" name="priority" placeholder="1" />
          </div>
          <Textarea label="Description" name="description" rows={3} />
          <Textarea helper="Comma or line separated." label="Examples" name="examples" rows={3} />
          <Checkbox defaultChecked id="pillar-active" label="Active" name="active" />
          <SubmitButton size="sm">Save pillar</SubmitButton>
        </form>
      </Card.Body>
    </Card>
  );
}

function CampaignForm({ action, workspace }: { action?: FormAction; workspace: GrowthWorkspace }) {
  return (
    <Card className="network-create" variant="inset">
      <Card.Body>
        <form action={action} className="network-form">
          <RuleHeader folio="§ 03" label="Campaign" sub="hypothesis and cadence" />
          <div className="network-form-grid">
            <Input label="Name" name="name" placeholder="Systems Month" required />
            <Select label="Status" name="status" options={["active", "draft", "paused", "completed", "archived"].map((status) => ({ label: status, value: status }))} />
            <Select label="Pillar" name="pillar_id" options={[{ label: "None", value: "" }, ...workspace.pillars.map((pillar) => ({ label: pillar.name, value: pillar.id }))]} />
          </div>
          <div className="network-form-grid">
            <Input label="Start" name="start_date" type="date" />
            <Input label="End" name="end_date" type="date" />
          </div>
          <Textarea label="Objective" name="objective" rows={3} />
          <Textarea label="Hypothesis" name="hypothesis" rows={3} />
          <Textarea helper="JSON object, for example {&quot;replies&quot;: 40}." label="Target metrics" mono name="target_metrics" rows={3} />
          <SubmitButton size="sm">Save campaign</SubmitButton>
        </form>
      </Card.Body>
    </Card>
  );
}

function CampaignItemForm({ action, campaign }: { action?: FormAction; campaign: Campaign | null }) {
  return (
    <Card className="network-create" variant="inset">
      <Card.Body>
        <form action={action} className="network-form">
          <RuleHeader folio="§ 04" label="Campaign item" sub="manual link" />
          <input name="campaign_id" type="hidden" value={campaign?.id ?? ""} />
          <div className="network-form-grid">
            <Select label="Type" name="entity_type" options={["x_post", "x_thread", "reply", "quote_post", "blog_post", "blog_to_x_series"].map((type) => ({ label: type.replaceAll("_", " "), value: type }))} />
            <Input label="Entity id" mono name="entity_id" placeholder="optional uuid" />
            <Input inputMode="numeric" label="Sequence" name="sequence_index" placeholder="0" />
            <Select label="Status" name="status" options={["planned", "drafted", "scheduled", "published", "completed", "failed", "canceled", "archived"].map((status) => ({ label: status, value: status }))} />
          </div>
          <div className="network-form-grid">
            <Input label="Role" name="role" placeholder="anchor / proof / cta" />
            <Input label="Scheduled" name="scheduled_for" type="datetime-local" />
          </div>
          <SubmitButton disabled={!campaign} size="sm">Link item</SubmitButton>
        </form>
      </Card.Body>
    </Card>
  );
}

export function CampaignCard({ campaign, items }: { campaign: Campaign; items: CampaignItem[] }) {
  return (
    <Card className="network-post-card">
      <Card.Header>
        <div>
          <h2 className="network-card-title smallcaps">{campaign.name}</h2>
          <p className="network-list-text">{shortText(campaign.objective)}</p>
        </div>
        <Badge variant={badgeForStatus(campaign.status)}>{campaign.status}</Badge>
      </Card.Header>
      <Card.Body>
        <KeyValueRow label="Pillar" value={campaign.pillarName ?? "none"} />
        <KeyValueRow label="Window" mono value={`${campaign.startDate ?? "open"} / ${campaign.endDate ?? "open"}`} />
        <KeyValueRow label="Items" mono value={items.length} />
        <KeyValueRow label="Hypothesis" value={shortText(campaign.hypothesis)} />
        <KeyValueRow label="Targets"><JsonPreview value={campaign.targetMetrics} /></KeyValueRow>
      </Card.Body>
      <Card.Footer>
        <LinkButton
          aria-label={`Inspect campaign ${campaign.name}`}
          href={{ pathname: "/campaigns", query: { selectedCampaign: campaign.id } }}
          size="sm"
          variant="secondary"
        >
          Inspect
        </LinkButton>
      </Card.Footer>
    </Card>
  );
}

function CampaignItemsTable({ items }: { items: CampaignItem[] }) {
  if (items.length === 0) return <EmptyState message="Link posts, blogs, replies, or series to make campaign performance visible." title="No campaign items" />;
  return (
    <Table
      aria-label="Campaign item table"
      columns={[
        { header: "Type", key: "type", rowHeader: true },
        { header: "Role", key: "role" },
        { header: "Status", key: "status" },
        { header: "Scheduled", key: "scheduled" },
      ]}
      rows={items.map((item) => ({
        id: item.id,
        role: item.role ?? "none",
        scheduled: <span className="mono">{formatDate(item.scheduledFor)}</span>,
        status: <Badge variant={badgeForStatus(item.status)}>{item.status}</Badge>,
        type: item.entityType.replaceAll("_", " "),
      }))}
    />
  );
}

export function GrowthReviewSection({ review, title }: { review: GrowthReview | null; title: string }) {
  if (!review) return <EmptyState message="Generate a review after campaigns, experiments, or imported posts exist. Thin data remains marked as speculation." title={`No ${title.toLowerCase()}`} />;
  const strategy = typeof review.report.weekly_strategy === "string" ? review.report.weekly_strategy : typeof review.report.summary === "string" ? review.report.summary : "Review report stored.";
  return (
    <Card className="network-report" variant="inset">
      <Card.Header>
        <div>
          <h2 className="network-card-title smallcaps">{title}</h2>
          <p className="network-list-text">{shortText(strategy, 180)}</p>
        </div>
        <Badge variant={review.confidenceLabel === "speculation" ? "warning" : "success"}>{review.confidenceLabel}</Badge>
      </Card.Header>
      <Card.Body>
        <KeyValueRow label="Window" mono value={`${review.periodStart} / ${review.periodEnd}`} />
        <KeyValueRow label="Evidence" mono value={review.evidence.length} />
        {review.recommendations.slice(0, 5).map((recommendation) => (
          <AssumptionFlag key={recommendation} label="Recommendation">{recommendation}</AssumptionFlag>
        ))}
      </Card.Body>
    </Card>
  );
}

function ReviewForms({ monthlyAction, weeklyAction }: { monthlyAction?: FormAction; weeklyAction?: FormAction }) {
  return (
    <div className="network-pattern-grid">
      <Card variant="inset">
        <Card.Body>
          <form action={weeklyAction} className="network-form">
            <RuleHeader folio="§ 07" label="Weekly review" sub="cited strategy" />
            <div className="network-form-grid">
              <Input label="Week start" name="week_start" type="date" />
              <Input label="Week end" name="week_end" type="date" />
            </div>
            <Textarea label="Owner notes" name="owner_notes" rows={3} />
            <SubmitButton size="sm">Generate weekly review</SubmitButton>
          </form>
        </Card.Body>
      </Card>
      <Card variant="inset">
        <Card.Body>
          <form action={monthlyAction} className="network-form">
            <RuleHeader folio="§ 08" label="Monthly review" sub="strategy decisions" />
            <div className="network-form-grid">
              <Input label="Month start" name="month_start" type="date" />
              <Input label="Month end" name="month_end" type="date" />
            </div>
            <Textarea label="Owner notes" name="owner_notes" rows={3} />
            <SubmitButton size="sm">Generate monthly review</SubmitButton>
          </form>
        </Card.Body>
      </Card>
    </div>
  );
}

function GoalsAndPillars({ workspace }: { workspace: GrowthWorkspace }) {
  return (
    <section className="network-pattern-grid" aria-label="Goals and pillars">
      <Card>
        <Card.Header>
          <h2 className="network-card-title smallcaps">Goals</h2>
          <Badge variant="outline">{workspace.goals.length}</Badge>
        </Card.Header>
        <Card.Body>
          {workspace.goals.length > 0 ? workspace.goals.slice(0, 5).map((goal) => <KeyValueRow key={goal.id} label={goal.metricKey} mono value={`${formatNumber(goal.targetValue)} / ${goal.status}`} />) : <EmptyState message="Save one metric target to anchor reviews." title="No goals" />}
        </Card.Body>
      </Card>
      <Card>
        <Card.Header>
          <h2 className="network-card-title smallcaps">Pillars</h2>
          <Badge variant="outline">{workspace.pillars.length}</Badge>
        </Card.Header>
        <Card.Body>
          {workspace.pillars.length > 0 ? workspace.pillars.slice(0, 5).map((pillar) => <KeyValueRow key={pillar.id} label={pillar.name} value={pillar.description ?? "no description"} />) : <EmptyState message="Pillars keep campaigns and experiments organized." title="No pillars" />}
        </Card.Body>
      </Card>
    </section>
  );
}

export function GrowthCampaignsView({
  addCampaignItemAction,
  createCampaignAction,
  createGoalAction,
  createPillarAction,
  notice,
  runMonthlyReviewAction,
  runWeeklyReviewAction,
  workspace,
}: GrowthCampaignsViewProps) {
  const selectedItems = workspace.selectedCampaign ? workspace.campaignItems.filter((item) => item.campaignId === workspace.selectedCampaign?.id) : [];
  return (
    <main aria-labelledby="campaigns-title" className="network-page">
      <RuleHeader
        actions={<Badge variant="outline">private strategy</Badge>}
        as="h1"
        folio="§ 22"
        id="campaigns-title"
        label="Campaigns"
        sub="growth operating layer"
      />
      <NoticeBanner notice={notice} />
      <MetricSummary workspace={workspace} />
      <section className="network-workbench">
        <div className="network-main">
          <div className="network-pattern-grid">
            <GoalForm action={createGoalAction} />
            <PillarForm action={createPillarAction} />
          </div>
          <CampaignForm action={createCampaignAction} workspace={workspace} />
          <GoalsAndPillars workspace={workspace} />
          <section aria-label="Campaign cards" className="network-pattern-grid">
            {workspace.campaigns.length > 0 ? workspace.campaigns.map((campaign) => <CampaignCard campaign={campaign} items={workspace.campaignItems.filter((item) => item.campaignId === campaign.id)} key={campaign.id} />) : <EmptyState message="Create a campaign with an objective, hypothesis, pillar, and target metrics." title="No campaigns" />}
          </section>
          <ReviewForms monthlyAction={runMonthlyReviewAction} weeklyAction={runWeeklyReviewAction} />
        </div>
        <section className="network-inspector" aria-label="Selected campaign and reviews">
          <Card variant="inset">
            <Card.Header>
              <h2 className="network-card-title smallcaps">Selected campaign</h2>
              {workspace.selectedCampaign ? <Badge variant={badgeForStatus(workspace.selectedCampaign.status)}>{workspace.selectedCampaign.status}</Badge> : null}
            </Card.Header>
            <Card.Body>
              {workspace.selectedCampaign ? (
                <>
                  <KeyValueRow label="Name" value={workspace.selectedCampaign.name} />
                  <KeyValueRow label="Objective" value={shortText(workspace.selectedCampaign.objective)} />
                  <KeyValueRow label="Pillar" value={workspace.selectedCampaign.pillarName ?? "none"} />
                  <CampaignItemsTable items={selectedItems} />
                  <CampaignItemForm action={addCampaignItemAction} campaign={workspace.selectedCampaign} />
                </>
              ) : (
                <EmptyState message="Select or create a campaign to inspect its items." title="No selected campaign" />
              )}
            </Card.Body>
          </Card>
          <GrowthReviewSection review={workspace.latestWeeklyReview} title="Weekly review" />
          <GrowthReviewSection review={workspace.latestMonthlyReview} title="Monthly review" />
        </section>
      </section>
    </main>
  );
}

function ExperimentForm({ action }: { action?: FormAction }) {
  return (
    <Card className="network-create" variant="inset">
      <Card.Body>
        <form action={action} className="network-form">
          <RuleHeader folio="§ 01" label="Experiment" sub="hypothesis ledger" />
          <div className="network-form-grid">
            <Input label="Title" name="title" placeholder="Contrast hook test" required />
            <Select label="Type" name="experiment_type" options={["hook", "topic", "format", "posting_time", "cta", "reply_strategy", "blog_repurposing"].map((type) => ({ label: type.replaceAll("_", " "), value: type }))} />
            <Input label="Success metric" name="success_metric" placeholder="reply_count" />
            <Select label="Status" name="status" options={["active", "draft", "paused", "completed", "archived"].map((status) => ({ label: status, value: status }))} />
          </div>
          <div className="network-form-grid">
            <Input label="Start" name="start_date" type="date" />
            <Input label="End" name="end_date" type="date" />
          </div>
          <Textarea label="Hypothesis" name="hypothesis" rows={3} />
          <Textarea helper="JSON filters, for example {&quot;campaign_id&quot;:&quot;...&quot;}." label="Included content filter" mono name="content_filters" rows={3} />
          <SubmitButton size="sm">Save experiment</SubmitButton>
        </form>
      </Card.Body>
    </Card>
  );
}

function ResultForm({ action, experiment }: { action?: FormAction; experiment: Experiment | null }) {
  return (
    <Card className="network-create" variant="inset">
      <Card.Body>
        <form action={action} className="network-form">
          <RuleHeader folio="§ 03" label="Result" sub="AI interpretation" />
          <input name="experiment_id" type="hidden" value={experiment?.id ?? ""} />
          <Textarea helper="JSON object with the starting values." label="Baseline metrics" mono name="baseline_metrics" rows={4} />
          <Textarea helper="JSON object with the outcome values." label="Result metrics" mono name="metrics" rows={4} />
          <Textarea label="Result notes" name="result" rows={3} />
          <Select label="Manual decision" name="decision" options={[{ label: "Let AI recommend", value: "" }, "continue", "stop", "iterate", "scale"].map((item) => (typeof item === "string" ? { label: item, value: item } : item))} />
          <input name="run_ai" type="hidden" value="true" />
          <SubmitButton disabled={!experiment} size="sm">Record result</SubmitButton>
        </form>
      </Card.Body>
    </Card>
  );
}

export function ExperimentLedger({ experiments }: { experiments: Experiment[] }) {
  if (experiments.length === 0) return <EmptyState message="Create a hook, topic, format, timing, CTA, reply, or blog-repurposing experiment." title="No experiments" />;
  return (
    <Table
      aria-label="Experiment ledger"
      columns={[
        { header: "Experiment", key: "experiment", rowHeader: true },
        { header: "Type", key: "type" },
        { header: "Window", key: "window" },
        { header: "Results", key: "results", numeric: true },
        { header: "Decision", key: "decision" },
      ]}
      rows={experiments.map((experiment) => ({
        decision: <Badge variant={badgeForDecision(experiment.latestResult?.decision ?? experiment.decision)}>{experiment.latestResult?.decision ?? experiment.decision ?? "undecided"}</Badge>,
        experiment: <Link href={{ pathname: "/experiments", query: { selectedExperiment: experiment.id } }}>{experiment.title}</Link>,
        id: experiment.id,
        results: experiment.resultCount,
        type: experiment.experimentType.replaceAll("_", " "),
        window: <span className="mono">{experiment.startDate ?? "open"} / {experiment.endDate ?? "open"}</span>,
      }))}
    />
  );
}

export function ProfileAuditCard({ audit }: { audit: ProfileAudit | null }) {
  if (!audit) return <EmptyState message="Run a profile audit from a manual bio/header/pinned-post snapshot. Recommendations remain owner-reviewed." title="No profile audit" />;
  return (
    <Card className="network-report" variant="inset">
      <Card.Header>
        <div>
          <h2 className="network-card-title smallcaps">Profile audit</h2>
          <p className="network-list-text">Generated {formatDate(audit.generatedAt)}</p>
        </div>
        <Badge variant={audit.confidenceLabel === "speculation" ? "warning" : "success"}>{audit.confidenceLabel}</Badge>
      </Card.Header>
      <Card.Body>
        <ScoreGauge label="Profile score" value={audit.score ?? 0} />
        {audit.findings.slice(0, 4).map((finding) => <AssumptionFlag key={finding} label="Finding">{finding}</AssumptionFlag>)}
        {audit.recommendations.slice(0, 4).map((recommendation) => <AssumptionFlag key={recommendation} label="Recommendation">{recommendation}</AssumptionFlag>)}
        {audit.suggestedPinnedPostDrafts.slice(0, 2).map((draft) => (
          <div className="analytics-explanation" key={draft.text}>
            <p className="network-list-text">{draft.text}</p>
            <p className="network-muted">{draft.rationale}</p>
          </div>
        ))}
      </Card.Body>
    </Card>
  );
}

function ProfileAuditForm({ action }: { action?: FormAction }) {
  return (
    <Card className="network-create" variant="inset">
      <Card.Body>
        <form action={action} className="network-form">
          <RuleHeader folio="§ 04" label="Profile audit" sub="manual snapshot" />
          <Textarea label="Bio" name="bio" rows={3} />
          <Textarea label="Header notes" name="header_notes" rows={3} />
          <Textarea label="Avatar notes" name="avatar_notes" rows={2} />
          <Textarea label="Pinned post" name="pinned_post_text" rows={4} />
          <Textarea label="Recent grid notes" name="recent_post_grid_notes" rows={3} />
          <Input label="Link / CTA" name="link_cta" />
          <Textarea label="Owner notes" name="owner_notes" rows={3} />
          <SubmitButton size="sm">Run profile audit</SubmitButton>
        </form>
      </Card.Body>
    </Card>
  );
}

function SelectedExperiment({ experiment }: { experiment: Experiment | null }) {
  if (!experiment) return <EmptyState message="Select or create an experiment to inspect the hypothesis and latest result." title="No selected experiment" />;
  return (
    <Card variant="inset">
      <Card.Header>
        <div>
          <h2 className="network-card-title smallcaps">{experiment.title}</h2>
          <p className="network-list-text">{shortText(experiment.hypothesis)}</p>
        </div>
        <Badge variant={badgeForStatus(experiment.status)}>{experiment.status}</Badge>
      </Card.Header>
      <Card.Body>
        <KeyValueRow label="Type" value={experiment.experimentType.replaceAll("_", " ")} />
        <KeyValueRow label="Metric" mono value={experiment.successMetric ?? "none"} />
        <KeyValueRow label="Decision" value={<Badge variant={badgeForDecision(experiment.latestResult?.decision ?? experiment.decision)}>{experiment.latestResult?.decision ?? experiment.decision ?? "undecided"}</Badge>} />
        {experiment.latestResult ? (
          <>
            <KeyValueRow label="Result" value={shortText(experiment.latestResult.result)} />
            <KeyValueRow label="AI summary" value={shortText(String(experiment.latestResult.aiInterpretation.result_summary ?? "stored"))} />
          </>
        ) : null}
      </Card.Body>
    </Card>
  );
}

export function GrowthExperimentsView({ createExperimentAction, notice, recordExperimentResultAction, runProfileAuditAction, workspace }: GrowthExperimentsViewProps) {
  return (
    <main aria-labelledby="experiments-title" className="network-page">
      <RuleHeader
        actions={<Badge variant="outline">decision ledger</Badge>}
        as="h1"
        folio="§ 22"
        id="experiments-title"
        label="Experiments"
        sub="hypotheses and outcomes"
      />
      <NoticeBanner notice={notice} />
      <MetricSummary workspace={workspace} />
      <section className="network-workbench">
        <div className="network-main">
          <ExperimentForm action={createExperimentAction} />
          <Card className="network-list">
            <Card.Header>
              <RuleHeader folio="§ 02" label="Experiment ledger" sub="current and past" />
            </Card.Header>
            <Card.Body>
              <ExperimentLedger experiments={workspace.experiments} />
            </Card.Body>
          </Card>
          <ProfileAuditForm action={runProfileAuditAction} />
        </div>
        <section className="network-inspector" aria-label="Selected experiment and profile audit">
          <SelectedExperiment experiment={workspace.selectedExperiment} />
          <ResultForm action={recordExperimentResultAction} experiment={workspace.selectedExperiment} />
          <ProfileAuditCard audit={workspace.latestProfileAudit} />
        </section>
      </section>
    </main>
  );
}
