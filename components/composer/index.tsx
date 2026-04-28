import type { ComponentProps, ReactNode } from "react";

import { Badge, Button, Card, EmptyState, Input, KeyValueRow, MetricBlock, RuleHeader, Select, Textarea, cn } from "@/components/design-system";
import type { ComposerFilters, ComposerIdea, ComposerOutput } from "@/lib/content";

type FormAction = ComponentProps<"form">["action"];

export type ComposerWorkspaceViewProps = {
  archiveIdeaAction?: FormAction;
  createIdeaAction?: FormAction;
  filters: ComposerFilters;
  ideas: ComposerIdea[];
  notice?: null | string;
  outputs: ComposerOutput[];
  saveOutputAction?: FormAction;
  selectedIdea?: ComposerIdea | null;
  updateIdeaAction?: FormAction;
  updateOutputAction?: FormAction;
};

const ideaStatusOptions = [
  { label: "Inbox", value: "inbox" },
  { label: "Active", value: "active" },
  { label: "Drafted", value: "drafted" },
  { label: "Used", value: "used" },
  { label: "Archived", value: "archived" },
];

const filterStatusOptions = [{ label: "Working", value: "" }, { label: "All", value: "all" }, ...ideaStatusOptions];

const sourceEntityOptions = [
  { label: "None", value: "" },
  { label: "Post", value: "post" },
  { label: "Brain dump", value: "brain_dump" },
  { label: "Inspiration", value: "inspiration" },
  { label: "Account research", value: "account_research" },
  { label: "Manual", value: "manual" },
];

const generatedOutputTypeOptions = [
  { label: "X post", value: "x_post" },
  { label: "X thread", value: "x_thread" },
  { label: "Reply", value: "reply" },
  { label: "Quote post", value: "quote_post" },
  { label: "Blog outline", value: "blog_outline" },
  { label: "Blog draft", value: "blog_draft" },
  { label: "Campaign sequence", value: "campaign_sequence" },
  { label: "Content pack", value: "content_pack" },
  { label: "Manual", value: "manual" },
];

const generatedInputTypeOptions = [
  { label: "None", value: "" },
  { label: "Idea", value: "content_idea" },
  { label: "Post", value: "post" },
  { label: "Brain dump", value: "brain_dump" },
  { label: "Inspiration", value: "inspiration" },
  { label: "Account research", value: "account_research" },
  { label: "Manual", value: "manual" },
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

function formatLabel(value: null | string | undefined) {
  return value ? value.replaceAll("_", " ") : "none";
}

function ideaBadgeVariant(status: string) {
  if (status === "active") return "accent";
  if (status === "drafted" || status === "used") return "success";
  if (status === "archived") return "outline";
  return "warning";
}

function noticeText(notice?: null | string) {
  if (notice === "idea_created") return "Idea saved to the composer inbox.";
  if (notice === "idea_updated") return "Idea details updated.";
  if (notice === "idea_archived") return "Idea archived from the working inbox.";
  if (notice === "output_saved") return "Generated output saved to the local vault.";
  if (notice === "output_copied") return "Output marked as copied.";
  if (notice === "output_favorite") return "Output marked as favorite.";
  if (notice === "output_unfavorite") return "Output favorite marker removed.";
  if (notice === "output_unsaved") return "Output saved marker removed.";
  if (notice === "output_archived") return "Output archived from the active list.";
  if (notice?.endsWith("failed")) return "The submitted content workspace payload failed validation.";
  return null;
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="composer-muted">No tags</span>;

  return (
    <span className="composer-tags">
      {tags.map((tag) => (
        <Badge key={tag} variant="outline">
          {tag}
        </Badge>
      ))}
    </span>
  );
}

function checkbox(name: string, label: ReactNode, defaultChecked?: boolean) {
  return (
    <label className="checkbox-row">
      <input name={name} type="hidden" value="false" />
      <input className="checkbox-native" defaultChecked={defaultChecked} name={name} type="checkbox" value="true" />
      <span className="checkbox-box" aria-hidden="true" />
      <span className="checkbox-label">{label}</span>
    </label>
  );
}

function IdeaFilters({ filters }: { filters: ComposerFilters }) {
  return (
    <form className="composer-filters" method="get">
      <Input defaultValue={filters.q ?? ""} label="Search" name="q" placeholder="Idea, tag, source" />
      <Select defaultValue={filters.status ?? ""} label="Status" name="status" options={filterStatusOptions} />
      <Input defaultValue={filters.source ?? ""} label="Source" name="source" placeholder="manual, post, inspiration" />
      <div className="composer-filter-actions">
        <Button size="sm" type="submit" variant="secondary">
          Apply
        </Button>
        <a className="composer-reset" href="/composer">
          Reset
        </a>
      </div>
    </form>
  );
}

function CreateIdeaForm({ action }: { action?: FormAction }) {
  return (
    <form action={action} className="composer-form">
      <RuleHeader folio="§ 01" label="Create idea" sub="manual or linked source" />
      <Input label="Title" name="title" placeholder="Optional working title" />
      <Textarea label="Idea text" name="raw_text" placeholder="Capture the raw angle, claim, hook, or source note." required />
      <div className="composer-form-grid">
        <Input label="Tags" name="tags" placeholder="strategy, systems" />
        <Select defaultValue="inbox" label="Status" name="status" options={ideaStatusOptions} />
        <Input defaultValue="manual" label="Source" name="source" />
        <Input label="Linked post id" mono name="linked_post_id" />
        <Select defaultValue="" label="Source type" name="source_entity_type" options={sourceEntityOptions} />
        <Input label="Source entity id" mono name="source_entity_id" />
      </div>
      <div className="composer-inline-controls">{checkbox("favorite", "Favorite")}</div>
      <Button size="sm" type="submit">
        Create idea
      </Button>
    </form>
  );
}

function IdeaRow({ href, idea, selected }: { href: string; idea: ComposerIdea; selected?: boolean }) {
  return (
    <article className={cn("composer-idea-row", selected && "composer-idea-row-selected")}>
      <a className="composer-idea-link" href={href}>
        <div className="composer-row-head">
          <span className="composer-row-title">{idea.title ?? "Untitled idea"}</span>
          <Badge variant={ideaBadgeVariant(idea.status)}>{idea.status}</Badge>
        </div>
        <p className="composer-row-text">{idea.rawText}</p>
        <div className="composer-row-foot">
          <span className="mono">{formatDate(idea.updatedAt)}</span>
          <span>{idea.source}</span>
          {idea.favorite ? <Badge variant="accent">favorite</Badge> : null}
        </div>
      </a>
    </article>
  );
}

function IdeaList({ ideas, selectedIdea }: { ideas: ComposerIdea[]; selectedIdea?: ComposerIdea | null }) {
  return (
    <section className="composer-list" aria-label="Idea inbox">
      <RuleHeader folio="§ 02" label="Idea inbox" sub={`${ideas.length} visible`} />
      {ideas.length > 0 ? (
        ideas.map((idea) => <IdeaRow href={`/composer?selected=${idea.id}`} idea={idea} key={idea.id} selected={idea.id === selectedIdea?.id} />)
      ) : (
        <EmptyState title="No ideas in this view" message="Create a manual idea or adjust the filters to inspect archived/source-linked entries." />
      )}
    </section>
  );
}

function EditIdeaForm({ action, idea }: { action?: FormAction; idea: ComposerIdea }) {
  return (
    <form action={action} className="composer-form composer-edit-form">
      <RuleHeader folio="§ 03" label="Edit idea" sub="validated server action" />
      <input name="id" type="hidden" value={idea.id} />
      <Input defaultValue={idea.title ?? ""} label="Title" name="title" />
      <Textarea defaultValue={idea.rawText} label="Idea text" name="raw_text" required />
      <div className="composer-form-grid">
        <Input defaultValue={idea.tags.join(", ")} label="Tags" name="tags" />
        <Select defaultValue={idea.status} label="Status" name="status" options={ideaStatusOptions} />
        <Input defaultValue={idea.source} label="Source" name="source" />
        <Input defaultValue={idea.linkedPostId ?? ""} label="Linked post id" mono name="linked_post_id" />
        <Select defaultValue={idea.sourceEntityType ?? ""} label="Source type" name="source_entity_type" options={sourceEntityOptions} />
        <Input defaultValue={idea.sourceEntityId ?? ""} label="Source entity id" mono name="source_entity_id" />
      </div>
      <div className="composer-inline-controls">{checkbox("favorite", "Favorite", idea.favorite)}</div>
      <Button size="sm" type="submit">
        Save idea
      </Button>
    </form>
  );
}

function SourceInspector({ archiveAction, idea, updateAction }: { archiveAction?: FormAction; idea?: ComposerIdea | null; updateAction?: FormAction }) {
  if (!idea) {
    return (
      <aside className="composer-inspector">
        <RuleHeader folio="§ 04" label="Source inspector" sub="nothing selected" />
        <EmptyState title="No source selected" message="Select an idea to inspect source tracking, tags, and local workspace state." />
      </aside>
    );
  }

  return (
    <aside className="composer-inspector">
      <RuleHeader folio="§ 04" label="Source inspector" sub={idea.title ?? idea.id} />
      <Card variant="inset">
        <Card.Body>
          <KeyValueRow label="Status" value={<Badge variant={ideaBadgeVariant(idea.status)}>{idea.status}</Badge>} />
          <KeyValueRow label="Source" value={idea.source} />
          <KeyValueRow label="Source type" value={formatLabel(idea.sourceEntityType)} />
          <KeyValueRow label="Source id" mono value={idea.sourceEntityId ?? "none"} />
          <KeyValueRow label="Linked post" mono value={idea.linkedPostId ?? "none"} />
          <KeyValueRow label="Tags" value={<TagList tags={idea.tags} />} />
          <KeyValueRow label="Updated" mono value={formatDate(idea.updatedAt)} />
        </Card.Body>
      </Card>
      <EditIdeaForm action={updateAction} idea={idea} />
      <form action={archiveAction} className="composer-archive-form">
        <input name="id" type="hidden" value={idea.id} />
        <Button size="sm" type="submit" variant="destructive">
          Archive idea
        </Button>
      </form>
      <Card className="composer-handoff" variant="inset">
        <Card.Header>
          <span className="composer-card-title smallcaps">Publishing handoff deferred</span>
          <Badge variant="outline">Phase 15</Badge>
        </Card.Header>
        <Card.Body>
          <p className="composer-muted">Publishing drafts, approval, scheduling, and X writes remain disabled until the publishing state machine phase.</p>
          <Button disabled size="sm" variant="secondary">
            Create publishing draft
          </Button>
        </Card.Body>
      </Card>
    </aside>
  );
}

function SaveOutputForm({ action, selectedIdea }: { action?: FormAction; selectedIdea?: ComposerIdea | null }) {
  return (
    <form action={action} className="composer-form">
      <RuleHeader folio="§ 05" label="Save generated output" sub="manual persistence only" />
      <div className="composer-form-grid">
        <Select defaultValue="x_post" label="Type" name="type" options={generatedOutputTypeOptions} />
        <Select defaultValue={selectedIdea ? "content_idea" : ""} label="Input type" name="input_type" options={generatedInputTypeOptions} />
        <Input defaultValue={selectedIdea?.id ?? ""} label="Input id" mono name="input_id" />
      </div>
      <Textarea label="Output text" name="text" placeholder="Paste or preserve a draft generated elsewhere. No AI call happens here." required />
      <div className="composer-inline-controls">
        {checkbox("saved", "Saved", true)}
        {checkbox("favorite", "Favorite")}
      </div>
      <Button size="sm" type="submit" variant="secondary">
        Save output
      </Button>
    </form>
  );
}

function OutputActionButton({ action, formAction, id, label, variant = "secondary" }: { action: string; formAction?: FormAction; id: string; label: string; variant?: "destructive" | "secondary" | "tertiary" }) {
  return (
    <form action={formAction} className="composer-output-action">
      <input name="id" type="hidden" value={id} />
      <input name="action" type="hidden" value={action} />
      <Button size="sm" type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

function OutputCard({ action, output }: { action?: FormAction; output: ComposerOutput }) {
  return (
    <article className="rewrite-card composer-output-card">
      <div className="composer-output-head">
        <div>
          <span className="composer-output-type smallcaps">{formatLabel(output.type)}</span>
          <p className="composer-output-meta mono">{formatDate(output.updatedAt)}</p>
        </div>
        <div className="composer-output-badges">
          {output.saved ? <Badge variant="success">saved</Badge> : <Badge variant="outline">unsaved</Badge>}
          {output.favorite ? <Badge variant="accent">favorite</Badge> : null}
          {output.copiedAt ? <Badge variant="outline">copied</Badge> : null}
        </div>
      </div>
      <p className="composer-output-text">{output.text}</p>
      <div className="composer-output-foot">
        <span className="mono">source {formatLabel(output.inputType)} / {output.inputId ?? "none"}</span>
        <span className="mono">variants {output.variants.length}</span>
      </div>
      <div className="composer-output-actions">
        <OutputActionButton action="copied" formAction={action} id={output.id} label="Mark copied" />
        <OutputActionButton action={output.saved ? "unsaved" : "saved"} formAction={action} id={output.id} label={output.saved ? "Unsave" : "Save"} />
        <OutputActionButton action={output.favorite ? "unfavorite" : "favorite"} formAction={action} id={output.id} label={output.favorite ? "Unfavorite" : "Favorite"} />
        <OutputActionButton action="archived" formAction={action} id={output.id} label="Archive" variant="destructive" />
      </div>
    </article>
  );
}

function GeneratedOutputs({ action, outputs }: { action?: FormAction; outputs: ComposerOutput[] }) {
  return (
    <section className="composer-output-section" aria-label="Generated outputs">
      <RuleHeader folio="§ 06" label="Generated outputs" sub="stored outputs only" />
      {outputs.length > 0 ? (
        <div className="composer-output-list">
          {outputs.map((output) => (
            <OutputCard action={action} key={output.id} output={output} />
          ))}
        </div>
      ) : (
        <EmptyState title="No generated outputs yet" message="AI generation arrives later; this phase can still persist outputs produced by trusted server workflows or manual saves." />
      )}
    </section>
  );
}

export function ComposerWorkspaceView({
  archiveIdeaAction,
  createIdeaAction,
  filters,
  ideas,
  notice,
  outputs,
  saveOutputAction,
  selectedIdea,
  updateIdeaAction,
  updateOutputAction,
}: ComposerWorkspaceViewProps) {
  const noticeCopy = noticeText(notice);
  const selectedOutputs = selectedIdea ? outputs.filter((output) => output.inputId === selectedIdea.id || output.inputId === null) : outputs;

  return (
    <div className="composer-page">
      <RuleHeader actions={<Badge variant="outline">No AI call</Badge>} folio="§ 10" label="Content composer" sub="ideas and output storage" />
      {noticeCopy ? <div className="composer-notice">{noticeCopy}</div> : null}
      <section className="composer-metrics" aria-label="Composer summary">
        <MetricBlock label="Visible ideas" value={ideas.length} />
        <MetricBlock label="Favorites" value={ideas.filter((idea) => idea.favorite).length} />
        <MetricBlock label="Stored outputs" value={outputs.length} />
        <MetricBlock label="Linked sources" value={ideas.filter((idea) => idea.sourceEntityId || idea.linkedPostId).length} />
      </section>
      <section className="composer-workbench">
        <div className="composer-main">
          <Card>
            <Card.Body>
              <IdeaFilters filters={filters} />
            </Card.Body>
          </Card>
          <Card>
            <Card.Body>
              <CreateIdeaForm action={createIdeaAction} />
            </Card.Body>
          </Card>
          <IdeaList ideas={ideas} selectedIdea={selectedIdea} />
          <Card>
            <Card.Body>
              <SaveOutputForm action={saveOutputAction} selectedIdea={selectedIdea} />
            </Card.Body>
          </Card>
          <GeneratedOutputs action={updateOutputAction} outputs={selectedOutputs} />
        </div>
        <SourceInspector archiveAction={archiveIdeaAction} idea={selectedIdea} updateAction={updateIdeaAction} />
      </section>
    </div>
  );
}
