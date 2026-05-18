import type { ComponentProps } from "react";
import Link from "next/link";

import { CopyButton } from "@/components/ai/copy-button";
import {
  AssumptionFlag,
  Badge,
  Card,
  EmptyState,
  MetricBlock,
  RewriteCard,
  RuleHeader,
  ScoreGauge,
  Select,
  SubmitButton,
  Textarea,
} from "@/components/design-system";
import type { AlgoAnalysisReport } from "@/lib/algo-analyzer";

type FormAction = ComponentProps<"form">["action"];

type AnalyzerFilters = {
  notice?: string;
  selected?: string;
};

export type AlgoAnalyzerViewProps = {
  analyzeAction?: FormAction;
  filters: AnalyzerFilters;
  report: AlgoAnalysisReport | null;
  reports: AlgoAnalysisReport[];
  saveIdeaAction?: FormAction;
  saveOutputAction?: FormAction;
};

const contentTypeOptions = [
  { label: "Post", value: "post" },
  { label: "Thread", value: "thread" },
  { label: "Reply", value: "reply" },
  { label: "Quote", value: "quote" },
  { label: "Blog-to-X", value: "blog-to-X" },
];

const metricLabels: Array<[keyof AlgoAnalysisReport["metricScores"], string]> = [
  ["hook_strength", "hook strength"],
  ["clarity", "clarity"],
  ["specificity", "specificity"],
  ["novelty", "novelty"],
  ["emotional_pull", "emotional pull"],
  ["reply_engagement_potential", "reply potential"],
  ["readability_compression", "compression"],
  ["format_suitability", "format fit"],
  ["algorithm_hygiene_risk", "hygiene"],
];

function noticeText(notice?: string) {
  if (notice === "analysis_created") return "Draft analysis saved with prompt run and report records.";
  if (notice === "rewrite_output_saved") return "Rewrite saved to generated outputs.";
  if (notice === "rewrite_idea_saved") return "Rewrite saved as a content idea.";
  if (notice?.endsWith("failed")) return "The analyzer request failed validation or could not be completed safely.";
  if (notice === "rate_limited") return "Analyzer rate limit reached. Try again after the window resets.";
  return null;
}

function noticeTone(notice?: string) {
  if (!notice) return null;
  if (notice === "rate_limited") return "warning" as const;
  if (notice.endsWith("failed")) return "danger" as const;
  return "success" as const;
}

function checkbox(name: string, label: string, defaultChecked = false) {
  return (
    <label className="checkbox-row">
      <input name={name} type="hidden" value="false" />
      <input className="checkbox-native" defaultChecked={defaultChecked} name={name} type="checkbox" value="true" />
      <span aria-hidden="true" className="checkbox-box" />
      <span className="checkbox-label">{label}</span>
    </label>
  );
}

function RecentReports({ reports, selectedId }: { reports: AlgoAnalysisReport[]; selectedId?: string }) {
  if (reports.length === 0) {
    return <EmptyState message="Analyze a draft to create the first persisted heuristic report." title="No analysis history" />;
  }

  return (
    <div aria-label="Recent algorithm reports" className="ai-workflow-history">
      {reports.map((item) => (
        <Link
          aria-current={item.id === selectedId ? "page" : undefined}
          className="ai-history-row"
          href={{ pathname: "/algo-analyzer", query: { selected: item.id } }}
          key={item.id}
        >
          <span className="ai-history-score mono">{item.overallScore}</span>
          <span className="ai-history-text">{item.draftText}</span>
          <Badge variant={item.id === selectedId ? "accent" : "outline"}>{item.contentType}</Badge>
        </Link>
      ))}
    </div>
  );
}

function ReportSummary({ report }: { report: AlgoAnalysisReport }) {
  return (
    <section aria-labelledby="analyzer-score-title" className="analyzer-report">
      <RuleHeader folio="§ 02" id="analyzer-score-title" label="Score surface" sub="9 metrics" />
      <div className="analyzer-score-grid">
        <ScoreGauge label="overall heuristic score" value={report.overallScore} />
        {metricLabels.map(([key, label]) => (
          <MetricBlock key={key} label={label} value={`${report.metricScores[key]}/10`} />
        ))}
      </div>
      <div className="analyzer-diagnosis-grid">
        <Card>
          <Card.Header>
            <span className="workflow-card-title smallcaps">Diagnosis</span>
            <Badge variant="warning">{report.confidenceLabel}</Badge>
          </Card.Header>
          <Card.Body>
            <p className="workflow-copy">{report.diagnosis.highestLeverageImprovement}</p>
            <ul className="workflow-list">
              {report.diagnosis.weaknesses.map((weakness) => (
                <li key={weakness}>{weakness}</li>
              ))}
            </ul>
          </Card.Body>
        </Card>
        <Card>
          <Card.Header>
            <span className="workflow-card-title smallcaps">Publish readiness</span>
            <Badge variant={report.publishReadiness.status === "ready" ? "success" : report.publishReadiness.status === "risky" ? "danger" : "warning"}>
              {report.publishReadiness.status}
            </Badge>
          </Card.Header>
          <Card.Body>
            <ul className="workflow-list">
              {(report.publishReadiness.notes.length > 0 ? report.publishReadiness.notes : report.riskWarnings).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      </div>
    </section>
  );
}

function RewriteList({ report, saveIdeaAction, saveOutputAction }: Pick<AlgoAnalyzerViewProps, "saveIdeaAction" | "saveOutputAction"> & { report: AlgoAnalysisReport }) {
  if (report.rewrites.length === 0) {
    return <EmptyState message="The AI response validated, but did not include rewrite candidates." title="No rewrites returned" />;
  }

  return (
    <section aria-labelledby="analyzer-rewrites-title" className="analyzer-rewrites">
      <RuleHeader folio="§ 03" id="analyzer-rewrites-title" label="Rewrites" sub={`${report.rewrites.length} candidates`} />
      {report.rewrites.map((rewrite, index) => (
        <RewriteCard
          actions={
            <>
              <CopyButton text={rewrite.text} />
              <form action={saveOutputAction} className="inline-form">
                <input name="report_id" type="hidden" value={report.id} />
                <input name="rewrite_index" type="hidden" value={index} />
                <SubmitButton size="sm" variant="secondary">
                  Save output
                </SubmitButton>
              </form>
              <form action={saveIdeaAction} className="inline-form">
                <input name="report_id" type="hidden" value={report.id} />
                <input name="rewrite_index" type="hidden" value={index} />
                <input name="title" type="hidden" value={`Algo rewrite ${index + 1}`} />
                <input name="tags" type="hidden" value="algorithm-analysis, rewrite" />
                <SubmitButton size="sm" variant="tertiary">
                  Save idea
                </SubmitButton>
              </form>
            </>
          }
          key={`${rewrite.text}-${index}`}
          label={`Rewrite ${index + 1}`}
          rationale={rewrite.rationale}
          text={rewrite.text}
        />
      ))}
    </section>
  );
}

export function AlgoAnalyzerView({ analyzeAction, filters, report, reports, saveIdeaAction, saveOutputAction }: AlgoAnalyzerViewProps) {
  const notice = noticeText(filters.notice);
  const tone = noticeTone(filters.notice);

  return (
    <main aria-labelledby="algo-analyzer-title" className="ai-workflow-page analyzer-page">
      <RuleHeader
        actions={<Badge variant="warning">heuristic only</Badge>}
        as="h1"
        folio="§ 03"
        id="algo-analyzer-title"
        label="Algorithm analyzer"
        sub="draft scoring"
      />
      {notice && tone ? (
        <div className={`workflow-notice workflow-notice-${tone}`} role={tone === "success" ? "status" : "alert"}>
          {notice}
        </div>
      ) : null}
      <AssumptionFlag label="Heuristic analyzer">
        Heuristic analyzer — not the official X algorithm. Scores are draft-quality estimates for owner review, not platform guarantees.
      </AssumptionFlag>
      <section className="ai-workflow-workbench">
        <div className="ai-workflow-main">
          <form action={analyzeAction} className="workflow-form">
            <RuleHeader folio="§ 01" id="analyzer-form-title" label="Analyze draft" sub="structured AI output" />
            <Textarea
              label="Draft textarea"
              name="draft_text"
              placeholder="Paste the draft, reply, quote, thread seed, or blog-to-X excerpt."
              required
              rows={9}
            />
            <div className="workflow-form-grid">
              <Select defaultValue="post" label="Content type" name="content_type" options={contentTypeOptions} />
              <div className="workflow-checks">
                {checkbox("use_voice_profile", "Use active voice profile")}
                {checkbox("generate_thread", "Generate thread expansion")}
                {checkbox("include_publish_readiness", "Include publish readiness", true)}
              </div>
            </div>
            <SubmitButton>Analyze draft</SubmitButton>
          </form>
          {report ? (
            <>
              <ReportSummary report={report} />
              <RewriteList report={report} saveIdeaAction={saveIdeaAction} saveOutputAction={saveOutputAction} />
            </>
          ) : (
            <EmptyState
              message="Submit a draft to create a persisted heuristic report with scores, diagnosis, rewrites, and prompt-run logs."
              title="No draft analyzed"
            />
          )}
        </div>
        <section aria-labelledby="analyzer-recent-title" className="ai-workflow-inspector">
          <RuleHeader folio="§ 04" id="analyzer-recent-title" label="Recent reports" sub={`${reports.length} saved`} />
          <RecentReports reports={reports} selectedId={report?.id} />
          {report?.threadExpansion.length ? (
            <Card>
              <Card.Header>
                <span className="workflow-card-title smallcaps">Thread expansion</span>
              </Card.Header>
              <Card.Body>
                <ol className="workflow-list">
                  {report.threadExpansion.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </Card.Body>
            </Card>
          ) : null}
        </section>
      </section>
    </main>
  );
}
