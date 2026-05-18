import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

import { CopyButton } from "@/components/ai/copy-button";
import {
  AssumptionFlag,
  Badge,
  Card,
  EmptyState,
  MetricBlock,
  RuleHeader,
  SubmitButton,
  Textarea,
} from "@/components/design-system";
import type { BrainDumpGeneratedPack, BrainDumpRecord } from "@/lib/brain-dumps";

type FormAction = ComponentProps<"form">["action"];
type GeneratedPackSection = "blog_outline" | "campaign_idea" | "strategy" | "video_script" | "x_post" | "x_thread";

export type BrainDumpWorkspaceViewProps = {
  brainDump: BrainDumpRecord | null;
  dumps: BrainDumpRecord[];
  notice?: string;
  saveOutputAction?: FormAction;
  transformAction?: FormAction;
};

function noticeText(notice?: string) {
  if (notice === "brain_dump_created") return "Brain dump transformed and saved with prompt run records.";
  if (notice === "brain_dump_output_saved") return "Generated item saved to composer outputs.";
  if (notice === "rate_limited") return "Brain-dump rate limit reached. Try again after the window resets.";
  if (notice?.endsWith("failed")) return "The brain-dump request failed validation or could not be completed safely.";
  return null;
}

function noticeTone(notice?: string) {
  if (!notice) return null;
  if (notice === "rate_limited") return "warning" as const;
  if (notice.endsWith("failed")) return "danger" as const;
  return "success" as const;
}

function ListCard({ items, label }: { items: string[]; label: string }) {
  return (
    <Card>
      <Card.Header>
        <span className="workflow-card-title smallcaps">{label}</span>
        <Badge variant="outline">{items.length}</Badge>
      </Card.Header>
      <Card.Body>
        {items.length > 0 ? (
          <ul className="workflow-list">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="workflow-copy">No items extracted in this section.</p>
        )}
      </Card.Body>
    </Card>
  );
}

function SaveGeneratedForm({
  brainDump,
  children,
  itemIndex,
  section,
  saveOutputAction,
}: {
  brainDump: BrainDumpRecord;
  children: ReactNode;
  itemIndex: number;
  saveOutputAction?: FormAction;
  section: GeneratedPackSection;
}) {
  return (
    <form action={saveOutputAction} className="inline-form">
      <input name="brain_dump_id" type="hidden" value={brainDump.id} />
      <input name="item_index" type="hidden" value={itemIndex} />
      <input name="section" type="hidden" value={section} />
      <SubmitButton size="sm" variant="secondary">
        {children}
      </SubmitButton>
    </form>
  );
}

function DraftCard({
  brainDump,
  itemIndex,
  label,
  rationale,
  saveOutputAction,
  section,
  text,
}: {
  brainDump: BrainDumpRecord;
  itemIndex: number;
  label: string;
  rationale?: string;
  saveOutputAction?: FormAction;
  section: GeneratedPackSection;
  text: string;
}) {
  return (
    <article className="brain-dump-output-card">
      <div className="composer-output-head">
        <span className="composer-output-type smallcaps">{label}</span>
        <div className="composer-output-actions">
          <CopyButton text={text} />
          <SaveGeneratedForm brainDump={brainDump} itemIndex={itemIndex} saveOutputAction={saveOutputAction} section={section}>
            Save to composer
          </SaveGeneratedForm>
        </div>
      </div>
      <p className="composer-output-text">{text}</p>
      {rationale ? <p className="workflow-muted">{rationale}</p> : null}
    </article>
  );
}

function outlineText(outline: BrainDumpGeneratedPack["blog_outlines"][number]) {
  return [`# ${outline.title}`, "", outline.thesis, "", ...outline.sections.map((section) => `- ${section}`)].join("\n");
}

function scriptText(script: BrainDumpGeneratedPack["video_scripts"][number]) {
  return [`${script.title}`, `Hook: ${script.hook}`, ...script.beats.map((beat) => `- ${beat}`), `CTA: ${script.cta}`].join("\n");
}

function campaignText(campaign: BrainDumpGeneratedPack["campaign_ideas"][number]) {
  return [`${campaign.name}`, campaign.angle, "", ...campaign.sequence.map((item) => `- ${item}`), "", campaign.rationale].join("\n");
}

function threadText(thread: BrainDumpGeneratedPack["x_threads"][number]) {
  return [thread.hook, ...thread.items].join("\n\n");
}

function strategyText(pack: BrainDumpGeneratedPack) {
  return [
    pack.strategy.positioning,
    "",
    "Content pillars:",
    ...pack.strategy.content_pillars.map((item) => `- ${item}`),
    "",
    "Next actions:",
    ...pack.strategy.next_actions.map((item) => `- ${item}`),
  ].join("\n");
}

function GeneratedPack({ brainDump, saveOutputAction }: { brainDump: BrainDumpRecord; saveOutputAction?: FormAction }) {
  const pack = brainDump.generatedPack;

  return (
    <section aria-labelledby="brain-dump-pack-title" className="brain-dump-pack">
      <RuleHeader folio="§ 04" id="brain-dump-pack-title" label="Generated pack" sub="posts, threads, outlines, scripts, strategy" />
      <div className="brain-dump-output-section">
        <RuleHeader folio="¶" label="10 posts" sub={`${pack.x_posts.length} returned`} />
        {pack.x_posts.map((post, index) => (
          <DraftCard
            brainDump={brainDump}
            itemIndex={index}
            key={`${post.text}-${index}`}
            label={`Post ${index + 1}`}
            rationale={post.rationale}
            saveOutputAction={saveOutputAction}
            section="x_post"
            text={post.text}
          />
        ))}
      </div>
      <div className="brain-dump-output-section">
        <RuleHeader folio="¶" label="Threads" sub={`${pack.x_threads.length} returned`} />
        {pack.x_threads.map((thread, index) => (
          <DraftCard brainDump={brainDump} itemIndex={index} key={`${thread.hook}-${index}`} label={`Thread ${index + 1}`} saveOutputAction={saveOutputAction} section="x_thread" text={threadText(thread)} />
        ))}
      </div>
      <div className="brain-dump-output-section">
        <RuleHeader folio="¶" label="Blog outlines" sub={`${pack.blog_outlines.length} returned`} />
        {pack.blog_outlines.map((outline, index) => (
          <DraftCard
            brainDump={brainDump}
            itemIndex={index}
            key={`${outline.title}-${index}`}
            label={`Blog outline ${index + 1}`}
            rationale={outline.rationale}
            saveOutputAction={saveOutputAction}
            section="blog_outline"
            text={outlineText(outline)}
          />
        ))}
      </div>
      <div className="brain-dump-output-section">
        <RuleHeader folio="¶" label="Video scripts" sub={`${pack.video_scripts.length} returned`} />
        {pack.video_scripts.map((script, index) => (
          <DraftCard brainDump={brainDump} itemIndex={index} key={`${script.title}-${index}`} label={`Video script ${index + 1}`} saveOutputAction={saveOutputAction} section="video_script" text={scriptText(script)} />
        ))}
      </div>
      <div className="brain-dump-output-section">
        <RuleHeader folio="¶" label="Campaign ideas" sub={`${pack.campaign_ideas.length} returned`} />
        {pack.campaign_ideas.map((campaign, index) => (
          <DraftCard brainDump={brainDump} itemIndex={index} key={`${campaign.name}-${index}`} label={`Campaign idea ${index + 1}`} saveOutputAction={saveOutputAction} section="campaign_idea" text={campaignText(campaign)} />
        ))}
      </div>
      <DraftCard brainDump={brainDump} itemIndex={0} label="Strategy" saveOutputAction={saveOutputAction} section="strategy" text={strategyText(pack)} />
    </section>
  );
}

function RecentDumps({ dumps, selectedId }: { dumps: BrainDumpRecord[]; selectedId?: string }) {
  if (dumps.length === 0) {
    return <EmptyState message="Transform a raw note to start the local dump history." title="No brain dumps" />;
  }

  return (
    <div aria-label="Recent brain dumps" className="ai-workflow-history">
      {dumps.map((dump) => (
        <Link
          aria-current={dump.id === selectedId ? "page" : undefined}
          className="ai-history-row"
          href={{ pathname: "/brain-dump", query: { selected: dump.id } }}
          key={dump.id}
        >
          <span className="ai-history-score mono">{dump.generatedPack.x_posts.length}</span>
          <span className="ai-history-text">{dump.title ?? dump.rawText}</span>
          <Badge variant={dump.id === selectedId ? "accent" : "outline"}>dump</Badge>
        </Link>
      ))}
    </div>
  );
}

export function BrainDumpWorkspaceView({ brainDump, dumps, notice, saveOutputAction, transformAction }: BrainDumpWorkspaceViewProps) {
  const message = noticeText(notice);
  const tone = noticeTone(notice);

  return (
    <main aria-labelledby="brain-dump-title" className="ai-workflow-page brain-dump-page">
      <RuleHeader
        actions={<Badge variant="accent">structured pack</Badge>}
        as="h1"
        folio="§ 05"
        id="brain-dump-title"
        label="Brain dump transformer"
        sub="messy thought to content"
      />
      {message && tone ? (
        <div aria-live="polite" className={`workflow-notice workflow-notice-${tone}`} role={tone === "success" ? "status" : "alert"}>
          {message}
        </div>
      ) : null}
      <AssumptionFlag label="Content boundary">
        Raw notes are treated as data for transformation. AI can generate drafts and questions, but it cannot publish or approve anything.
      </AssumptionFlag>
      <section className="ai-workflow-workbench">
        <div className="ai-workflow-main">
          <form action={transformAction} className="workflow-form">
            <RuleHeader folio="§ 01" id="brain-dump-form-title" label="Raw dump" sub="save and transform" />
            <Textarea label="Raw dump" name="raw_text" placeholder="Paste the messy note, thesis fragments, stories, contradictions, half-hooks, and open questions." required rows={12} />
            <Textarea label="Title" name="title" placeholder="Optional working title" rows={2} />
            <SubmitButton>Transform dump</SubmitButton>
          </form>
          {brainDump ? (
            <>
              <section aria-labelledby="brain-dump-extraction-title" className="brain-dump-extraction">
                <RuleHeader folio="§ 02" id="brain-dump-extraction-title" label="Extraction" sub="themes, claims, stories, contradictions" />
                <div className="composer-metrics">
                  <MetricBlock label="Themes" value={brainDump.extractedThemes.length} />
                  <MetricBlock label="Claims" value={brainDump.extractedClaims.length} />
                  <MetricBlock label="Stories" value={brainDump.extractedStories.length} />
                  <MetricBlock label="Strong lines" value={brainDump.strongLines.length} />
                </div>
                <div className="brain-dump-grid">
                  <ListCard items={brainDump.extractedThemes} label="Themes" />
                  <ListCard items={brainDump.extractedClaims} label="Claims and opinions" />
                  <ListCard items={brainDump.extractedStories} label="Stories" />
                  <ListCard items={brainDump.extractedExamples} label="Examples" />
                  <ListCard items={brainDump.extractedContradictions} label="Contradictions" />
                  <ListCard items={brainDump.strongLines} label="Strong lines" />
                </div>
              </section>
              <section aria-labelledby="brain-dump-questions-title" className="brain-dump-questions">
                <RuleHeader folio="§ 03" id="brain-dump-questions-title" label="Clarifying questions" sub={`${brainDump.generatedPack.questions.length} prompts`} />
                <ul className="workflow-list">
                  {brainDump.generatedPack.questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </section>
              <GeneratedPack brainDump={brainDump} saveOutputAction={saveOutputAction} />
            </>
          ) : (
            <EmptyState
              message="Submit a raw note to save the dump, extract structure, and generate posts, threads, outlines, scripts, strategy, and questions."
              title="No brain dump transformed"
            />
          )}
        </div>
        <section aria-labelledby="brain-dump-history-title" className="ai-workflow-inspector">
          <RuleHeader folio="§ 06" id="brain-dump-history-title" label="Dump history" sub={`${dumps.length} saved`} />
          <RecentDumps dumps={dumps} selectedId={brainDump?.id} />
        </section>
      </section>
    </main>
  );
}
