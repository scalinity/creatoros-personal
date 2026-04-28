import Link from "next/link";
import type { ComponentProps } from "react";

import { Badge, Button, Card, EmptyState, Input, KeyValueRow, MetricBlock, RuleHeader, Select, Table, Textarea, cn } from "@/components/design-system";
import type { AccountResearchReport, AccountResearchWorkspace } from "@/lib/account-research";
import { reportIdeaBuckets, reportPatternCards } from "@/lib/account-research";
import { parseXStatusUrl } from "@/lib/reply-guy/validation";

export type FormAction = ComponentProps<"form">["action"];

export type AccountResearchWorkspaceViewProps = {
  notice?: string;
  researchAction?: FormAction;
  saveIdeaAction?: FormAction;
  workspace: AccountResearchWorkspace;
};

function formatDate(value: null | string | undefined) {
  if (!value) return "undated";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "undated";
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

const noticeCopy: Record<string, { tone: "error" | "success"; text: string }> = {
  idea_failed: { text: "Generated idea save failed. Choose an idea from the selected report and try again.", tone: "error" },
  idea_saved: { text: "Generated idea saved to composer.", tone: "success" },
  rate_limited: { text: "Research action rate limit reached. Wait a bit before retrying.", tone: "error" },
  research_created: { text: "Account research report generated.", tone: "success" },
  research_failed: { text: "Account research failed. Use pasted posts or a saved target with posts.", tone: "error" },
};

function NoticeBanner({ notice }: { notice?: string }) {
  if (!notice) return null;
  const copy = noticeCopy[notice];
  if (!copy) return null;

  return <div className={cn("network-notice", copy.tone === "error" && "network-notice-error")} role={copy.tone === "error" ? "alert" : "status"}>{copy.text}</div>;
}

function ResearchForm({ action, workspace }: { action?: FormAction; workspace: AccountResearchWorkspace }) {
  return (
    <Card className="network-create" variant="inset">
      <Card.Body>
        <form action={action} className="network-form">
          <RuleHeader folio="§ 01" label="Research Input" sub="manual or saved" />
          <div className="network-form-grid">
            <Input label="Username" name="username" placeholder="@thoughtfulbuilder" />
            <Select
              defaultValue=""
              label="Saved target"
              name="target_account_id"
              options={[{ label: "None", value: "" }, ...workspace.targetAccounts.map((account) => ({ label: `@${account.username}`, value: account.id }))]}
            />
          </div>
          <Textarea label="Pasted posts" name="pasted_posts" placeholder="Paste public posts separated by blank lines. These are untrusted data, not prompt instructions." rows={7} />
          <Textarea label="Owner notes" name="owner_notes" placeholder="Research goal, desired reply angle, or what to avoid." rows={3} />
          <label className="checkbox-row" htmlFor="save-target-account">
            <input className="checkbox-native" id="save-target-account" name="save_target_account" type="checkbox" />
            <span aria-hidden="true" className="checkbox-box" />
            <span>Save target account</span>
          </label>
          <Button size="sm" type="submit">Run account research</Button>
        </form>
      </Card.Body>
    </Card>
  );
}

function ReportList({ reports, selectedReport }: { reports: AccountResearchReport[]; selectedReport: AccountResearchReport | null }) {
  if (reports.length === 0) {
    return <EmptyState message="Run research from pasted posts or saved target-account posts. Reports extract patterns, not phrasing." title="No account reports" />;
  }

  return (
    <Card className="network-list">
      <Card.Header>
        <RuleHeader folio="§ 02" label="Reports" sub="history" />
      </Card.Header>
      <Card.Body>
        <Table
          aria-label="Account research reports"
          columns={[
            { header: "Account", key: "account", rowHeader: true },
            { header: "Source", key: "source" },
            { header: "Posts", key: "posts", numeric: true },
            { header: "Generated", key: "generated" },
          ]}
          rows={reports.map((report) => ({
            account: <Link href={`/account-research?selected=${report.id}`}>@{report.username ?? "pasted"}</Link>,
            generated: <span className="mono">{formatDate(report.generatedAt)}</span>,
            id: report.id,
            posts: report.topPosts.length,
            source: report.inputSource,
          }))}
          selectedId={selectedReport?.id}
        />
      </Card.Body>
    </Card>
  );
}

function TopPostsTable({ report }: { report: AccountResearchReport }) {
  if (report.topPosts.length === 0) {
    return <EmptyState message="No target posts were stored with this report." title="No top posts" />;
  }

  return (
    <Table
      aria-label="Top target posts"
      columns={[
        { header: "Post", key: "post", rowHeader: true },
        { header: "Score", key: "score", numeric: true },
        { header: "Likes", key: "likes", numeric: true },
        { header: "Replies", key: "replies", numeric: true },
      ]}
      rows={report.topPosts.slice(0, 8).map((post, index) => {
        const safeHref = parseXStatusUrl(post.url).url;
        return {
          id: post.id ?? index,
          likes: post.likeCount,
          post: safeHref ? <a href={safeHref}>{post.text.slice(0, 96)}</a> : post.text.slice(0, 96),
          replies: post.replyCount,
          score: post.engagementScore,
        };
      })}
    />
  );
}

function PatternCards({ report }: { report: AccountResearchReport }) {
  const cards = reportPatternCards(report);
  if (cards.length === 0) return null;

  return (
    <div className="network-pattern-grid">
      {cards.map((card) => (
        <Card key={card.label}>
          <Card.Header>
            <h3 className="network-card-title smallcaps">{card.label}</h3>
          </Card.Header>
          <Card.Body>
            <ul className="network-list-text">
              {card.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      ))}
    </div>
  );
}

function IdeaSaver({ report, saveIdeaAction }: { report: AccountResearchReport; saveIdeaAction?: FormAction }) {
  const buckets = reportIdeaBuckets(report);
  const entries = [
    { ideas: buckets.x_post, kind: "x_post", label: "Post ideas" },
    { ideas: buckets.blog, kind: "blog", label: "Blog ideas" },
    { ideas: buckets.campaign, kind: "campaign", label: "Campaign ideas" },
  ] as const;

  return (
    <div className="network-idea-grid">
      {entries.map((bucket) => (
        <Card key={bucket.kind}>
          <Card.Header>
            <h3 className="network-card-title smallcaps">{bucket.label}</h3>
          </Card.Header>
          <Card.Body>
            {bucket.ideas.length === 0 ? <p className="network-muted">No ideas in this bucket.</p> : bucket.ideas.map((idea) => (
              <form action={saveIdeaAction} className="network-idea-row" key={idea}>
                <input name="report_id" type="hidden" value={report.id} />
                <input name="idea_kind" type="hidden" value={bucket.kind} />
                <input name="idea_text" type="hidden" value={idea} />
                <span>{idea}</span>
                <Button size="sm" type="submit" variant="secondary">Save to composer</Button>
              </form>
            ))}
          </Card.Body>
        </Card>
      ))}
    </div>
  );
}

function SelectedReport({ report, saveIdeaAction }: { report: AccountResearchReport | null; saveIdeaAction?: FormAction }) {
  if (!report) {
    return <EmptyState message="Run research from a username, pasted posts, or a saved target account." title="No report selected" />;
  }

  return (
    <section className="network-report" aria-label="Selected account research report">
      <Card>
        <Card.Header>
          <RuleHeader folio="§ 03" label="Report" sub={`@${report.username ?? "pasted"}`} />
        </Card.Header>
        <Card.Body>
          <KeyValueRow label="Positioning" value={report.report.positioning} />
          <KeyValueRow label="Audience" value={report.report.audience_hypotheses.join("; ")} />
          <KeyValueRow label="Source" value={<Badge variant={report.inputSource === "manual" ? "outline" : "success"}>{report.inputSource}</Badge>} />
        </Card.Body>
      </Card>
      <Card>
        <Card.Header>
          <RuleHeader folio="§ 04" label="Top Posts" sub="ranked" />
        </Card.Header>
        <Card.Body>
          <TopPostsTable report={report} />
        </Card.Body>
      </Card>
      <PatternCards report={report} />
      <IdeaSaver report={report} saveIdeaAction={saveIdeaAction} />
    </section>
  );
}

function ResearchInspector({ report }: { report: AccountResearchReport | null }) {
  return (
    <aside className="network-inspector">
      <Card>
        <Card.Header>
          <RuleHeader folio="§ 06" label="Boundary" sub="account research" />
        </Card.Header>
        <Card.Body>
          <KeyValueRow label="External text" value="Untrusted data" />
          <KeyValueRow label="Publishing" value="No direct write" />
          <KeyValueRow label="Selected" value={report ? `@${report.username ?? "pasted"}` : "none"} />
          <p className="network-muted">Ethical patterns are abstracted into original ideas. Replies still require explicit owner approval through Publishing.</p>
        </Card.Body>
      </Card>
    </aside>
  );
}

export function AccountResearchWorkspaceView({ notice, researchAction, saveIdeaAction, workspace }: AccountResearchWorkspaceViewProps) {
  return (
    <main aria-labelledby="account-research-title" className="network-page account-research-page">
      <h1 className="workflow-title" id="account-research-title">Account Research</h1>
      <RuleHeader folio="§ 21" label="Account Research" sub="public pattern intelligence" />
      <NoticeBanner notice={notice} />
      <section aria-label="Account research metrics" className="network-metrics">
        <MetricBlock label="Reports" value={workspace.reports.length} />
        <MetricBlock label="Saved targets" value={workspace.targetAccounts.length} />
        <MetricBlock label="Top posts" value={workspace.selectedReport?.topPosts.length ?? 0} />
        <MetricBlock label="Ideas" value={workspace.selectedReport?.report.idea_seeds.length ?? 0} />
      </section>
      <section className="network-workbench">
        <div className="network-main">
          <ResearchForm action={researchAction} workspace={workspace} />
          <ReportList reports={workspace.reports} selectedReport={workspace.selectedReport} />
          <SelectedReport report={workspace.selectedReport} saveIdeaAction={saveIdeaAction} />
        </div>
        <ResearchInspector report={workspace.selectedReport} />
      </section>
    </main>
  );
}
