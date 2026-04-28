import Link from "next/link";

import { AssumptionFlag, Badge, Button, Card, EmptyState, KeyValueRow, MetricBlock, RewriteCard, RuleHeader, Textarea } from "@/components/design-system";
import type { CoachEvidenceCitation, CoachReport, CoachWorkspace } from "@/lib/coach";
import { noticeText } from "@/lib/coach";

export type CoachWorkspaceViewProps = {
  askAction: (formData: FormData) => Promise<void>;
  generatePlaybookAction: (formData: FormData) => Promise<void>;
  workspace: CoachWorkspace;
};

function confidenceVariant(confidence: string) {
  if (confidence === "fact") return "success";
  if (confidence === "inference" || confidence === "mixed") return "warning";
  if (confidence === "speculation") return "outline";
  return "neutral";
}

function formatDate(value: string) {
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

function shortText(value: null | string | undefined, max = 120) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Untitled coach report";
  return normalized.length > max ? `${normalized.slice(0, max - 3).trim()}...` : normalized;
}

function Notice({ notice }: { notice?: string }) {
  const text = noticeText(notice);
  if (!text) return null;

  return (
    <AssumptionFlag className="coach-notice" label="Status">
      {text}
    </AssumptionFlag>
  );
}

function SourceMetrics({ workspace }: { workspace: CoachWorkspace }) {
  const { sourceCounts } = workspace;

  return (
    <section className="coach-metrics" aria-label="Coach source inventory">
      <MetricBlock label="Owner posts" value={sourceCounts.ownerPosts} />
      <MetricBlock label="Ideas" value={sourceCounts.ideas} />
      <MetricBlock label="Blogs" value={sourceCounts.blogs} />
      <MetricBlock label="Active experiments" value={sourceCounts.activeExperiments} />
      <MetricBlock label="Voice profiles" value={sourceCounts.activeVoiceProfiles} />
      <MetricBlock label="Coach reports" value={sourceCounts.coachReports} />
    </section>
  );
}

function CoachComposer({ action, prompts }: { action: (formData: FormData) => Promise<void>; prompts: CoachWorkspace["suggestedPrompts"] }) {
  return (
    <section className="coach-composer" aria-label="Ask coach">
      <RuleHeader folio="§ 01" label="Ask coach" sub="evidence-cited" />
      <form action={action} className="coach-question-form">
        <Textarea label="Question" name="question" placeholder="Ask about hooks, cadence, experiments, repurposing, or what to write next." required rows={5} />
        <Button type="submit">Ask coach</Button>
      </form>
      <div className="coach-prompt-grid" aria-label="Suggested prompts">
        {prompts.map((prompt) => (
          <form action={action} className="coach-suggested-form" key={prompt.label}>
            <input name="question" type="hidden" value={prompt.question} />
            <button className="coach-prompt" type="submit">
              <span className="coach-prompt-label smallcaps">{prompt.label}</span>
              <span>{prompt.question}</span>
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}

function PlaybookPanel({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <section className="coach-playbook-panel" aria-label="Content playbook">
      <RuleHeader folio="§ 02" label="Content playbook" sub="history synthesis" />
      <form action={action} className="coach-playbook-form">
        <p>Generate a reusable playbook from posts, ideas, blogs, campaigns, experiments, publishing history, and the active voice profile.</p>
        <Button variant="secondary" type="submit">Generate playbook</Button>
      </form>
    </section>
  );
}

function ReportList({ reports, selectedReport }: Pick<CoachWorkspace, "reports" | "selectedReport">) {
  if (reports.length === 0) {
    return <EmptyState message="Ask a coach question or generate a playbook to create the first cited report." title="No coach reports" />;
  }

  return (
    <section className="coach-report-list" aria-label="Coach report history">
      <RuleHeader folio="§ 03" label="History" sub="saved reports" />
      <div className="coach-report-links">
        {reports.map((report) => {
          const selected = report.id === selectedReport?.id;

          return (
            <Link aria-current={selected ? "page" : undefined} className={selected ? "coach-report-link coach-report-link-selected" : "coach-report-link"} href={`/coach?selected=${report.id}`} key={report.id}>
              <span className="coach-report-kind smallcaps">{report.kind.replaceAll("_", " ")}</span>
              <span>{shortText(report.question ?? report.answer, 96)}</span>
              <span className="coach-report-date mono">{formatDate(report.generated_at)}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ChatMessage({ report }: { report: CoachReport }) {
  return (
    <article className="chat-message coach-chat-message">
      <div className="chat-message-head">
        <span className="chat-role smallcaps">Coach</span>
        <div className="coach-confidence-row">
          {report.confidence_labels.map((label) => (
            <Badge key={label} variant={confidenceVariant(label)}>{label}</Badge>
          ))}
        </div>
      </div>
      {report.question ? <p className="chat-question">{report.question}</p> : null}
      <p className="chat-answer">{report.answer ?? "No narrative answer was stored for this report."}</p>
    </article>
  );
}

function RecommendationCards({ report }: { report: CoachReport }) {
  if (report.recommendations.length === 0 && report.diagnosis.length === 0) {
    return <EmptyState message="This report did not include recommendations." title="No recommendation cards" />;
  }

  return (
    <section className="coach-recommendation-grid" aria-label="Coach recommendations">
      {report.diagnosis.map((item) => (
        <Card key={`diagnosis-${item}`} variant="inset">
          <Card.Header>
            <h2 className="coach-card-title smallcaps">Diagnosis</h2>
            <Badge variant="warning">inference</Badge>
          </Card.Header>
          <Card.Body>
            <p>{item}</p>
          </Card.Body>
        </Card>
      ))}
      {report.recommendations.map((item) => (
        <Card key={`recommendation-${item}`} variant="inset">
          <Card.Header>
            <h2 className="coach-card-title smallcaps">Recommendation</h2>
            <Badge variant="outline">owner review</Badge>
          </Card.Header>
          <Card.Body>
            <p>{item}</p>
          </Card.Body>
        </Card>
      ))}
    </section>
  );
}

function DraftCards({ report }: { report: CoachReport }) {
  if (report.draft_posts.length === 0) return null;

  return (
    <section className="coach-draft-list" aria-label="Draft post suggestions">
      <RuleHeader folio="§ 04" label="Drafts" sub="not approved" />
      {report.draft_posts.map((draft) => (
        <RewriteCard key={`${draft.text}-${draft.rationale}`} label="Coach draft" rationale={draft.rationale} text={draft.text} />
      ))}
    </section>
  );
}

function SelectedReport({ report }: { report: CoachReport | null }) {
  if (!report) {
    return <EmptyState action={<Link className="btn btn-secondary btn-sm" href="/post-history"><span className="btn-label">Import posts</span></Link>} message="The coach can answer from real owner records after posts, ideas, blogs, or experiments exist." title="Ask the coach" />;
  }

  return (
    <section className="coach-selected-report" aria-label="Selected coach report">
      <ChatMessage report={report} />
      <RecommendationCards report={report} />
      <DraftCards report={report} />
    </section>
  );
}

function EvidenceItem({ item }: { item: CoachEvidenceCitation }) {
  return (
    <article className="coach-evidence-item">
      <div className="coach-evidence-head">
        <Badge variant={confidenceVariant(item.confidence)}>{item.confidence}</Badge>
        <span className="mono">{item.record_type}:{item.record_id}</span>
      </div>
      <p>{item.snippet}</p>
    </article>
  );
}

function EvidenceInspector({ report }: { report: CoachReport | null }) {
  return (
    <aside className="coach-inspector" aria-label="Evidence inspector">
      <Card>
        <Card.Header>
          <RuleHeader folio="§" label="Evidence inspector" sub="cited records" />
        </Card.Header>
        <Card.Body>
          {report ? (
            <div className="coach-inspector-body">
              <KeyValueRow label="Report" mono value={report.id} />
              <KeyValueRow label="Kind" value={report.kind.replaceAll("_", " ")} />
              <KeyValueRow label="Generated" mono value={formatDate(report.generated_at)} />
              <KeyValueRow label="Model" mono value={report.model ?? "unknown"} />
              <KeyValueRow label="Prompt" mono value={report.prompt_version ?? "unknown"} />
              <div className="coach-evidence-list">
                {report.evidence.length > 0 ? report.evidence.map((item) => <EvidenceItem item={item} key={`${item.record_type}:${item.record_id}`} />) : <EmptyState message="This report has no internal citations, so claims should be treated as speculation." title="No citations" />}
              </div>
            </div>
          ) : (
            <EmptyState message="Select or generate a report to inspect cited records." title="No report selected" />
          )}
        </Card.Body>
      </Card>
    </aside>
  );
}

export function CoachWorkspaceView({ askAction, generatePlaybookAction, workspace }: CoachWorkspaceViewProps) {
  return (
    <main className="coach-page" aria-labelledby="coach-title">
      <h1 className="workflow-title" id="coach-title">Coach</h1>
      <RuleHeader actions={<Badge variant="outline">internal evidence only</Badge>} folio="§ 19" label="Coach" sub="retrieval and playbooks" />
      <Notice notice={workspace.notice} />
      <SourceMetrics workspace={workspace} />
      <section className="coach-workbench">
        <div className="coach-main">
          <CoachComposer action={askAction} prompts={workspace.suggestedPrompts} />
          <PlaybookPanel action={generatePlaybookAction} />
          <SelectedReport report={workspace.selectedReport} />
          <ReportList reports={workspace.reports} selectedReport={workspace.selectedReport} />
        </div>
        <EvidenceInspector report={workspace.selectedReport} />
      </section>
    </main>
  );
}
