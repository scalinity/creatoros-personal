import Link from "next/link";
import type { ComponentProps } from "react";

import { Badge, Button, Card, EmptyState, Input, KeyValueRow, MetricBlock, RuleHeader, Select, Table, Textarea, cn } from "@/components/design-system";
import type { BlogDetail, BlogRecord, BlogWorkspace } from "@/lib/blogs";

export type FormAction = ComponentProps<"form">["action"];

type BlogFilters = {
  notice?: string;
  q?: string;
  selected?: string;
  status?: string;
  tag?: string;
};

export type BlogWorkspaceViewProps = BlogWorkspace & {
  filters: BlogFilters;
};

export type NewBlogViewProps = {
  createAction?: FormAction;
  notice?: string;
};

export type BlogDetailViewProps = {
  aiEditorAction?: FormAction;
  createDraftAction?: FormAction;
  detail: BlogDetail;
  exportActionBase: string;
  generateDraftAction?: FormAction;
  generateOutlineAction?: FormAction;
  generateSeoAction?: FormAction;
  notice?: string;
  repurposeAction?: FormAction;
  updateAction?: FormAction;
};

const statusOptions = [
  { label: "Idea", value: "idea" },
  { label: "Outlining", value: "outlining" },
  { label: "Drafting", value: "drafting" },
  { label: "Editing", value: "editing" },
  { label: "Ready", value: "ready" },
  { label: "Exported", value: "exported" },
  { label: "Published externally", value: "published_externally" },
  { label: "Archived", value: "archived" },
];

const filterStatusOptions = [{ label: "Working", value: "" }, { label: "All", value: "all" }, ...statusOptions];

const sourceOptions = [
  { label: "Manual", value: "manual" },
  { label: "Content idea", value: "content_idea" },
  { label: "X post", value: "post" },
  { label: "Brain dump", value: "brain_dump" },
  { label: "Generated output", value: "generated_output" },
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

function formatList(items: string[]) {
  return items.length > 0 ? items.join(", ") : "none";
}

function statusBadgeVariant(status: string) {
  if (status === "ready" || status === "exported" || status === "published_externally") return "success";
  if (status === "drafting" || status === "editing" || status === "outlining") return "accent";
  if (status === "archived") return "outline";
  return "warning";
}

function noticeText(notice?: string) {
  if (!notice) return null;
  if (notice === "blog_created") return "Blog created with an initial version.";
  if (notice === "blog_updated") return "Blog saved and versioned where content changed.";
  if (notice === "outline_generated") return "AI outline generated and saved as a blog version.";
  if (notice === "draft_generated") return "AI full draft generated and saved for owner editing.";
  if (notice === "editor_applied") return "AI editor pass applied with a new version.";
  if (notice === "seo_generated") return "SEO metadata generated and saved.";
  if (notice === "repurposed_to_x") return "Blog-to-X outputs saved to generated outputs. Nothing was published.";
  if (notice === "rate_limited") return "Blog workflow rate limit reached. Try again after the window resets.";
  if (notice.endsWith("failed")) return "The blog request failed validation or could not be completed safely.";
  return null;
}

function Notice({ notice }: { notice?: string }) {
  const text = noticeText(notice);
  if (!text) return null;
  return <div className={cn("blog-notice", notice?.endsWith("failed") && "blog-notice-danger", notice === "rate_limited" && "blog-notice-warning")}>{text}</div>;
}

function BlogFilters({ filters }: { filters: BlogFilters }) {
  return (
    <form className="blog-filters" method="get">
      <Input defaultValue={filters.q ?? ""} label="Search" name="q" placeholder="Title, slug, tag, source" />
      <Select defaultValue={filters.status ?? ""} label="Status" name="status" options={filterStatusOptions} />
      <Input defaultValue={filters.tag ?? ""} label="Tag" name="tag" placeholder="systems" />
      <div className="blog-filter-actions">
        <Button size="sm" type="submit" variant="secondary">
          Apply
        </Button>
        <Link className="blog-reset" href="/blogs">
          Reset
        </Link>
      </div>
    </form>
  );
}

function BlogRow({ blog, selected }: { blog: BlogRecord; selected?: boolean }) {
  return (
    <article className={cn("blog-row", selected && "blog-row-selected")}>
      <Link className="blog-row-link" href={`/blogs/${blog.id}`}>
        <span className="blog-row-main">
          <span className="blog-row-title">{blog.title}</span>
          <span className="blog-row-meta mono">/{blog.slug ?? "unslugged"}</span>
        </span>
        <span className="blog-row-badges">
          <Badge variant={statusBadgeVariant(blog.status)}>{blog.status}</Badge>
          <Badge variant="outline">{blog.wordCount} words</Badge>
          <Badge variant="outline">{blog.exportCount} exports</Badge>
        </span>
        <span className="blog-row-foot">
          <span>{formatList(blog.tags)}</span>
          <span className="mono">{formatDate(blog.updatedAt)}</span>
        </span>
      </Link>
    </article>
  );
}

function BlogList({ blogs, selectedBlog }: Pick<BlogWorkspace, "blogs" | "selectedBlog">) {
  if (blogs.length === 0) {
    return <EmptyState action={<Link className="btn btn-secondary btn-sm" href="/blogs/new"><span className="btn-label">Draft blog</span></Link>} message="Create a blank blog or link an existing idea, post, brain dump, or generated output." title="No blogs in this view" />;
  }

  return (
    <section className="blog-list" aria-label="Blog archive">
      {blogs.map((blog) => (
        <BlogRow blog={blog} key={blog.id} selected={blog.id === selectedBlog?.id} />
      ))}
    </section>
  );
}

export function BlogWorkspaceView({ blogs, filters, selectedBlog }: BlogWorkspaceViewProps) {
  return (
    <main className="blog-page" aria-labelledby="blogs-title">
      <h1 className="workflow-title" id="blogs-title">Blogs</h1>
      <RuleHeader actions={<Link className="btn btn-primary btn-sm" href="/blogs/new"><span className="btn-label">New blog</span></Link>} folio="§ 14" label="Blogs" sub="long-form archive" />
      <Notice notice={filters.notice} />
      <section className="blog-metrics" aria-label="Blog summary">
        <MetricBlock label="Visible blogs" value={blogs.length} />
        <MetricBlock label="Ready/exported" value={blogs.filter((blog) => ["ready", "exported"].includes(blog.status)).length} />
        <MetricBlock label="Total words" value={blogs.reduce((sum, blog) => sum + blog.wordCount, 0)} />
        <MetricBlock label="Recent exports" value={blogs.reduce((sum, blog) => sum + blog.exportCount, 0)} />
      </section>
      <section className="blog-workbench">
        <div className="blog-main">
          <BlogFilters filters={filters} />
          <BlogList blogs={blogs} selectedBlog={selectedBlog} />
        </div>
        <aside className="blog-inspector">
          <Card>
            <Card.Header>
              <RuleHeader folio="§" label="Selection" sub="metadata" />
            </Card.Header>
            <Card.Body>
              {selectedBlog ? (
                <>
                  <KeyValueRow label="Title" value={selectedBlog.title} />
                  <KeyValueRow label="Status" value={<Badge variant={statusBadgeVariant(selectedBlog.status)}>{selectedBlog.status}</Badge>} />
                  <KeyValueRow label="Slug" mono value={selectedBlog.slug ?? "none"} />
                  <KeyValueRow label="Source" value={selectedBlog.sourceType ?? "manual"} />
                  <KeyValueRow label="Updated" mono value={formatDate(selectedBlog.updatedAt)} />
                </>
              ) : (
                <p className="blog-muted">No blog selected.</p>
              )}
            </Card.Body>
          </Card>
        </aside>
      </section>
    </main>
  );
}

export function NewBlogView({ createAction, notice }: NewBlogViewProps) {
  return (
    <main className="blog-page" aria-labelledby="new-blog-title">
      <h1 className="workflow-title" id="new-blog-title">New blog</h1>
      <RuleHeader actions={<Link className="btn btn-secondary btn-sm" href="/blogs"><span className="btn-label">Back to blogs</span></Link>} folio="§ 14.1" label="New blog" sub="blank or sourced" />
      <Notice notice={notice} />
      <section className="blog-workbench blog-workbench-single">
        <Card>
          <Card.Body>
            <form action={createAction} className="blog-editor-form">
              <RuleHeader folio="§ 01" label="Draft seed" sub="create version 1" />
              <Input label="Title" name="title" placeholder="Working blog title" required />
              <Textarea label="Markdown" name="markdown" placeholder="# Working title\n\nStart the long-form draft here." required rows={12} />
              <div className="blog-form-grid">
                <Select defaultValue="manual" label="Source" name="source_type" options={sourceOptions} />
                <Input label="Source id" mono name="source_id" placeholder="Optional UUID" />
                <Select defaultValue="idea" label="Status" name="status" options={statusOptions} />
              </div>
              <div className="blog-form-grid">
                <Input label="Slug" name="slug" placeholder="auto-generated if blank" />
                <Input label="Tags" name="tags" placeholder="systems, writing" />
                <Input label="Categories" name="categories" placeholder="craft" />
              </div>
              <Button type="submit">Create blog</Button>
            </form>
          </Card.Body>
        </Card>
      </section>
    </main>
  );
}

function BlogMetadata({ blog }: { blog: BlogRecord }) {
  return (
    <Card>
      <Card.Header>
        <RuleHeader folio="§ 02" label="Metadata" sub="SEO and source" />
      </Card.Header>
      <Card.Body>
        <KeyValueRow label="Status" value={<Badge variant={statusBadgeVariant(blog.status)}>{blog.status}</Badge>} />
        <KeyValueRow label="Slug" mono value={blog.slug ?? "none"} />
        <KeyValueRow label="SEO title" value={blog.seoTitle ?? "none"} />
        <KeyValueRow label="Meta" value={blog.metaDescription ?? "none"} />
        <KeyValueRow label="Summary" value={blog.canonicalSummary ?? "none"} />
        <KeyValueRow label="Tags" value={formatList(blog.tags)} />
        <KeyValueRow label="Categories" value={formatList(blog.categories)} />
        <KeyValueRow label="Source" value={`${blog.sourceType ?? "manual"}${blog.sourceId ? ` / ${blog.sourceId}` : ""}`} />
      </Card.Body>
    </Card>
  );
}

function VersionTimeline({ versions }: Pick<BlogDetail, "versions">) {
  return (
    <Card>
      <Card.Header>
        <RuleHeader folio="§ 03" label="Version timeline" sub={`${versions.length} saved`} />
      </Card.Header>
      <Card.Body>
        {versions.length > 0 ? (
          <Table
            aria-label="Blog version timeline"
            columns={[
              { header: "Version", key: "version", numeric: true },
              { header: "By", key: "by" },
              { header: "Reason", key: "reason" },
              { header: "Created", key: "created" },
            ]}
            rows={versions.map((version) => ({
              by: <Badge variant={version.createdBy === "ai" ? "accent" : "outline"}>{version.createdBy}</Badge>,
              created: <span className="mono">{formatDate(version.createdAt)}</span>,
              id: version.id,
              reason: version.changeReason ?? version.promptVersion ?? "saved version",
              version: version.versionNumber,
            }))}
          />
        ) : (
          <EmptyState message="The next content edit or AI generation will create a version." title="No versions yet" />
        )}
      </Card.Body>
    </Card>
  );
}

function ExportPanel({ actionBase, exports }: { actionBase: string; exports: BlogDetail["exports"] }) {
  return (
    <Card>
      <Card.Header>
        <RuleHeader folio="§ 04" label="Export panel" sub="markdown, html, json, mdx" />
      </Card.Header>
      <Card.Body>
        <div className="blog-export-actions">
          {[
            ["markdown", "Markdown"],
            ["html", "HTML"],
            ["json", "JSON"],
            ["mdx", "MDX-ready"],
          ].map(([format, label]) => (
            <form action={actionBase} key={format} method="post">
              <input name="format" type="hidden" value={format} />
              <Button size="sm" type="submit" variant="secondary">
                {label}
              </Button>
            </form>
          ))}
        </div>
        {exports.length > 0 ? (
          <Table
            aria-label="Blog export history"
            columns={[
              { header: "Format", key: "format" },
              { header: "Checksum", key: "checksum" },
              { header: "Exported", key: "exported" },
            ]}
            rows={exports.map((item) => ({
              checksum: <span className="mono">{item.checksum?.slice(0, 12) ?? "none"}</span>,
              exported: <span className="mono">{formatDate(item.exportedAt)}</span>,
              format: <Badge variant="outline">{item.format}</Badge>,
              id: item.id,
            }))}
          />
        ) : (
          <p className="blog-muted">No export artifacts yet.</p>
        )}
      </Card.Body>
    </Card>
  );
}

function AiPanel({ aiEditorAction, blog, generateDraftAction, generateOutlineAction, generateSeoAction, repurposeAction }: Pick<BlogDetailViewProps, "aiEditorAction" | "generateDraftAction" | "generateOutlineAction" | "generateSeoAction" | "repurposeAction"> & { blog: BlogRecord }) {
  return (
    <Card>
      <Card.Header>
        <RuleHeader folio="§ 05" label="AI assists" sub="drafting only" />
      </Card.Header>
      <Card.Body>
        <div className="blog-ai-grid">
          <AiActionForm action={generateOutlineAction} blogId={blog.id} label="Generate outline" mode="outline" />
          <AiActionForm action={generateDraftAction} blogId={blog.id} label="Generate full draft" mode="draft" />
          <AiActionForm action={aiEditorAction} blogId={blog.id} label="Apply editor pass" mode="editor" />
          <AiActionForm action={generateSeoAction} blogId={blog.id} label="Generate SEO" mode="seo" />
          <AiActionForm action={repurposeAction} blogId={blog.id} label="Repurpose to X" mode="blog_to_x" />
        </div>
        <p className="blog-muted">AI outputs stay local as blog versions or generated outputs. This panel cannot publish or approve content.</p>
      </Card.Body>
    </Card>
  );
}

function PublishingHandoffPanel({ action, blog }: { action?: FormAction; blog: BlogRecord }) {
  return (
    <Card>
      <Card.Header>
        <RuleHeader folio="§ 06" label="Publishing handoff" sub="approval queue" />
      </Card.Header>
      <Card.Body>
        <p className="blog-muted">Create a dry-run publishing draft from this blog. The queue will require exact owner approval before scheduling or dry-run execution.</p>
        <form action={action} className="blog-export-actions">
          <input name="source_type" type="hidden" value="blog_post" />
          <input name="source_id" type="hidden" value={blog.id} />
          <input name="content_type" type="hidden" value="blog_to_x_thread" />
          <Button size="sm" type="submit" variant="secondary">
            Create publishing draft
          </Button>
        </form>
      </Card.Body>
    </Card>
  );
}

function AiActionForm({ action, blogId, label, mode }: { action?: FormAction; blogId: string; label: string; mode: string }) {
  return (
    <form action={action} className="blog-ai-action">
      <input name="blog_id" type="hidden" value={blogId} />
      <input name="mode" type="hidden" value={mode} />
      <Input label={`${label} notes`} name="owner_notes" placeholder="Optional direction" />
      <Button size="sm" type="submit" variant="secondary">
        {label}
      </Button>
    </form>
  );
}

export function BlogDetailView({
  aiEditorAction,
  createDraftAction,
  detail,
  exportActionBase,
  generateDraftAction,
  generateOutlineAction,
  generateSeoAction,
  notice,
  repurposeAction,
  updateAction,
}: BlogDetailViewProps) {
  const { blog } = detail;

  return (
    <main className="blog-page" aria-labelledby="blog-detail-title">
      <h1 className="workflow-title" id="blog-detail-title">{blog.title}</h1>
      <RuleHeader actions={<Link className="btn btn-secondary btn-sm" href="/blogs"><span className="btn-label">Back to blogs</span></Link>} folio="§ 14.2" label="Blog editor" sub={blog.status} />
      <Notice notice={notice} />
      <section className="blog-detail-metrics" aria-label="Blog metrics">
        <MetricBlock label="Words" value={blog.wordCount} />
        <MetricBlock label="Read" value={`${blog.readingTimeMinutes} min`} />
        <MetricBlock label="Versions" value={detail.versions.length} />
        <MetricBlock label="Exports" value={detail.exports.length} />
      </section>
      <section className="blog-detail-workbench">
        <div className="blog-detail-main">
          <form action={updateAction} className="blog-editor-form">
            <input name="id" type="hidden" value={blog.id} />
            <RuleHeader folio="§ 01" label="Blog editor" sub="markdown body" />
            <Input defaultValue={blog.title} label="Title" name="title" required />
            <div className="blog-form-grid">
              <Input defaultValue={blog.slug ?? ""} label="Slug" name="slug" />
              <Select defaultValue={blog.status} label="Status" name="status" options={statusOptions} />
              <Input defaultValue={blog.tags.join(", ")} label="Tags" name="tags" />
            </div>
            <div className="blog-form-grid">
              <Input defaultValue={blog.categories.join(", ")} label="Categories" name="categories" />
              <Input defaultValue={blog.seoTitle ?? ""} label="SEO title" name="seo_title" />
              <Input defaultValue={blog.metaDescription ?? ""} label="Meta description" name="meta_description" />
            </div>
            <Textarea defaultValue={blog.canonicalSummary ?? ""} label="Canonical summary" name="canonical_summary" rows={3} />
            <Textarea className="blog-markdown-field" defaultValue={blog.markdown} label="Markdown" name="markdown" required rows={22} />
            <Input label="Change reason" name="change_reason" placeholder="What changed in this version?" />
            <Button type="submit">Save blog</Button>
          </form>
          <AiPanel aiEditorAction={aiEditorAction} blog={blog} generateDraftAction={generateDraftAction} generateOutlineAction={generateOutlineAction} generateSeoAction={generateSeoAction} repurposeAction={repurposeAction} />
          <PublishingHandoffPanel action={createDraftAction} blog={blog} />
        </div>
        <aside className="blog-detail-inspector">
          <BlogMetadata blog={blog} />
          <VersionTimeline versions={detail.versions} />
          <ExportPanel actionBase={exportActionBase} exports={detail.exports} />
        </aside>
      </section>
    </main>
  );
}
