import type { ComponentProps, ReactNode } from "react";

import Link from "next/link";

import {
  Badge,
  Card,
  Checkbox,
  EmptyState,
  Input,
  KeyValueRow,
  MetricBlock,
  RuleHeader,
  ScoreGauge,
  Select,
  SubmitButton,
  Table,
  Textarea,
  cn,
} from "@/components/design-system";
import type { PostHistoryAggregates, PostHistoryFilters, PostHistoryPost, PostHistorySort } from "@/lib/posts/types";
import type { AggregateGroup, PerformanceBucket } from "@/lib/scoring";

export type { PostHistoryAggregates, PostHistoryFilters, PostHistoryPost, PostHistorySort };

type FormAction = ComponentProps<"form">["action"];

export type PostHistoryViewProps = {
  aggregates: PostHistoryAggregates;
  createAction?: FormAction;
  filters: PostHistoryFilters;
  importAction?: FormAction;
  notice?: null | string;
  posts: PostHistoryPost[];
  selectedPost?: null | PostHistoryPost;
  updateAction?: FormAction;
};

const sortOptions = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Heuristic", value: "heuristic" },
  { label: "Engagement", value: "engagement" },
  { label: "Virality", value: "virality" },
  { label: "Impressions", value: "impressions" },
  { label: "Likes", value: "likes" },
];

const performanceOptions = [
  { label: "Any", value: "" },
  { label: "Breakout", value: "breakout" },
  { label: "Strong", value: "strong" },
  { label: "Steady", value: "steady" },
  { label: "Low", value: "low" },
  { label: "Unknown", value: "unknown" },
];

function formatNumber(value: null | number | undefined) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function formatScore(value: null | number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, "") : "—";
}

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

function badgeForPerformance(bucket: null | PerformanceBucket | string | undefined) {
  if (bucket === "breakout") return "success";
  if (bucket === "strong") return "accent";
  if (bucket === "steady") return "warning";
  if (bucket === "low") return "danger";
  return "outline";
}

function hiddenIfValue(name: string, value: null | string | undefined) {
  return value ? <input name={name} type="hidden" value={value} /> : null;
}

function MetricInput({ defaultValue, label, name }: { defaultValue: number; label: string; name: string }) {
  return <Input defaultValue={String(defaultValue)} inputMode="numeric" label={label} min={0} name={name} type="number" />;
}

function PostRow({ href, post, selected }: { href: string; post: PostHistoryPost; selected?: boolean }) {
  return (
    <article className={cn("post-row", selected && "post-row-selected")}>
      <Link aria-current={selected ? "page" : undefined} className="post-row-link" href={{ pathname: href }}>
        <div className="post-row-head">
          <span className="post-author mono">@{post.authorUsername ?? "owner"}</span>
          <span className="post-time mono">{formatDate(post.createdAtPlatform ?? post.createdAt)}</span>
        </div>
        <p className="post-text">{post.text}</p>
        <div className="post-row-foot">
          <span className="post-metric mono">likes {formatNumber(post.likeCount)}</span>
          <span className="post-metric mono">reposts {formatNumber(post.repostCount)}</span>
          <span className="post-metric mono">replies {formatNumber(post.replyCount)}</span>
          <span className="post-metric mono">quotes {formatNumber(post.quoteCount)}</span>
          <span className="post-metric mono">views {formatNumber(post.impressionCount)}</span>
          <span className="post-engagement mono">{formatScore(post.heuristicScore)}</span>
        </div>
      </Link>
    </article>
  );
}

function PostFilters({ filters }: { filters: PostHistoryFilters }) {
  return (
    <form className="post-history-filters" method="get">
      <Input defaultValue={filters.q ?? ""} label="Search" name="q" placeholder="Text, topic, author" />
      <Input defaultValue={filters.from ?? ""} label="From" name="from" type="date" />
      <Input defaultValue={filters.to ?? ""} label="To" name="to" type="date" />
      <Input defaultValue={filters.topic ?? ""} label="Topic" name="topic" />
      <Input defaultValue={filters.format ?? ""} label="Format" name="format" />
      <Input defaultValue={filters.hook_type ?? ""} label="Hook" name="hook_type" />
      <Input defaultValue={filters.tone ?? ""} label="Tone" name="tone" />
      <Input defaultValue={filters.source ?? ""} label="Source" name="source" />
      <Select defaultValue={filters.performance ?? ""} label="Performance" name="performance" options={performanceOptions} />
      <Select
        defaultValue={filters.media ?? ""}
        label="Media"
        name="media"
        options={[{ label: "Any", value: "" }, { label: "Has media", value: "true" }, { label: "No media", value: "false" }]}
      />
      <Select
        defaultValue={filters.link ?? ""}
        label="Link"
        name="link"
        options={[{ label: "Any", value: "" }, { label: "Has link", value: "true" }, { label: "No link", value: "false" }]}
      />
      <Select
        defaultValue={filters.owner ?? ""}
        label="Published by"
        name="owner"
        options={[{ label: "Any", value: "" }, { label: "Owner/manual", value: "true" }, { label: "External/import", value: "false" }]}
      />
      <Select defaultValue={filters.sort ?? "newest"} label="Sort" name="sort" options={sortOptions} />
      <div className="post-history-filter-actions">
        <SubmitButton size="sm" variant="secondary">
          Apply
        </SubmitButton>
        <Link className="post-history-reset" href="/post-history">
          Reset
        </Link>
      </div>
    </form>
  );
}

function ManualPostForm({ action }: { action?: FormAction }) {
  return (
    <form action={action} className="post-history-form">
      <RuleHeader folio="§ 01" id="post-history-manual-title" label="Add manual post" sub="owner-entered metrics" />
      <Textarea label="Post text" name="text" required />
      <div className="post-history-form-grid">
        <Input label="Platform post id" name="platform_post_id" />
        <Input label="URL" name="url" type="url" />
        <Input label="Author" name="author_username" placeholder="owner" />
        <Input label="Created at" name="created_at_platform" type="datetime-local" />
        <Input label="Topic" name="topic" />
        <Input label="Format" name="format" />
        <Input label="Hook type" name="hook_type" />
        <Input label="Tone" name="tone" />
        <MetricInput defaultValue={0} label="Impressions" name="impression_count" />
        <MetricInput defaultValue={0} label="Likes" name="like_count" />
        <MetricInput defaultValue={0} label="Replies" name="reply_count" />
        <MetricInput defaultValue={0} label="Reposts" name="repost_count" />
        <MetricInput defaultValue={0} label="Quotes" name="quote_count" />
        <MetricInput defaultValue={0} label="Bookmarks" name="bookmark_count" />
      </div>
      <div className="post-history-checks">
        <Checkbox defaultChecked defaultFalse label="Owner post" name="is_owner_post" />
        <Checkbox defaultFalse label="Contains media" name="has_media" />
        <Checkbox defaultFalse label="Contains link" name="has_link" />
      </div>
      <SubmitButton size="sm">Save post</SubmitButton>
    </form>
  );
}

function ImportPostsForm({ action }: { action?: FormAction }) {
  return (
    <form action={action} className="post-history-form">
      <RuleHeader folio="§ 02" id="post-history-import-title" label="Import CSV / JSON" sub="manual fallback" />
      <Select
        defaultValue="csv"
        label="Mode"
        name="mode"
        options={[{ label: "CSV", value: "csv" }, { label: "JSON", value: "json" }]}
      />
      <Textarea label="Payload" mono name="payload" placeholder="Paste CSV headers or JSON array" required />
      <SubmitButton size="sm" variant="secondary">Import posts</SubmitButton>
    </form>
  );
}

function AggregateTable({ groups, title }: { groups: AggregateGroup[]; title: string }) {
  return (
    <Card className="post-history-aggregate" variant="inset">
      <Card.Header>
        <h3 className="post-history-card-title smallcaps">{title}</h3>
      </Card.Header>
      <Card.Body>
        {groups.length > 0 ? (
          <Table
            columns={[
              { header: "Group", key: "group" },
              { header: "Count", key: "count", numeric: true },
              { header: "Score", key: "score", numeric: true },
            ]}
            rows={groups.slice(0, 5).map((group) => ({
              count: group.count,
              group: group.label,
              id: `${title}-${group.key}`,
              score: formatScore(group.averageHeuristicScore),
            }))}
          />
        ) : (
          <p className="post-history-muted">No rows match this filter.</p>
        )}
      </Card.Body>
    </Card>
  );
}

function PostInspector({ action, post }: { action?: FormAction; post: PostHistoryPost }) {
  const score = Math.round(post.heuristicScore ?? 0);

  return (
    <section aria-labelledby="post-history-detail-title" className="post-history-inspector">
      <RuleHeader folio="§ 04" id="post-history-detail-title" label="Detail inspector" sub={post.platformPostId ?? post.id} />
      <ScoreGauge label="Heuristic score" value={score} />
      <Card variant="inset">
        <Card.Header>
          <h3 className="post-history-card-title smallcaps">Score explanation</h3>
        </Card.Header>
        <Card.Body>
          <KeyValueRow label="Engagement" mono value={formatScore(post.engagementScore)} />
          <KeyValueRow label="Virality" mono value={formatScore(post.viralityScore)} />
          <KeyValueRow label="Performance" value={<Badge variant={badgeForPerformance(post.performanceBucket)}>{post.performanceBucket ?? "unknown"}</Badge>} />
          <KeyValueRow label="Length" value={post.lengthBucket ?? "unknown"} />
          <KeyValueRow label="Hook" value={post.hookType ?? "unknown"} />
          <KeyValueRow label="Format" value={post.format ?? "unknown"} />
        </Card.Body>
      </Card>
      <form action={action} className="post-history-form post-history-edit-form">
        <RuleHeader folio="§ 05" id="post-history-edit-title" label="Edit metrics" sub="snapshot created on save" />
        <input name="id" type="hidden" value={post.id} />
        <div className="post-history-form-grid">
          <MetricInput defaultValue={post.impressionCount} label="Impressions" name="impression_count" />
          <MetricInput defaultValue={post.likeCount} label="Likes" name="like_count" />
          <MetricInput defaultValue={post.replyCount} label="Replies" name="reply_count" />
          <MetricInput defaultValue={post.repostCount} label="Reposts" name="repost_count" />
          <MetricInput defaultValue={post.quoteCount} label="Quotes" name="quote_count" />
          <MetricInput defaultValue={post.bookmarkCount} label="Bookmarks" name="bookmark_count" />
          <Input defaultValue={post.topic ?? ""} label="Topic" name="topic" />
          <Input defaultValue={post.format ?? ""} label="Format" name="format" />
          <Input defaultValue={post.hookType ?? ""} label="Hook" name="hook_type" />
          <Input defaultValue={post.tone ?? ""} label="Tone" name="tone" />
        </div>
        <SubmitButton size="sm">Recalculate scores</SubmitButton>
      </form>
    </section>
  );
}

function noticeText(notice?: null | string) {
  if (notice === "post_created") return "Manual post saved and scored.";
  if (notice === "metrics_updated") return "Metrics updated, score recalculated, and snapshot recorded.";
  if (notice?.startsWith("imported_")) return notice.replace("imported_", "Imported ").replaceAll("_", " ");
  if (notice === "import_failed") return "Import completed with validation errors. No unsafe text was treated as instructions.";
  return null;
}

export function PostHistoryView({
  aggregates,
  createAction,
  filters,
  importAction,
  notice,
  posts,
  selectedPost,
  updateAction,
}: PostHistoryViewProps) {
  const selectedId = selectedPost?.id;
  const noticeCopy = noticeText(notice);

  return (
    <main aria-labelledby="post-history-title" className="post-history-page">
      <RuleHeader
        actions={<Badge variant="outline">X API not required</Badge>}
        as="h1"
        folio="§ 09"
        id="post-history-title"
        label="Post history"
        sub="manual imports and deterministic scoring"
      />
      {noticeCopy ? (
        <div aria-live="polite" className="post-history-notice" role="status">
          {noticeCopy}
        </div>
      ) : null}
      <section aria-labelledby="post-history-summary-title" className="post-history-metrics">
        <RuleHeader className="visually-hidden" folio="§" id="post-history-summary-title" label="Post history summary" />
        <MetricBlock label="Visible posts" value={formatNumber(posts.length)} />
        <MetricBlock label="Total impressions" value={formatNumber(posts.reduce((sum, post) => sum + post.impressionCount, 0))} />
        <MetricBlock label="Avg heuristic" value={formatScore(posts.reduce((sum, post) => sum + (post.heuristicScore ?? 0), 0) / Math.max(1, posts.length))} />
        <MetricBlock label="Owner posts" value={formatNumber(posts.filter((post) => post.isOwnerPost).length)} />
      </section>
      <section className="post-history-workbench">
        <div className="post-history-main">
          <Card>
            <Card.Body>
              <PostFilters filters={filters} />
            </Card.Body>
          </Card>
          <div className="post-history-action-grid">
            <Card>
              <Card.Body>
                <ManualPostForm action={createAction} />
              </Card.Body>
            </Card>
            <Card>
              <Card.Body>
                <ImportPostsForm action={importAction} />
              </Card.Body>
            </Card>
          </div>
          <section aria-labelledby="post-history-list-title" className="post-history-list">
            <RuleHeader className="visually-hidden" folio="§" id="post-history-list-title" label="Posts" />
            {posts.length > 0 ? (
              posts.map((post) => (
                <PostRow
                  href={`/post-history?selected=${post.id}`}
                  key={post.id}
                  post={post}
                  selected={post.id === selectedId}
                />
              ))
            ) : (
              <EmptyState
                message="Add a post manually or paste CSV/JSON export data to build the local performance archive."
                title="No imported posts yet"
              />
            )}
          </section>
          <section aria-labelledby="post-history-aggregates-title" className="post-history-aggregates">
            <RuleHeader folio="§ 03" id="post-history-aggregates-title" label="Aggregates" sub="current filters" />
            <div className="post-history-aggregate-grid">
              <AggregateTable groups={aggregates.topic} title="Topic" />
              <AggregateTable groups={aggregates.format} title="Format" />
              <AggregateTable groups={aggregates.dayOfWeek} title="Day" />
              <AggregateTable groups={aggregates.hour} title="Hour" />
            </div>
          </section>
        </div>
        {selectedPost ? <PostInspector action={updateAction} post={selectedPost} /> : null}
      </section>
    </main>
  );
}

export function hiddenPostHistoryFilters(filters: PostHistoryFilters): ReactNode {
  return (
    <>
      {hiddenIfValue("q", filters.q)}
      {hiddenIfValue("from", filters.from)}
      {hiddenIfValue("to", filters.to)}
      {hiddenIfValue("topic", filters.topic)}
      {hiddenIfValue("format", filters.format)}
      {hiddenIfValue("hook_type", filters.hook_type)}
      {hiddenIfValue("tone", filters.tone)}
      {hiddenIfValue("source", filters.source)}
      {hiddenIfValue("performance", filters.performance)}
      {hiddenIfValue("media", filters.media)}
      {hiddenIfValue("link", filters.link)}
      {hiddenIfValue("owner", filters.owner)}
      {hiddenIfValue("sort", filters.sort)}
    </>
  );
}
