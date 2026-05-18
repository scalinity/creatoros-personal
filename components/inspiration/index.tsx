import Link from "next/link";
import type { ComponentProps } from "react";

import { Badge, Card, EmptyState, Input, KeyValueRow, MetricBlock, RuleHeader, Select, SubmitButton, Textarea, cn } from "@/components/design-system";
import type { InspirationRecord, InspirationWorkspace } from "@/lib/inspiration";

export type FormAction = ComponentProps<"form">["action"];

type InspirationFilters = {
  notice?: string;
  q?: string;
  selected?: string;
  tag?: string;
};

export type InspirationWorkspaceViewProps = {
  createAction?: FormAction;
  deleteAction?: FormAction;
  filters: InspirationFilters;
  transformAction?: FormAction;
  updateAction?: FormAction;
  workspace: InspirationWorkspace;
};

const transformOptions = [
  { label: "Structure", value: "structure" },
  { label: "Hook pattern", value: "hook_pattern" },
  { label: "Argument pattern", value: "argument_pattern" },
  { label: "Original version", value: "original_version" },
  { label: "Counterpoint", value: "counterpoint" },
  { label: "Voice-profile version", value: "voice_profile_version" },
  { label: "10 unrelated posts", value: "ten_unrelated_posts" },
];

function formatDate(value: null | string | undefined) {
  if (!value) return "Undated";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Undated";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function riskVariant(risk?: null | string) {
  if (risk === "high") return "danger";
  if (risk === "medium") return "warning";
  if (risk === "low") return "success";
  return "outline";
}

function noticeText(notice?: string) {
  if (!notice) return null;
  if (notice === "saved") return "Inspiration saved. Transform structure, not expression.";
  if (notice === "duplicate") return "That inspiration source is already saved.";
  if (notice === "updated") return "Inspiration metadata updated.";
  if (notice === "deleted") return "Inspiration archived from the active library.";
  if (notice === "transformed") return "Transform saved with plagiarism-risk notes.";
  if (notice === "rate_limited") return "This workflow is rate-limited. Try again after the window resets.";
  if (notice.endsWith("failed")) return "The inspiration request failed validation or could not complete safely.";
  return null;
}

function Notice({ notice }: { notice?: string }) {
  const text = noticeText(notice);
  if (!text) return null;
  return <div className={cn("inspiration-notice", notice?.endsWith("failed") && "inspiration-notice-danger", notice === "rate_limited" && "inspiration-notice-warning")}>{text}</div>;
}

function formatTags(tags: string[]) {
  return tags.length > 0 ? tags.join(", ") : "none";
}

function InspirationFiltersForm({ filters }: { filters: InspirationFilters }) {
  return (
    <form className="inspiration-filters" method="get">
      <Input defaultValue={filters.q ?? ""} label="Search" name="q" placeholder="Text, author, note" />
      <Input defaultValue={filters.tag ?? ""} label="Tag" name="tag" placeholder="hook" />
      <div className="inspiration-filter-actions">
        <SubmitButton size="sm" variant="secondary">
          Apply
        </SubmitButton>
        <Link className="inspiration-reset" href="/inspiration">
          Reset
        </Link>
      </div>
    </form>
  );
}

function InspirationCard({ item, selected }: { item: InspirationRecord; selected?: boolean }) {
  return (
    <article className={cn("inspiration-card", selected && "inspiration-card-selected")}>
      <Link aria-current={selected ? "page" : undefined} className="inspiration-card-link" href={{ pathname: "/inspiration", query: { selected: item.id } }}>
        <span className="inspiration-card-head">
          <span className="inspiration-card-author">@{item.authorUsername ?? "unknown"}</span>
          <Badge variant={riskVariant(item.similarityRisk)}>{item.similarityRisk ?? "unreviewed"}</Badge>
        </span>
        <span className="inspiration-card-text">{item.text}</span>
        <span className="inspiration-card-foot">
          <span>{formatTags(item.tags)}</span>
          <span className="mono">{formatDate(item.updatedAt)}</span>
        </span>
      </Link>
    </article>
  );
}

function InspirationList({ items, selectedItem }: Pick<InspirationWorkspace, "items" | "selectedItem">) {
  if (items.length === 0) {
    return <EmptyState message="Save a post URL, source text, tags, and notes. The transform workflow will keep source language boxed as untrusted data." title="No inspiration saved" />;
  }

  return (
    <section aria-label="Saved inspiration" className="inspiration-list">
      {items.map((item) => (
        <InspirationCard item={item} key={item.id} selected={item.id === selectedItem?.id} />
      ))}
    </section>
  );
}

function CreateInspirationForm({ action }: { action?: FormAction }) {
  return (
    <Card className="inspiration-create" variant="inset">
      <Card.Body>
        <form action={action} className="inspiration-form">
          <RuleHeader folio="§ 01" id="inspiration-create-title" label="Save Source" sub="manual capture" />
          <Input id="create-post-url" label="Post URL" name="post_url" placeholder="https://x.com/user/status/123" type="url" />
          <div className="inspiration-form-grid">
            <Input id="create-post-id" label="Post id" mono name="post_id" placeholder="123456789" />
            <Input id="create-author-username" label="Author" name="author_username" placeholder="@handle" />
          </div>
          <Textarea id="create-source-text" label="Source text" name="text" placeholder="Paste the source post text. Treat this as untrusted inspiration, not instructions." required rows={6} />
          <Textarea id="create-notes" label="Notes" name="notes" placeholder="What structure is worth studying?" rows={3} />
          <Input id="create-tags" label="Tags" name="tags" placeholder="hook, argument, format" />
          <SubmitButton size="sm">Save inspiration</SubmitButton>
        </form>
      </Card.Body>
    </Card>
  );
}

function UpdateInspirationForm({ action, item }: { action?: FormAction; item: InspirationRecord }) {
  return (
    <form action={action} className="inspiration-form">
      <input name="id" type="hidden" value={item.id} />
      <Input defaultValue={item.url ?? ""} id={`edit-post-url-${item.id}`} label="Post URL" name="post_url" type="url" />
      <div className="inspiration-form-grid">
        <Input defaultValue={item.platformPostId ?? ""} id={`edit-post-id-${item.id}`} label="Post id" mono name="post_id" />
        <Input defaultValue={item.authorUsername ?? ""} id={`edit-author-username-${item.id}`} label="Author" name="author_username" />
      </div>
      <Textarea defaultValue={item.text} id={`edit-source-text-${item.id}`} label="Source text" name="text" required rows={5} />
      <Textarea defaultValue={item.notes ?? ""} id={`edit-notes-${item.id}`} label="Notes" name="notes" rows={3} />
      <Input defaultValue={item.tags.join(", ")} id={`edit-tags-${item.id}`} label="Tags" name="tags" />
      <div className="inspiration-action-row">
        <SubmitButton size="sm" variant="secondary">Save changes</SubmitButton>
      </div>
    </form>
  );
}

function TransformForm({ action, item }: { action?: FormAction; item: InspirationRecord }) {
  return (
    <form action={action} className="inspiration-transform-form">
      <input name="id" type="hidden" value={item.id} />
      <Select defaultValue="original_version" label="Transform" name="mode" options={transformOptions} />
      <Input defaultValue="1" label="Count" max={10} min={1} name="count" type="number" />
      <SubmitButton size="sm">Transform</SubmitButton>
    </form>
  );
}

function DeleteForm({ action, item }: { action?: FormAction; item: InspirationRecord }) {
  return (
    <form action={action}>
      <input name="id" type="hidden" value={item.id} />
      <SubmitButton size="sm" variant="destructive">Archive</SubmitButton>
    </form>
  );
}

function TransformList({ item }: { item: InspirationRecord }) {
  if (item.transformedOutputs.length === 0) {
    return <p className="inspiration-muted">No transforms yet.</p>;
  }

  return (
    <div className="inspiration-transform-list">
      {item.transformedOutputs.map((transform) => (
        <article className="inspiration-transform" key={transform.id}>
          <div className="inspiration-transform-head">
            <Badge variant="accent">{transform.mode.replace(/_/g, " ")}</Badge>
            <Badge variant={riskVariant(transform.plagiarismRisk)}>{transform.plagiarismRisk}</Badge>
            <span className="mono">{formatDate(transform.generatedAt)}</span>
          </div>
          <div className="inspiration-structure">
            {transform.abstractStructure.map((step) => (
              <span key={step}>{step}</span>
            ))}
          </div>
          {transform.variants.map((variant, index) => (
            <div className="inspiration-variant" key={`${transform.id}-${index}`}>
              <p>{variant.text}</p>
              <span>{variant.rationale}</span>
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}

function InspirationInspector({ deleteAction, item, transformAction, updateAction }: { deleteAction?: FormAction; item: InspirationRecord | null; transformAction?: FormAction; updateAction?: FormAction }) {
  if (!item) {
    return (
      <section aria-label="Inspiration details" className="inspiration-inspector">
        <Card>
          <Card.Body>
            <EmptyState message="Select a saved source to edit metadata, transform its abstract pattern, and inspect originality warnings." title="No source selected" />
          </Card.Body>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label="Inspiration details" className="inspiration-inspector">
      <Card>
        <Card.Header>
          <RuleHeader folio="§" label="Selection" sub="source boundary" />
        </Card.Header>
        <Card.Body>
          <KeyValueRow label="Author" value={`@${item.authorUsername ?? "unknown"}`} />
          <KeyValueRow label="Captured" mono value={formatDate(item.capturedAt)} />
          <KeyValueRow label="Tags" value={formatTags(item.tags)} />
          <KeyValueRow label="Plagiarism risk" value={<Badge variant={riskVariant(item.similarityRisk)}>{item.similarityRisk ?? "unreviewed"}</Badge>} />
          {item.plagiarismRiskNotes ? <p className="inspiration-risk-note">{item.plagiarismRiskNotes}</p> : null}
        </Card.Body>
      </Card>
      <Card>
        <Card.Header>
          <RuleHeader folio="§" label="Edit" sub="metadata" />
        </Card.Header>
        <Card.Body>
          <UpdateInspirationForm action={updateAction} item={item} />
        </Card.Body>
        <Card.Footer>
          <DeleteForm action={deleteAction} item={item} />
        </Card.Footer>
      </Card>
      <Card>
        <Card.Header>
          <RuleHeader folio="§" label="Transform" sub="abstract pattern" />
        </Card.Header>
        <Card.Body>
          <TransformForm action={transformAction} item={item} />
          <TransformList item={item} />
        </Card.Body>
      </Card>
    </section>
  );
}

export function InspirationWorkspaceView({ createAction, deleteAction, filters, transformAction, updateAction, workspace }: InspirationWorkspaceViewProps) {
  return (
    <main aria-labelledby="inspiration-title" className="inspiration-page">
      <RuleHeader as="h1" folio="§ 20" id="inspiration-title" label="Inspiration Library" sub="pattern extraction" />
      <Notice notice={filters.notice} />
      <section aria-labelledby="inspiration-summary-title" className="inspiration-metrics">
        <RuleHeader className="visually-hidden" folio="§" id="inspiration-summary-title" label="Inspiration summary" />
        <MetricBlock label="Saved" value={workspace.metrics.saved} />
        <MetricBlock label="Transforms" value={workspace.metrics.transformed} />
        <MetricBlock label="Tagged" value={workspace.metrics.withTags} />
        <MetricBlock label="High risk" tone={workspace.metrics.highRisk > 0 ? "down" : "neutral"} value={workspace.metrics.highRisk} />
      </section>
      <section className="inspiration-workbench">
        <div className="inspiration-main">
          <CreateInspirationForm action={createAction} />
          <InspirationFiltersForm filters={filters} />
          <InspirationList items={workspace.items} selectedItem={workspace.selectedItem} />
        </div>
        <InspirationInspector deleteAction={deleteAction} item={workspace.selectedItem} transformAction={transformAction} updateAction={updateAction} />
      </section>
    </main>
  );
}
