import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { AssumptionFlag, Badge, Button, Card, EmptyState, Input, KeyValueRow, MetricBlock, RuleHeader, Select, Textarea, cn } from "@/components/design-system";
import { buildPublishingPayloadPreview, computePublishingPayloadHash, type PublishingCalendar, type PublishingCalendarDay, type PublishingDraft, type PublishingFailure, type PublishingJob, type PublishingWorkspace } from "@/lib/publishing";
import type { SanitizedXConnection } from "@/lib/x/oauth";

export type FormAction = ComponentProps<"form">["action"];

export type PublishingWorkspaceViewProps = {
  approveAction?: FormAction;
  cancelAction?: FormAction;
  createAction?: FormAction;
  dryRunAction?: FormAction;
  editAction?: FormAction;
  notice?: null | string;
  publishAction?: FormAction;
  retryAction?: FormAction;
  scheduleAction?: FormAction;
  selectedDraftId?: null | string;
  workspace: PublishingWorkspace;
  xConnection?: null | SanitizedXConnection;
};

export type PublishingCalendarViewProps = {
  calendar: PublishingCalendar;
};

const contentTypeOptions = [
  { label: "Single post", value: "single_post" },
  { label: "Thread", value: "thread" },
  { label: "Reply", value: "reply" },
  { label: "Quote post", value: "quote_post" },
  { label: "Blog to X thread", value: "blog_to_x_thread" },
  { label: "Blog to X series", value: "blog_to_x_series" },
  { label: "Campaign sequence", value: "campaign_sequence" },
];

function formatDate(value: null | string | undefined) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unscheduled";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatLabel(value: null | string | undefined) {
  return value ? value.replaceAll("_", " ") : "none";
}

function statusVariant(status: string) {
  if (["approved", "scheduled", "succeeded", "published"].includes(status)) return "success";
  if (["failed", "canceled", "revoked", "invalidated"].includes(status)) return "danger";
  if (["ai_generated", "owner_edited", "analyzed", "queued", "running"].includes(status)) return "accent";
  return "warning";
}

function riskStatus(draft: PublishingDraft) {
  if (draft.riskCheck.blocking === true) return "blocked";
  if (draft.duplicateCheck.status === "duplicate") return "duplicate";
  if (draft.similarityCheck.status === "high_similarity") return "similar";
  return "clear";
}

function contentPreview(draft: PublishingDraft) {
  const text = draft.threadItems.length > 0 ? draft.threadItems.join(" / ") : draft.text;
  return text.length > 180 ? `${text.slice(0, 177).trim()}...` : text;
}

function noticeText(notice?: null | string) {
  if (!notice) return null;
  if (notice === "draft_created") return "Publishing draft created. It still needs owner approval.";
  if (notice === "draft_updated") return "Draft updated. Content edits invalidate any previous approval.";
  if (notice === "draft_approved") return "Exact payload approved by the owner.";
  if (notice === "draft_scheduled") return "Approved draft scheduled in dry-run mode.";
  if (notice === "dry_run_complete") return "Dry-run publishing job recorded without calling X.";
  if (notice === "live_publish_complete") return "Live X publish completed and reconciled into post history.";
  if (notice === "retry_complete") return "Retry recorded. Inspect the latest job state.";
  if (notice === "canceled") return "Publishing item canceled.";
  if (notice === "rate_limited") return "Publishing workflow rate limit reached. Try again after the window resets.";
  if (notice.endsWith("failed")) return "The publishing request failed validation or could not transition safely.";
  return null;
}

function Notice({ notice }: { notice?: null | string }) {
  const text = noticeText(notice);
  if (!text) return null;
  return <div className={cn("publishing-notice", notice?.endsWith("failed") && "publishing-notice-danger", notice === "rate_limited" && "publishing-notice-warning")}>{text}</div>;
}

function InlineForm({ action, children, className }: { action?: FormAction; children: ReactNode; className?: string }) {
  return (
    <form action={action} className={cn("publishing-inline-form", className)}>
      {children}
    </form>
  );
}

function CreateDraftForm({ action }: { action?: FormAction }) {
  return (
    <form action={action} className="publishing-create-form">
      <RuleHeader folio="§ 01" label="Create draft" sub="manual dry-run pipeline" />
      <Select defaultValue="single_post" label="Type" name="content_type" options={contentTypeOptions} />
      <Textarea label="Text" name="text" placeholder="Write the exact payload. Threads can use blank lines between posts." required rows={6} />
      <div className="publishing-form-grid">
        <Input defaultValue="manual" label="Source" name="source_type" />
        <Input label="Campaign id" mono name="campaign_id" />
        <Input label="Experiment id" mono name="experiment_id" />
      </div>
      <input name="thread_items" type="hidden" value="[]" />
      <Button size="sm" type="submit" variant="secondary">
        Create publishing draft
      </Button>
    </form>
  );
}

export function PublishingQueueRow({ draft, selected }: { draft: PublishingDraft; selected?: boolean }) {
  return (
    <article className={cn("publishing-queue-row", selected && "publishing-queue-row-selected")}>
      <Link className="publishing-row-link" href={`/publishing?selected=${draft.id}`}>
        <span className="publishing-row-main">
          <span className="publishing-row-title">{contentPreview(draft)}</span>
          <span className="publishing-row-id mono">{draft.id}</span>
        </span>
        <span className="publishing-row-badges">
          <Badge variant={statusVariant(draft.status)}>{draft.status}</Badge>
          <Badge variant={statusVariant(draft.approvalStatus)}>{draft.approvalStatus}</Badge>
          <Badge variant={riskStatus(draft) === "clear" ? "outline" : "warning"}>risk {riskStatus(draft)}</Badge>
        </span>
        <span className="publishing-row-foot">
          <span>{formatLabel(draft.contentType)}</span>
          <span className="mono">{formatDate(draft.scheduledAt)}</span>
        </span>
      </Link>
    </article>
  );
}

function PublishingQueue({ drafts, selectedDraftId }: { drafts: PublishingDraft[]; selectedDraftId?: null | string }) {
  if (drafts.length === 0) {
    return <EmptyState message="Create a manual draft or hand off a composer/blog output. Nothing can publish until the owner approves the exact payload." title="No publishing drafts" />;
  }

  return (
    <section className="publishing-queue" aria-label="Publishing queue">
      <RuleHeader folio="§ 02" label="Publishing queue" sub={`${drafts.length} drafts`} />
      <div className="publishing-queue-list">
        {drafts.map((draft) => (
          <PublishingQueueRow draft={draft} key={draft.id} selected={draft.id === selectedDraftId} />
        ))}
      </div>
    </section>
  );
}

function DraftEditor({ action, draft }: { action?: FormAction; draft: PublishingDraft }) {
  return (
    <form action={action} className="publishing-edit-form">
      <RuleHeader folio="§ 04" label="Edit payload" sub="approval invalidates" />
      <input name="id" type="hidden" value={draft.id} />
      <Select defaultValue={draft.contentType} label="Type" name="content_type" options={contentTypeOptions} />
      <Textarea defaultValue={draft.text || draft.threadItems.join("\n\n")} label="Text" name="text" rows={7} />
      <input name="thread_items" type="hidden" value={JSON.stringify(draft.threadItems)} />
      <div className="publishing-form-grid">
        <Input defaultValue={draft.replyToPostId ?? ""} label="Reply target" name="reply_to_post_id" />
        <Input defaultValue={draft.quotePostId ?? ""} label="Quote target" name="quote_post_id" />
        <Input defaultValue={draft.timezone} label="Timezone" name="timezone" />
      </div>
      <Button size="sm" type="submit" variant="secondary">
        Save payload
      </Button>
    </form>
  );
}

export function PublishFailureCard({ failure, retryAction }: { failure: PublishingFailure; retryAction?: FormAction }) {
  return (
    <article className="publish-failure-card">
      <div className="publish-failure-head">
        <Badge variant="danger">{failure.failureType}</Badge>
        <span className="mono">{formatDate(failure.createdAt)}</span>
      </div>
      <p>{failure.message ?? "Publishing failed with a sanitized dry-run error."}</p>
      <div className="publishing-row-foot">
        <span>Retryable: {failure.retryable ? "yes" : "no"}</span>
        {failure.retryAfter ? <span className="mono">After {formatDate(failure.retryAfter)}</span> : null}
      </div>
      <InlineForm action={retryAction}>
        <input name="id" type="hidden" value={failure.jobId} />
        <input name="confirmation" type="hidden" value="confirm retry" />
        <Button disabled={!failure.retryable} size="sm" type="submit" variant="secondary">
          Retry
        </Button>
      </InlineForm>
    </article>
  );
}

function LatestJob({ jobs }: { jobs: PublishingJob[] }) {
  const job = jobs[0];
  if (!job) return <p className="publishing-muted">No publishing jobs have run for this draft.</p>;

  return (
    <Card variant="inset">
      <Card.Body>
        <KeyValueRow label="Job" mono value={job.id} />
        <KeyValueRow label="Type" value={job.jobType} />
        <KeyValueRow label="Status" value={<Badge variant={statusVariant(job.status)}>{job.status}</Badge>} />
        <KeyValueRow label="Attempts" mono value={job.attemptCount} />
        <KeyValueRow label="Completed" mono value={formatDate(job.completedAt)} />
      </Card.Body>
    </Card>
  );
}

export function ApprovalRail({
  approveAction,
  cancelAction,
  draft,
  dryRunAction,
  editAction,
  failures,
  jobs,
  publishAction,
  retryAction,
  scheduleAction,
  xConnection,
}: {
  approveAction?: FormAction;
  cancelAction?: FormAction;
  draft: PublishingDraft | null;
  dryRunAction?: FormAction;
  editAction?: FormAction;
  failures: PublishingFailure[];
  jobs: PublishingJob[];
  publishAction?: FormAction;
  retryAction?: FormAction;
  scheduleAction?: FormAction;
  xConnection?: null | SanitizedXConnection;
}) {
  if (!draft) {
    return (
      <aside className="approval-rail">
        <RuleHeader folio="§ 03" label="Approval rail" sub="nothing selected" />
        <EmptyState message="Select a draft to inspect payload hash, dry-run status, duplicate checks, schedule, and failures." title="No draft selected" />
      </aside>
    );
  }

  const payload = buildPublishingPayloadPreview(draft, xConnection);
  const payloadHash = computePublishingPayloadHash(draft, xConnection);
  const approvalIsCurrent = draft.approvalStatus === "approved" && draft.approvalPayloadHash === payloadHash;
  const draftFailures = failures.filter((failure) => !failure.draftId || failure.draftId === draft.id);
  const draftJobs = jobs.filter((job) => job.draftId === draft.id);

  return (
    <aside className="approval-rail">
      <RuleHeader folio="§ 03" label="Approval rail" sub={draft.status} />
      <Card>
        <Card.Body>
          <KeyValueRow label="Draft id" mono value={draft.id} />
          <KeyValueRow label="Type" value={formatLabel(draft.contentType)} />
          <KeyValueRow label="Status" value={<Badge variant={statusVariant(draft.status)}>{draft.status}</Badge>} />
          <KeyValueRow label="Approval" value={<Badge variant={statusVariant(draft.approvalStatus)}>{draft.approvalStatus}</Badge>} />
          <KeyValueRow label="Payload hash" mono value={draft.approvalPayloadHash ?? payloadHash} />
          <KeyValueRow label="Required scopes" value={(payload.required_scopes as string[]).join(", ")} />
          <KeyValueRow label="X account" value={xConnection?.username ? `@${xConnection.username}` : "not connected"} />
          <KeyValueRow label="Write capability" value={xConnection?.capabilities.can_write_posts ? "enabled" : "disabled"} />
        </Card.Body>
      </Card>
      <Card variant="inset">
        <Card.Header>
          <span className="publishing-card-title smallcaps">Exact content payload</span>
        </Card.Header>
        <Card.Body>
          <pre className="publishing-payload-preview">{draft.threadItems.length > 0 ? draft.threadItems.map((item, index) => `${index + 1}. ${item}`).join("\n\n") : draft.text}</pre>
        </Card.Body>
      </Card>
      <AssumptionFlag label="Dry run">
        Dry-run jobs persist payload previews without external calls. Live publish requires owner approval, tweet.write scope, and the visible X account above.
      </AssumptionFlag>
      <div className="publishing-action-grid">
        <InlineForm action={approveAction}>
          <input name="id" type="hidden" value={draft.id} />
          <input name="payload_hash" type="hidden" value={payloadHash} />
          <input name="confirmation" type="hidden" value="approve exact payload" />
          <Button disabled={["canceled", "archived", "published"].includes(draft.status)} size="sm" type="submit">
            Approve exact payload
          </Button>
        </InlineForm>
        <InlineForm action={dryRunAction}>
          <input name="id" type="hidden" value={draft.id} />
          <input name="payload_hash" type="hidden" value={draft.approvalPayloadHash ?? payloadHash} />
          <input name="confirmation" type="hidden" value="confirm dry run" />
          <Button disabled={!approvalIsCurrent} size="sm" type="submit" variant="secondary">
            Dry run
          </Button>
        </InlineForm>
        <InlineForm action={publishAction}>
          <input name="id" type="hidden" value={draft.id} />
          <input name="payload_hash" type="hidden" value={draft.approvalPayloadHash ?? payloadHash} />
          <input name="confirmation" type="hidden" value="confirm live publish" />
          <input name="dry_run" type="hidden" value="false" />
          <Button disabled={!approvalIsCurrent || xConnection?.capabilities.can_write_posts !== true} size="sm" type="submit">
            Publish to X
          </Button>
        </InlineForm>
        <InlineForm action={scheduleAction} className="publishing-schedule-form">
          <input name="id" type="hidden" value={draft.id} />
          <Input label="Schedule ISO" name="scheduled_for" placeholder="2099-04-28T16:30:00.000Z" />
          <Input defaultValue={draft.timezone} label="Timezone" name="timezone" />
          <Button disabled={draft.status !== "approved" || !approvalIsCurrent} size="sm" type="submit" variant="secondary">
            Schedule approved
          </Button>
        </InlineForm>
        <InlineForm action={cancelAction}>
          <input name="id" type="hidden" value={draft.id} />
          <input name="reason" type="hidden" value="owner canceled from approval rail" />
          <Button disabled={["canceled", "published", "archived"].includes(draft.status)} size="sm" type="submit" variant="destructive">
            Cancel
          </Button>
        </InlineForm>
      </div>
      <DraftEditor action={editAction} draft={draft} />
      <Card>
        <Card.Header>
          <span className="publishing-card-title smallcaps">Checks</span>
        </Card.Header>
        <Card.Body>
          <KeyValueRow label="Duplicate" value={String(draft.duplicateCheck.status ?? "pending")} />
          <KeyValueRow label="Similarity" value={String(draft.similarityCheck.status ?? "pending")} />
          <KeyValueRow label="Risk" value={String(draft.riskCheck.blocking === true ? "blocked" : "clear")} />
        </Card.Body>
      </Card>
      <LatestJob jobs={draftJobs} />
      {draftFailures.length > 0 ? draftFailures.map((failure) => <PublishFailureCard failure={failure} key={failure.id} retryAction={retryAction} />) : null}
    </aside>
  );
}

export function PublishingWorkspaceView({
  approveAction,
  cancelAction,
  createAction,
  dryRunAction,
  editAction,
  notice,
  publishAction,
  retryAction,
  scheduleAction,
  selectedDraftId,
  workspace,
  xConnection,
}: PublishingWorkspaceViewProps) {
  const selectedDraft = workspace.drafts.find((draft) => draft.id === selectedDraftId) ?? workspace.drafts[0] ?? null;

  return (
    <main className="publishing-page" aria-labelledby="publishing-title">
      <h1 className="workflow-title" id="publishing-title">Publishing</h1>
      <RuleHeader actions={<Badge variant={xConnection?.capabilities.can_write_posts ? "success" : "outline"}>{xConnection?.capabilities.can_write_posts ? "X write enabled" : "dry run available"}</Badge>} folio="§ 17" label="Publishing queue" sub="approval, schedule, jobs" />
      <Notice notice={notice} />
      <section className="publishing-metrics" aria-label="Publishing summary">
        <MetricBlock label="Needs approval" value={workspace.metrics.needsApproval} />
        <MetricBlock label="Approved" value={workspace.metrics.approved} />
        <MetricBlock label="Scheduled" value={workspace.metrics.scheduled} />
        <MetricBlock label="Failed" tone={workspace.metrics.failed > 0 ? "down" : "neutral"} value={workspace.metrics.failed} />
      </section>
      <section className="publishing-workbench">
        <div className="publishing-main">
          <Card>
            <Card.Body>
              <CreateDraftForm action={createAction} />
            </Card.Body>
          </Card>
          <PublishingQueue drafts={workspace.drafts} selectedDraftId={selectedDraft?.id} />
        </div>
        <ApprovalRail
          approveAction={approveAction}
          cancelAction={cancelAction}
          draft={selectedDraft}
          dryRunAction={dryRunAction}
          editAction={editAction}
          failures={workspace.failures}
          jobs={workspace.jobs}
          publishAction={publishAction}
          retryAction={retryAction}
          scheduleAction={scheduleAction}
          xConnection={xConnection}
        />
      </section>
    </main>
  );
}

export function CalendarDayCell({ day }: { day: PublishingCalendarDay }) {
  return (
    <section className={cn("calendar-day-cell", day.warning && "calendar-day-cell-warning")} data-component="CalendarDayCell">
      <div className="calendar-day-head">
        <span className="calendar-day-date mono">{day.date}</span>
        <Badge variant={day.warning ? "warning" : "outline"}>load {day.load}</Badge>
      </div>
      {day.warning ? <p className="calendar-warning">{day.warning}</p> : null}
      <div className="calendar-day-items">
        {day.items.length > 0 ? (
          day.items.map((item) => (
            <article className="calendar-item" key={item.id}>
              <div className="calendar-item-head">
                <span className="mono">{formatTime(item.scheduledFor)}</span>
                <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
              </div>
              <p>{item.text}</p>
              <span className="calendar-item-meta">{formatLabel(item.type)} / {item.timezone}</span>
            </article>
          ))
        ) : (
          <p className="publishing-muted">No scheduled content.</p>
        )}
      </div>
    </section>
  );
}

export function PublishingCalendarView({ calendar }: PublishingCalendarViewProps) {
  return (
    <main className="calendar-page" aria-labelledby="calendar-title">
      <h1 className="workflow-title" id="calendar-title">Calendar</h1>
      <RuleHeader actions={<Link className="btn btn-secondary btn-sm" href="/publishing"><span className="btn-label">Open queue</span></Link>} folio="§ 15.1" label="Content calendar" sub={calendar.timezone} />
      <section className="publishing-metrics" aria-label="Calendar summary">
        <MetricBlock label="Scheduled" value={calendar.totals.scheduled} />
        <MetricBlock label="Failed" tone={calendar.totals.failed > 0 ? "down" : "neutral"} value={calendar.totals.failed} />
        <MetricBlock label="Warning days" tone={calendar.totals.warningDays > 0 ? "down" : "neutral"} value={calendar.totals.warningDays} />
        <MetricBlock label="Timezone" value={calendar.timezone} />
      </section>
      {calendar.days.length > 0 ? (
        <section className="calendar-grid" aria-label="Scheduled publishing days">
          {calendar.days.map((day) => (
            <CalendarDayCell day={day} key={day.date} />
          ))}
        </section>
      ) : (
        <EmptyState action={<Link className="btn btn-secondary btn-sm" href="/publishing"><span className="btn-label">Review queue</span></Link>} message="Approved scheduled drafts will appear here with dry-run status and cadence warnings." title="No scheduled publishing items" />
      )}
    </main>
  );
}
