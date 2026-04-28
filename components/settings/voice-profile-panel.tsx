import type { ComponentProps, ReactNode } from "react";

import { Badge, Button, Card, EmptyState, KeyValueRow, MetricBlock, RuleHeader } from "@/components/design-system";
import type { EmbeddingStatus } from "@/lib/embeddings";
import type { VoiceFormattingHabits, VoiceProfileStatus } from "@/lib/voice";

type FormAction = ComponentProps<"form">["action"];

export type VoiceProfilePanelProps = {
  embeddingStatus: EmbeddingStatus;
  notice?: null | string;
  recomputeAction?: FormAction;
  refreshEmbeddingsAction?: FormAction;
  status: VoiceProfileStatus;
};

function formatDate(value: null | string | undefined) {
  if (!value) return "never";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function noticeText(notice?: null | string) {
  if (notice === "voice_profile_generated") return "Voice profile recomputed from owner-authored sources.";
  if (notice === "voice_profile_failed") return "Voice profile recompute could not be completed safely.";
  if (notice === "embedding_refresh_completed") return "Embedding refresh completed. Retrieval can use vector matches where available.";
  if (notice === "embedding_refresh_fallback") return "Embedding provider unavailable or incompatible. Keyword fallback remains available.";
  if (notice === "rate_limited") return "This AI maintenance action is rate-limited. Try again after the window resets.";
  return null;
}

function noticeTone(notice?: null | string) {
  if (!notice) return null;
  if (notice === "voice_profile_failed" || notice === "rate_limited") return "danger" as const;
  if (notice === "embedding_refresh_fallback") return "warning" as const;
  return "success" as const;
}

function ListBlock({ items, title }: { items: string[]; title: ReactNode }) {
  return (
    <Card className="voice-profile-card">
      <Card.Header>
        <span className="settings-card-title smallcaps">{title}</span>
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
          <p className="settings-card-copy">No pattern captured yet.</p>
        )}
      </Card.Body>
    </Card>
  );
}

function FormattingRows({ habits }: { habits: VoiceFormattingHabits }) {
  return (
    <Card className="voice-profile-card" variant="inset">
      <Card.Header>
        <span className="settings-card-title smallcaps">Formatting habits</span>
      </Card.Header>
      <Card.Body>
        <KeyValueRow label="Line breaks" value={habits.line_breaks} />
        <KeyValueRow label="Punctuation" value={habits.punctuation} />
        <KeyValueRow label="Emoji" value={habits.emoji_usage} />
        <KeyValueRow label="Thread style" value={habits.thread_style} />
        <KeyValueRow label="Long-form" value={habits.long_form_style} />
      </Card.Body>
    </Card>
  );
}

export function VoiceProfilePanel({ embeddingStatus, notice, recomputeAction, refreshEmbeddingsAction, status }: VoiceProfilePanelProps) {
  const profile = status.activeProfile;
  const message = noticeText(notice);
  const tone = noticeTone(notice);

  return (
    <section className="voice-profile-panel" aria-label="Voice profile and embeddings">
      <RuleHeader actions={<Badge variant={status.availableForAiWorkflows ? "success" : "warning"}>{status.availableForAiWorkflows ? "active" : "needs profile"}</Badge>} folio="§ 21" label="Voice profile" sub="owner sources only" />
      {message && tone ? (
        <div className={`workflow-notice workflow-notice-${tone}`} role={tone === "success" ? "status" : "alert"}>
          {message}
        </div>
      ) : null}
      <div className="composer-metrics voice-profile-metrics" aria-label="Voice and embedding status">
        <MetricBlock label="Owner posts" value={status.sourceCounts.ownerPosts} />
        <MetricBlock label="Owner blogs" value={status.sourceCounts.ownerBlogs} />
        <MetricBlock label="Embeddings" value={embeddingStatus.indexedCount} />
        <MetricBlock label="Retrieval" value={embeddingStatus.providerAvailable ? "vector ready" : "keyword fallback available"} />
      </div>
      <div className="settings-actions voice-profile-actions">
        <form action={recomputeAction} className="settings-action">
          <Button size="sm" type="submit">
            Recompute voice profile
          </Button>
          <span className="settings-action-note">Uses owner posts and owner blogs only.</span>
        </form>
        <form action={refreshEmbeddingsAction} className="settings-action">
          <Button size="sm" type="submit" variant="secondary">
            Refresh embeddings
          </Button>
          <span className="settings-action-note">Falls back to keyword retrieval when no embedding provider is available.</span>
        </form>
      </div>
      {profile ? (
        <div className="voice-profile-grid">
          <Card className="voice-profile-summary" variant="inset">
            <Card.Header>
              <span className="settings-card-title smallcaps">Active profile</span>
              <Badge variant="success">available</Badge>
            </Card.Header>
            <Card.Body>
              <p className="settings-card-copy">{profile.summary}</p>
              <KeyValueRow label="Tone" value={profile.tone ?? "unspecified"} />
              <KeyValueRow label="Generated" mono value={formatDate(profile.generatedAt)} />
              <KeyValueRow label="Sources" value={`${profile.postCountUsed} posts / ${profile.blogCountUsed} blogs`} />
              <KeyValueRow label="Embedding refresh" mono value={formatDate(embeddingStatus.lastRefreshLabel)} />
            </Card.Body>
          </Card>
          <FormattingRows habits={profile.formattingHabits} />
          <ListBlock items={profile.sentencePatterns} title="Sentence patterns" />
          <ListBlock items={profile.hookPatterns} title="Hook patterns" />
          <ListBlock items={profile.commonPhrases} title="Common phrases" />
          <ListBlock items={profile.topicClusters} title="Topic clusters" />
          <ListBlock items={profile.ctaPatterns} title="CTA patterns" />
          <Card className="voice-profile-card">
            <Card.Header>
              <span className="settings-card-title smallcaps">Representative examples</span>
              <Badge variant="outline">{profile.examples.length}</Badge>
            </Card.Header>
            <Card.Body>
              {profile.examples.map((example) => (
                <blockquote className="voice-profile-example" key={`${example.recordType}-${example.recordId}`}>
                  <p>{example.text}</p>
                  <footer>{example.whyRepresentative}</footer>
                </blockquote>
              ))}
            </Card.Body>
          </Card>
        </div>
      ) : (
        <EmptyState title="No active voice profile" message="Import owner posts or create owner blogs, then recompute the profile from this settings page." />
      )}
    </section>
  );
}
